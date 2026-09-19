"use client";

import { AppShell } from "@/components/AppShell";
import { useApiData } from "@/components/useApiData";
import type { ResearchStatus } from "@/lib/ui-types";

export default function LabLayout({ children }: { children: React.ReactNode }) {
  const { data: status } = useApiData<ResearchStatus>("/api/research/status");

  return (
    <AppShell
      demoMode={status?.demoMode}
      dataStale={status?.dataStale}
      staleReason={status?.staleReason}
    >
      {children}
    </AppShell>
  );
}
