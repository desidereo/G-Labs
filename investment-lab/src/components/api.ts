import type { ApiErrorBody } from "@/lib/ui-types";

/** Public base path for the app (Next.js basePath). */
export function getBasePath(): string {
  return process.env.NEXT_PUBLIC_BASE_PATH || "/investment-lab";
}

/** Prefix a path with the app basePath. Paths may already include it. */
export function withBasePath(path: string): string {
  const base = getBasePath().replace(/\/$/, "");
  if (!path.startsWith("/")) return `${base}/${path}`;
  if (path === base || path.startsWith(`${base}/`)) return path;
  return `${base}${path}`;
}

export class ApiError extends Error {
  status: number;
  body?: ApiErrorBody;

  constructor(status: number, message: string, body?: ApiErrorBody) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Fetch JSON from Investment Lab API routes.
 * Pass paths like `/api/research/latest` — basePath is applied automatically.
 * For relative `/investment-lab/api/...` paths, they are left as-is.
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = path.startsWith("http")
    ? path
    : withBasePath(path.startsWith("/api") ? path : path);

  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let body: ApiErrorBody | undefined;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      /* ignore */
    }
    throw new ApiError(
      res.status,
      body?.message || body?.error || `Request failed (${res.status})`,
      body,
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
