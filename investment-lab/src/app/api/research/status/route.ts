import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLatestRunStatus } from "@/lib/jobs/runner";
import { ensureTables } from "@/lib/db/migrate";

export const GET = auth(async () => {
  await ensureTables();
  const status = await getLatestRunStatus();
  return NextResponse.json(status);
});
