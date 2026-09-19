"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/components/api";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";

export function useApiData<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<T>(path);
      setData(result);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Request failed";
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload };
}

export function ApiGate<T>({
  path,
  children,
  loadingLabel,
}: {
  path: string;
  loadingLabel?: string;
  children: (args: {
    data: T;
    reload: () => Promise<void>;
  }) => React.ReactNode;
}) {
  const { data, loading, error, reload } = useApiData<T>(path);

  if (loading) return <LoadingState label={loadingLabel} />;
  if (error || !data) {
    return (
      <ErrorState
        message={error || "No data returned."}
        onRetry={() => void reload()}
      />
    );
  }
  return <>{children({ data, reload })}</>;
}
