"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { StatusBanners } from "@/components/StatusBanners";

const NAV = [
  { href: "/overview", label: "Overview" },
  { href: "/research", label: "Daily Research" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/performance", label: "Performance" },
  { href: "/history", label: "History" },
  { href: "/automation", label: "Automation" },
  { href: "/settings", label: "Settings" },
] as const;

export function AppShell({
  children,
  demoMode,
  dataStale,
  staleReason,
}: {
  children: React.ReactNode;
  demoMode?: boolean;
  dataStale?: boolean;
  staleReason?: string;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <StatusBanners
        demoMode={demoMode}
        dataStale={dataStale}
        staleReason={staleReason}
      />

      <div className="flex flex-1">
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-[var(--sidebar-w)] flex-col border-r border-[var(--border)] bg-[var(--dark)] text-white transition-transform lg:static lg:translate-x-0 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{ top: 0 }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-5 py-5">
            <Link href="/overview" className="block" onClick={() => setOpen(false)}>
              <div className="text-lg font-extrabold tracking-tight">
                G-<span className="text-[var(--primary)]">Labs</span>
              </div>
              <div className="text-xs font-medium text-white/55">Investment Lab</div>
            </Link>
            <button
              type="button"
              className="rounded-md p-1 text-white/70 lg:hidden"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>

          <nav className="flex flex-1 flex-col gap-1 p-3">
            {NAV.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                    active
                      ? "bg-[var(--primary)] text-white"
                      : "text-white/70 hover:bg-white/8 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-white/10 p-4 text-xs text-white/50">
            <div className="mb-2 truncate text-white/70">
              {session?.user?.name || session?.user?.email || "Operator"}
            </div>
            <button
              type="button"
              className="text-[var(--primary)] hover:underline"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              Sign out
            </button>
          </div>
        </aside>

        {open ? (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            aria-label="Close overlay"
            onClick={() => setOpen(false)}
          />
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--border)] bg-white/80 px-4 py-3 backdrop-blur lg:hidden">
            <button
              type="button"
              className="btn btn-secondary !px-3 !py-2"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
            >
              Menu
            </button>
            <div className="font-bold text-[var(--dark)]">
              G-<span className="text-[var(--primary)]">Labs</span> Lab
            </div>
          </header>

          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
