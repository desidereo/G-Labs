"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "@/components/api";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import type { LabSettings } from "@/lib/ui-types";

export default function SettingsPage() {
  const [settings, setSettings] = useState<LabSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<LabSettings>("/api/settings");
      setSettings(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setSaved(null);
    setError(null);
    try {
      const updated = await apiFetch<LabSettings>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(settings),
      });
      setSettings(updated);
      setSaved("Settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Loading settings…" />;
  if (error && !settings) {
    return <ErrorState message={error} onRetry={() => void load()} />;
  }
  if (!settings) return null;

  return (
    <div className="lab-page">
      <header>
        <h1>Settings</h1>
        <p className="page-lead">
          Schedule, risk caps, and paper defaults. Demo mode is driven by env when
          credentials are missing.
        </p>
      </header>

      <form onSubmit={onSubmit} className="panel panel-pad flex max-w-xl flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="scheduleTime">Schedule time</label>
            <input
              id="scheduleTime"
              value={String(settings.scheduleTime ?? "22:30")}
              onChange={(e) =>
                setSettings({ ...settings, scheduleTime: e.target.value })
              }
              placeholder="22:30"
            />
          </div>
          <div className="field">
            <label htmlFor="timezone">Timezone</label>
            <input
              id="timezone"
              value={String(settings.timezone ?? "Europe/London")}
              onChange={(e) =>
                setSettings({ ...settings, timezone: e.target.value })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="baseCurrency">Base currency</label>
            <input
              id="baseCurrency"
              value={String(settings.baseCurrency ?? "GBP")}
              onChange={(e) =>
                setSettings({ ...settings, baseCurrency: e.target.value })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="startingBalance">Starting paper balance</label>
            <input
              id="startingBalance"
              type="number"
              min="0"
              step="1"
              value={Number(settings.startingBalance ?? 500)}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  startingBalance: Number(e.target.value),
                })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="maxPositionWeight">Max position weight</label>
            <input
              id="maxPositionWeight"
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={Number(settings.maxPositionWeight ?? 0.25)}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  maxPositionWeight: Number(e.target.value),
                })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="maxSectorWeight">Max sector weight</label>
            <input
              id="maxSectorWeight"
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={Number(settings.maxSectorWeight ?? 0.4)}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  maxSectorWeight: Number(e.target.value),
                })
              }
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-[var(--dark)]">
          <input
            type="checkbox"
            checked={Boolean(settings.weekdaysOnly ?? true)}
            onChange={(e) =>
              setSettings({ ...settings, weekdaysOnly: e.target.checked })
            }
          />
          Weekdays only
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-[var(--dark)]">
          <input
            type="checkbox"
            checked={Boolean(settings.fractionalShares ?? true)}
            onChange={(e) =>
              setSettings({ ...settings, fractionalShares: e.target.checked })
            }
          />
          Allow fractional shares
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-[var(--dark)]">
          <input
            type="checkbox"
            checked={Boolean(settings.notifyOnFailure ?? false)}
            onChange={(e) =>
              setSettings({ ...settings, notifyOnFailure: e.target.checked })
            }
          />
          Notify on failure
        </label>

        {settings.demoMode != null ? (
          <p className="m-0 text-sm text-[var(--demo)]">
            Demo mode (read-only from env): {settings.demoMode ? "on" : "off"}
          </p>
        ) : null}

        {error ? <p className="m-0 text-sm text-[var(--danger)]">{error}</p> : null}
        {saved ? <p className="m-0 text-sm text-[var(--success)]">{saved}</p> : null}

        <div>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
