function env(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return v;
}

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function envNumber(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Lazy env reads so tests can set process.env before each run. */
export function getConfig() {
  const authPassword = env("AUTH_PASSWORD");
  const demoModeExplicit = env("DEMO_MODE");
  const demoMode =
    demoModeExplicit !== undefined
      ? envBool("DEMO_MODE", false)
      : !authPassword;

  return {
    demoMode,
    auth: {
      secret: env("AUTH_SECRET", "dev-insecure-secret-change-me")!,
      user: env("AUTH_USER", "admin") ?? "admin",
      password: authPassword,
    },
  db: {
    // Relative file URL resolved in Node-only db/client.ts (not at Edge import time)
    url:
      env("LIBSQL_URL") ??
      env("DATABASE_URL") ??
      "file:./data/investment-lab.db",
    authToken: env("LIBSQL_AUTH_TOKEN"),
  },
    timezone: env("APP_TIMEZONE", "Europe/London") ?? "Europe/London",
    researchScheduleLocal:
      env("RESEARCH_SCHEDULE_LOCAL", "22:30") ?? "22:30",
    baseCurrency: env("BASE_CURRENCY", "GBP") ?? "GBP",
    startingPaperBalance: envNumber("STARTING_PAPER_BALANCE", 500),
    budgets: {
      monthlyAiUsd: envNumber("MONTHLY_AI_BUDGET_USD", 10),
      maxPositionWeight: envNumber("MAX_POSITION_WEIGHT", 0.25),
      maxSectorWeight: envNumber("MAX_SECTOR_WEIGHT", 0.4),
    },
    allowFractionalShares: envBool("ALLOW_FRACTIONAL_SHARES", true),
    catchUpMissedRuns: envBool("CATCH_UP_MISSED_RUNS", true),
    cronSecret: env("CRON_SECRET"),
    openai: {
      apiKey: env("OPENAI_API_KEY"),
      baseUrl:
        env("OPENAI_BASE_URL", "https://api.openai.com/v1") ??
        "https://api.openai.com/v1",
      model: env("OPENAI_MODEL", "gpt-4o-mini") ?? "gpt-4o-mini",
    },
    cronWindowMinutes: 30,
  } as const;
}

/** @deprecated use getConfig() — kept for convenience; evaluates once per property access via Proxy */
export const config: ReturnType<typeof getConfig> = new Proxy(
  {} as ReturnType<typeof getConfig>,
  {
    get(_t, prop: string) {
      return getConfig()[prop as keyof ReturnType<typeof getConfig>];
    },
  },
);

export type AppConfig = ReturnType<typeof getConfig>;
