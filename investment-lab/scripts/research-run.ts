/**
 * CLI entry for `npm run research:run`
 * Set DEMO_MODE=true for local fixture providers.
 */
import { ensureTables } from "../src/lib/db/migrate";
import { seedDemo } from "../src/lib/db/seed";
import { startResearchJob } from "../src/lib/jobs/runner";

async function main() {
  await ensureTables();
  await seedDemo();
  const result = await startResearchJob({ trigger: "manual" });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "failed") process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
