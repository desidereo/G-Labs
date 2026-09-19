"use client";

import { SessionProvider } from "next-auth/react";
import { getBasePath } from "@/components/api";

export function Providers({ children }: { children: React.ReactNode }) {
  const authBase = `${getBasePath()}/api/auth`;
  return <SessionProvider basePath={authBase}>{children}</SessionProvider>;
}
