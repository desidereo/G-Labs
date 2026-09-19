import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listRecentJobs } from "@/lib/jobs/runner";
import { ensureTables } from "@/lib/db/migrate";

export const GET = auth(async () => {
  await ensureTables();
  const jobs = await listRecentJobs(30);
  return NextResponse.json({ jobs });
});
