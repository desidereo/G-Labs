import { NextResponse } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import { config } from "@/lib/config";
import {
  startResearchJob,
  maybeCatchUpMissedRun,
  researchIdempotencyKey,
} from "@/lib/jobs/runner";
import { ensureTables } from "@/lib/db/migrate";
import { seedDemo } from "@/lib/db/seed";
import { isTradingDay } from "@/lib/providers/calendar/exchange";

/**
 * Cron entry — Bearer CRON_SECRET only (also enforced in middleware).
 * Vercel cron is UTC; we validate Europe/London weekday + ±30m window around schedule.
 *
 * vercel.json uses `30 21 * * 1-5` as a UTC approximation for 22:30 BST.
 * During GMT (winter), 22:30 London = 22:30 UTC — the app window check is authoritative.
 */
export async function GET(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!config.cronSecret || token !== config.cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureTables();
  await seedDemo();

  const now = new Date();
  const tz = config.timezone;
  const localDay = formatInTimeZone(now, tz, "yyyy-MM-dd");
  const localHm = formatInTimeZone(now, tz, "HH:mm");
  const dow = formatInTimeZone(now, tz, "i"); // 1=Mon .. 7=Sun (date-fns)

  if (!isTradingDay(localDay, "NYSE")) {
    return NextResponse.json({
      skipped: true,
      reason: "Non-session weekday/holiday (NYSE proxy)",
      localDay,
    });
  }

  const [schedH, schedM] = config.researchScheduleLocal.split(":").map(Number);
  const [nowH, nowM] = localHm.split(":").map(Number);
  const schedMinutes = (schedH ?? 22) * 60 + (schedM ?? 30);
  const nowMinutes = (nowH ?? 0) * 60 + (nowM ?? 0);
  let delta = Math.abs(nowMinutes - schedMinutes);
  delta = Math.min(delta, 24 * 60 - delta);
  if (delta > config.cronWindowMinutes) {
    return NextResponse.json({
      skipped: true,
      reason: `Outside ±${config.cronWindowMinutes}m window of ${config.researchScheduleLocal} ${tz}`,
      localHm,
      idempotencyKey: researchIdempotencyKey(now),
    });
  }

  // dow from date-fns-tz 'i' — ensure weekday (already trading day)
  void dow;

  const catchUp = await maybeCatchUpMissedRun(now);
  const result = await startResearchJob({ trigger: "cron", now });

  return NextResponse.json({
    ok: true,
    localDay,
    localHm,
    result,
    catchUp,
    note: "Cloud cron is not claimed working until deployed and verified.",
  });
}
