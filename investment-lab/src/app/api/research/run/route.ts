import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { startResearchJob, maybeCatchUpMissedRun } from "@/lib/jobs/runner";
import { ensureTables } from "@/lib/db/migrate";
import { seedDemo } from "@/lib/db/seed";

export const GET = auth(async () => {
  await ensureTables();
  await seedDemo();
  const catchUp = await maybeCatchUpMissedRun();
  const result = await startResearchJob({ trigger: "manual" });
  return NextResponse.json({ result, catchUp });
});

export const POST = auth(async () => {
  await ensureTables();
  await seedDemo();
  const result = await startResearchJob({ trigger: "manual" });
  return NextResponse.json({ result });
});
