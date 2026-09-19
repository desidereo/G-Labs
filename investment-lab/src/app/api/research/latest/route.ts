import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLatestPublishedSnapshot } from "@/lib/research/publish";
import { ensureTables } from "@/lib/db/migrate";
import demoSnapshot from "@/fixtures/demo-snapshot.json";
import { config } from "@/lib/config";

export const GET = auth(async () => {
  await ensureTables();
  const latest = await getLatestPublishedSnapshot();
  if (!latest && config.demoMode) {
    return NextResponse.json({
      source: "fixture",
      snapshot: demoSnapshot,
      recommendations: demoSnapshot.recommendations,
    });
  }
  return NextResponse.json({
    source: "db",
    snapshot: latest?.snapshot ?? null,
    recommendations: latest?.recommendations ?? [],
  });
});
