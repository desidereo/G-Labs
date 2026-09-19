import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPublishedRecommendationForSymbol } from "@/lib/research/publish";
import { ensureTables } from "@/lib/db/migrate";

export const GET = auth(async (_req, ctx) => {
  await ensureTables();
  const { symbol } = await ctx.params;
  const rec = await getPublishedRecommendationForSymbol(
    decodeURIComponent(symbol).toUpperCase(),
  );
  if (!rec) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ recommendation: rec });
});
