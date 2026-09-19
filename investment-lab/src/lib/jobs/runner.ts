import { formatInTimeZone } from "date-fns-tz";
import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";
import { config } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { jobLocks, researchRuns } from "@/lib/db/schema";
import { ensureTables } from "@/lib/db/migrate";
import { runResearchPipeline } from "@/lib/research/pipeline";
import { isTradingDay } from "@/lib/providers/calendar/exchange";

const LOCK_NAME = "research_pipeline";
const LOCK_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;

export function researchIdempotencyKey(
  date = new Date(),
  tz = config.timezone,
): string {
  const day = formatInTimeZone(date, tz, "yyyy-MM-dd");
  return `research:${day}:${tz}`;
}

export async function acquireJobLock(
  name: string,
  owner: string,
  ttlMs = LOCK_TTL_MS,
): Promise<boolean> {
  const db = getDb();
  const now = new Date();
  const until = new Date(now.getTime() + ttlMs).toISOString();
  const existing = await db.query.jobLocks.findFirst({
    where: eq(jobLocks.name, name),
  });
  if (existing) {
    if (new Date(existing.lockedUntil) > now && existing.owner !== owner) {
      return false;
    }
    await db
      .update(jobLocks)
      .set({ lockedUntil: until, owner })
      .where(eq(jobLocks.name, name));
    return true;
  }
  await db.insert(jobLocks).values({
    name,
    lockedUntil: until,
    owner,
  });
  return true;
}

export async function releaseJobLock(name: string, owner: string): Promise<void> {
  const db = getDb();
  const existing = await db.query.jobLocks.findFirst({
    where: eq(jobLocks.name, name),
  });
  if (existing?.owner === owner) {
    await db
      .update(jobLocks)
      .set({ lockedUntil: new Date(0).toISOString(), owner: "" })
      .where(eq(jobLocks.name, name));
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export interface RunJobOptions {
  /** Force a specific idempotency key (tests) */
  idempotencyKey?: string;
  trigger?: "manual" | "cron" | "catch_up";
  timeoutMs?: number;
  now?: Date;
}

export interface RunJobResult {
  runId: string;
  status: "succeeded" | "failed" | "already_succeeded" | "locked" | "skipped";
  idempotencyKey: string;
  message?: string;
}

async function findByIdempotency(key: string) {
  const db = getDb();
  return db.query.researchRuns.findFirst({
    where: eq(researchRuns.idempotencyKey, key),
  });
}

export async function startResearchJob(
  opts: RunJobOptions = {},
): Promise<RunJobResult> {
  await ensureTables();
  const now = opts.now ?? new Date();
  const key = opts.idempotencyKey ?? researchIdempotencyKey(now);
  const owner = uuid();
  const mode = config.demoMode ? "demo" : "live";

  const existing = await findByIdempotency(key);
  if (existing?.status === "succeeded") {
    return {
      runId: existing.id,
      status: "already_succeeded",
      idempotencyKey: key,
      message: "Idempotent hit — prior success",
    };
  }
  if (existing?.status === "running") {
    return {
      runId: existing.id,
      status: "locked",
      idempotencyKey: key,
      message: "Run already in progress",
    };
  }

  const gotLock = await acquireJobLock(LOCK_NAME, owner);
  if (!gotLock) {
    return {
      runId: existing?.id ?? "",
      status: "locked",
      idempotencyKey: key,
      message: "Could not acquire job lock",
    };
  }

  const db = getDb();
  let runId = existing?.id ?? uuid();
  const attempt = (existing?.attempt ?? 0) + 1;

  if (existing) {
    await db
      .update(researchRuns)
      .set({
        status: "running",
        startedAt: now.toISOString(),
        attempt,
        progress: 0,
        currentStep: "starting",
        mode,
      })
      .where(eq(researchRuns.id, runId));
  } else {
    await db.insert(researchRuns).values({
      id: runId,
      status: "running",
      mode,
      idempotencyKey: key,
      startedAt: now.toISOString(),
      progress: 0,
      currentStep: "starting",
      errorHistory: [],
      attempt,
    });
  }

  const timeoutMs = opts.timeoutMs ?? 120_000;

  try {
    await Promise.race([
      runWithRetries(runId, attempt, timeoutMs),
      sleep(timeoutMs).then(() => {
        throw new Error(`Research job timed out after ${timeoutMs}ms`);
      }),
    ]);

    await db
      .update(researchRuns)
      .set({
        status: "succeeded",
        finishedAt: new Date().toISOString(),
        progress: 100,
        currentStep: "done",
      })
      .where(eq(researchRuns.id, runId));

    return { runId, status: "succeeded", idempotencyKey: key };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const prev = existing?.errorHistory ?? [];
    const errorHistory = [
      ...(Array.isArray(prev) ? prev : []),
      { at: new Date().toISOString(), message },
    ];
    await db
      .update(researchRuns)
      .set({
        status: "failed",
        finishedAt: new Date().toISOString(),
        errorHistory,
        currentStep: "failed",
      })
      .where(eq(researchRuns.id, runId));

    return { runId, status: "failed", idempotencyKey: key, message };
  } finally {
    await releaseJobLock(LOCK_NAME, owner);
  }
}

async function runWithRetries(
  runId: string,
  startAttempt: number,
  _timeoutMs: number,
) {
  let attempt = startAttempt;
  let lastErr: unknown;
  while (attempt <= MAX_ATTEMPTS) {
    try {
      await runResearchPipeline(runId, async (progress, step) => {
        const db = getDb();
        await db
          .update(researchRuns)
          .set({ progress, currentStep: step })
          .where(eq(researchRuns.id, runId));
      });
      return;
    } catch (err) {
      lastErr = err;
      const message = err instanceof Error ? err.message : String(err);
      const db = getDb();
      const row = await db.query.researchRuns.findFirst({
        where: eq(researchRuns.id, runId),
      });
      const history = [
        ...((row?.errorHistory as Array<{ at: string; message: string }>) ??
          []),
        { at: new Date().toISOString(), step: row?.currentStep ?? undefined, message },
      ];
      await db
        .update(researchRuns)
        .set({ attempt, errorHistory: history })
        .where(eq(researchRuns.id, runId));
      if (attempt >= MAX_ATTEMPTS) break;
      await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
      attempt++;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Catch-up: if configured, run once for the most recent missed weekday key.
 */
export async function maybeCatchUpMissedRun(
  now = new Date(),
): Promise<RunJobResult | null> {
  if (!config.catchUpMissedRuns) return null;
  const tz = config.timezone;
  const todayKey = researchIdempotencyKey(now, tz);

  // Walk back up to 5 weekdays looking for a missing success
  const cursor = new Date(now);
  for (let i = 0; i < 7; i++) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    const dayStr = formatInTimeZone(cursor, tz, "yyyy-MM-dd");
    // Use NYSE weekday as proxy for "research weekday"
    if (!isTradingDay(dayStr, "NYSE")) continue;
    const key = `research:${dayStr}:${tz}`;
    if (key === todayKey) continue;
    const existing = await findByIdempotency(key);
    if (!existing || existing.status === "failed") {
      return startResearchJob({
        idempotencyKey: key,
        trigger: "catch_up",
        now: cursor,
      });
    }
    // Found a completed older run — only catch up the single most recent miss
    if (existing.status === "succeeded") {
      return null;
    }
  }
  return null;
}

export async function listRecentJobs(limit = 20) {
  const db = getDb();
  const rows = await db.query.researchRuns.findMany({
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    limit,
  });
  return rows;
}

export async function getLatestRunStatus() {
  const db = getDb();
  const latest = await db.query.researchRuns.findMany({
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    limit: 1,
  });
  const lastSuccess = await db.query.researchRuns.findFirst({
    where: eq(researchRuns.status, "succeeded"),
    orderBy: (t, { desc }) => [desc(t.finishedAt)],
  });
  return { latest: latest[0] ?? null, lastSuccess: lastSuccess ?? null };
}
