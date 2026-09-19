import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

async function withTempDb(fn: () => Promise<void>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ilab-"));
  const dbPath = path.join(dir, "test.db");
  process.env.DEMO_MODE = "true";
  process.env.LIBSQL_URL = `file:${dbPath.replace(/\\/g, "/")}`;
  process.env.AUTH_PASSWORD = "";

  // Reset module singletons
  const clientMod = await import("@/lib/db/client");
  clientMod.resetDbSingletons();

  try {
    await fn();
  } finally {
    clientMod.resetDbSingletons();
    // Windows may keep a file lock briefly; don't fail the test on cleanup
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore EPERM
    }
  }
}

describe("idempotent jobs", () => {
  beforeEach(() => {
    process.env.DEMO_MODE = "true";
  });

  afterEach(() => {
    delete process.env.LIBSQL_URL;
  });

  it("second start with same key returns already_succeeded", async () => {
    await withTempDb(async () => {
      const { ensureTables } = await import("@/lib/db/migrate");
      const { seedDemo } = await import("@/lib/db/seed");
      const { startResearchJob } = await import("@/lib/jobs/runner");

      await ensureTables();
      await seedDemo();

      const key = "research:test-idempotent:Europe/London";
      const first = await startResearchJob({
        idempotencyKey: key,
        timeoutMs: 180_000,
      });
      expect(["succeeded", "already_succeeded"]).toContain(first.status);
      expect(first.status).toBe("succeeded");

      const second = await startResearchJob({
        idempotencyKey: key,
        timeoutMs: 180_000,
      });
      expect(second.status).toBe("already_succeeded");
      expect(second.runId).toBe(first.runId);
    });
  }, 180_000);
});

describe("failed run preserves published snapshot", () => {
  it("keeps prior published=true when a later run fails before publish", async () => {
    await withTempDb(async () => {
      const { ensureTables } = await import("@/lib/db/migrate");
      const { getDb } = await import("@/lib/db/client");
      const { researchRuns, researchSnapshots } = await import(
        "@/lib/db/schema"
      );
      const { publishSnapshot, getPublishedCount } = await import(
        "@/lib/research/publish"
      );
      const { v4: uuid } = await import("uuid");

      await ensureTables();
      const db = getDb();

      const run1 = uuid();
      const snap1 = uuid();
      await db.insert(researchRuns).values({
        id: run1,
        status: "succeeded",
        mode: "demo",
        idempotencyKey: "research:preserve-1:Europe/London",
        progress: 100,
        errorHistory: [],
        attempt: 1,
      });
      await db.insert(researchSnapshots).values({
        id: snap1,
        runId: run1,
        published: false,
        strategyVersion: "0.1.0",
        payload: { ok: true },
      });

      const { recommendations } = await import("@/lib/db/schema");
      await db.insert(recommendations).values({
        id: uuid(),
        snapshotId: snap1,
        symbol: "AAPL",
        rank: 1,
        overallScore: 50,
        componentScores: {},
        action: "hold",
        dataQuality: { coverage: 1, missingFields: [], stale: false, notes: [] },
      });
      await publishSnapshot(snap1);
      expect(await getPublishedCount()).toBe(1);

      // Simulate failed run with unpublished snapshot
      const run2 = uuid();
      const snap2 = uuid();
      await db.insert(researchRuns).values({
        id: run2,
        status: "failed",
        mode: "demo",
        idempotencyKey: "research:preserve-2:Europe/London",
        progress: 50,
        errorHistory: [{ at: new Date().toISOString(), message: "boom" }],
        attempt: 1,
      });
      await db.insert(researchSnapshots).values({
        id: snap2,
        runId: run2,
        published: false,
        strategyVersion: "0.1.0",
        payload: { incomplete: true },
      });

      expect(await getPublishedCount()).toBe(1);
      const published = await db.query.researchSnapshots.findFirst({
        where: eq(researchSnapshots.published, true),
      });
      expect(published?.id).toBe(snap1);
    });
  });
});
