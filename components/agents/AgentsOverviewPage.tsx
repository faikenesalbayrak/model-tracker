"use client";

import { useEffect, useState } from "react";
import type { AppLocale } from "@/lib/i18n/locales";

type OverviewPayload = {
  sourceName: string;
  snapshotAt: string | null;
  data: {
    topAgents: number;
    skills: number;
    mcpServers: number;
    totalTracked: number;
  };
};

const labels = {
  en: {
    title: "Agents Overview",
    subtitle: "Snapshot of tracked agents, skills, and MCP servers.",
    topAgents: "Top Agents",
    skills: "Skills",
    mcpServers: "MCP Servers",
    total: "Total Tracked",
    source: "Source",
    updated: "Updated",
  },
  tr: {
    title: "Agents Overview",
    subtitle: "Takip edilen agent, skill ve MCP sunucu görünümü.",
    topAgents: "Top Agents",
    skills: "Skills",
    mcpServers: "MCP Servers",
    total: "Toplam İzlenen",
    source: "Kaynak",
    updated: "Güncellendi",
  },
} as const;

export function AgentsOverviewPage({ locale }: { locale: AppLocale }) {
  const [payload, setPayload] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    void fetch("/api/monitoring/agents?category=overview", { cache: "no-store" })
      .then((response) => response.json() as Promise<OverviewPayload>)
      .then((data) => {
        if (!alive) return;
        setPayload(data);
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const t = labels[locale];

  return (
    <section
      className="w-full overflow-hidden rounded-[var(--radius-panel)] p-5"
      style={{ border: "1px solid var(--border)", background: "var(--surface-card)", boxShadow: "var(--shadow-md)" }}
    >
      <div className="mb-4">
        <h2 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>{t.title}</h2>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{t.subtitle}</p>
      </div>

      {loading || !payload ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-24 animate-pulse rounded-xl bg-slate-200/70 dark:bg-white/10" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: t.topAgents, value: payload.data.topAgents },
              { label: t.skills, value: payload.data.skills },
              { label: t.mcpServers, value: payload.data.mcpServers },
              { label: t.total, value: payload.data.totalTracked },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl px-4 py-4"
                style={{ border: "1px solid var(--border)", background: "var(--surface-subtle)" }}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-faint)" }}>{item.label}</p>
                <p className="mt-2 text-3xl font-bold tabular-nums" style={{ color: "var(--text)" }}>{item.value}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs" style={{ color: "var(--text-faint)" }}>
            {t.source}: {payload.sourceName} · {t.updated}: {payload.snapshotAt ?? "-"}
          </p>
        </>
      )}
    </section>
  );
}
