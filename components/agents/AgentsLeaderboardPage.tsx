"use client";

import { useEffect, useMemo, useState } from "react";
import type { AgentRow, McpServerRow, SkillRow } from "@/components/dashboard-types";
import type { AppLocale } from "@/lib/i18n/locales";

type Category = "top_agents" | "skills" | "mcp_servers";

type Payload<T> = {
  category: Category;
  data: T[];
  sourceName: string;
  snapshotAt: string | null;
};

const copy = {
  en: {
    top_agents: { title: "Top Agents", subtitle: "Agent leaderboard across task completion, success rate, and latency." },
    skills: { title: "Top Skills", subtitle: "Skill leaderboard across usage, win-rate, and quality index." },
    mcp_servers: { title: "MCP Servers", subtitle: "MCP server leaderboard across reliability, latency, and integrations." },
    loading: "Loading leaderboard...",
    empty: "No records yet.",
    source: "Source",
    updated: "Updated",
  },
  tr: {
    top_agents: { title: "Top Agents", subtitle: "Görev tamamlama, başarı oranı ve gecikmeye göre agent sıralaması." },
    skills: { title: "Top Skills", subtitle: "Kullanım, kazanma oranı ve kalite indeksine göre skill sıralaması." },
    mcp_servers: { title: "MCP Servers", subtitle: "Güvenilirlik, gecikme ve entegrasyon metriklerine göre MCP sunucu sıralaması." },
    loading: "Leaderboard yükleniyor...",
    empty: "Henüz kayıt yok.",
    source: "Kaynak",
    updated: "Güncellendi",
  },
} as const;

export function AgentsLeaderboardPage({ locale, category }: { locale: AppLocale; category: Category }) {
  const [payload, setPayload] = useState<Payload<AgentRow | SkillRow | McpServerRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    void fetch(`/api/monitoring/agents?category=${encodeURIComponent(category)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json() as Promise<Payload<AgentRow | SkillRow | McpServerRow>>;
      })
      .then((data) => {
        if (!alive) return;
        setPayload(data);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Unknown error");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [category]);

  const strings = copy[locale][category];

  const columns = useMemo(() => {
    if (category === "top_agents") {
      return ["Name", "Provider", "Score", "Tasks", "Success %", "Latency (ms)"];
    }
    if (category === "skills") {
      return ["Skill", "Category", "Score", "Usage", "Win %"];
    }
    return ["Server", "Owner", "Score", "Reliability %", "Latency (ms)", "Integrations"];
  }, [category]);

  return (
    <section
      className="w-full overflow-hidden rounded-[var(--radius-panel)] p-5"
      style={{ border: "1px solid var(--border)", background: "var(--surface-card)", boxShadow: "var(--shadow-md)" }}
    >
      <div className="mb-4">
        <h2 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>{strings.title}</h2>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{strings.subtitle}</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="h-11 animate-pulse rounded-xl bg-slate-200/70 dark:bg-white/10" />
          ))}
        </div>
      ) : error ? (
        <p style={{ color: "var(--text-muted)" }}>{error}</p>
      ) : !payload || payload.data.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>{copy[locale].empty}</p>
      ) : (
        <>
          <div className="relative">
            <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white dark:border-white/8 dark:bg-white/[0.02]">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="whitespace-nowrap bg-slate-50 text-xs tracking-[0.14em] text-slate-500 dark:bg-white/[0.03] dark:text-slate-400">
                  <tr>
                    {columns.map((column) => (
                      <th key={column} className="px-4 py-2">{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payload.data.map((row) => (
                    <tr key={row.id} className="border-t border-slate-200/70 text-slate-700 dark:border-white/8 dark:text-slate-300">
                      {category === "top_agents" ? (
                        <>
                          <td className="px-4 py-2 font-semibold text-slate-900 dark:text-white">{(row as AgentRow).name}</td>
                          <td className="px-4 py-2">{(row as AgentRow).provider}</td>
                          <td className="px-4 py-2 tabular-nums">{(row as AgentRow).score ?? "-"}</td>
                          <td className="px-4 py-2 tabular-nums">{(row as AgentRow).tasksCompleted ?? "-"}</td>
                          <td className="px-4 py-2 tabular-nums">{(row as AgentRow).successRate ?? "-"}</td>
                          <td className="px-4 py-2 tabular-nums">{(row as AgentRow).latencyMs ?? "-"}</td>
                        </>
                      ) : category === "skills" ? (
                        <>
                          <td className="px-4 py-2 font-semibold text-slate-900 dark:text-white">{(row as SkillRow).skill}</td>
                          <td className="px-4 py-2">{(row as SkillRow).category}</td>
                          <td className="px-4 py-2 tabular-nums">{(row as SkillRow).score ?? "-"}</td>
                          <td className="px-4 py-2 tabular-nums">{(row as SkillRow).usageCount ?? "-"}</td>
                          <td className="px-4 py-2 tabular-nums">{(row as SkillRow).winRate ?? "-"}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-2 font-semibold text-slate-900 dark:text-white">{(row as McpServerRow).server}</td>
                          <td className="px-4 py-2">{(row as McpServerRow).owner}</td>
                          <td className="px-4 py-2 tabular-nums">{(row as McpServerRow).score ?? "-"}</td>
                          <td className="px-4 py-2 tabular-nums">{(row as McpServerRow).reliability ?? "-"}</td>
                          <td className="px-4 py-2 tabular-nums">{(row as McpServerRow).latencyMs ?? "-"}</td>
                          <td className="px-4 py-2 tabular-nums">{(row as McpServerRow).integrations ?? "-"}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-3 text-xs" style={{ color: "var(--text-faint)" }}>
            {copy[locale].source}: {payload.sourceName} · {copy[locale].updated}: {payload.snapshotAt ?? "-"}
          </div>
        </>
      )}
    </section>
  );
}
