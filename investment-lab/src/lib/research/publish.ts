import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { recommendations, researchSnapshots } from "@/lib/db/schema";

/**
 * Atomic publish: set published=true only after snapshot + recommendations exist.
 * Incomplete / failed runs never call this — last successful published snapshot stays intact.
 */
export async function publishSnapshot(snapshotId: string): Promise<void> {
  const db = getDb();
  const snap = await db.query.researchSnapshots.findFirst({
    where: eq(researchSnapshots.id, snapshotId),
  });
  if (!snap) throw new Error(`Snapshot ${snapshotId} not found`);

  const recs = await db.query.recommendations.findMany({
    where: eq(recommendations.snapshotId, snapshotId),
  });
  if (recs.length === 0) {
    throw new Error("Refusing to publish empty snapshot");
  }

  await db
    .update(researchSnapshots)
    .set({ published: true })
    .where(eq(researchSnapshots.id, snapshotId));
}

export async function getLatestPublishedSnapshot() {
  const db = getDb();
  const snap = await db.query.researchSnapshots.findFirst({
    where: eq(researchSnapshots.published, true),
    orderBy: [desc(researchSnapshots.createdAt)],
  });
  if (!snap) return null;
  const recs = await db.query.recommendations.findMany({
    where: eq(recommendations.snapshotId, snap.id),
    orderBy: (t, { asc }) => [asc(t.rank)],
  });
  return { snapshot: snap, recommendations: recs };
}

export async function getPublishedRecommendationForSymbol(symbol: string) {
  const latest = await getLatestPublishedSnapshot();
  if (!latest) return null;
  return (
    latest.recommendations.find((r) => r.symbol === symbol) ?? null
  );
}

/** Test helper: ensure an unpublished failed snapshot does not become latest published. */
export async function getPublishedCount(): Promise<number> {
  const db = getDb();
  const rows = await db.query.researchSnapshots.findMany({
    where: and(eq(researchSnapshots.published, true)),
  });
  return rows.length;
}
