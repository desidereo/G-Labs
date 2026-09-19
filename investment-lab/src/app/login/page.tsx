"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("demo");
  const [password, setPassword] = useState("demo");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await signIn("credentials", {
        username,
        password,
        redirect: false,
      });
      if (res?.error) {
        setError("Invalid credentials");
        return;
      }
      router.push("/overview");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-white/90 p-8 shadow-lg backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">
          G-Labs Software
        </p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--dark)]">
          Investment Lab
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Private paper-trading research. Demo login:{" "}
          <code className="rounded bg-[var(--light)] px-1">demo</code> /{" "}
          <code className="rounded bg-[var(--light)] px-1">demo</code>
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold text-[var(--dark)]">
            Username
            <input
              className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </label>
          <label className="block text-sm font-semibold text-[var(--dark)]">
            Password
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-[var(--primary)] px-4 py-3 font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
