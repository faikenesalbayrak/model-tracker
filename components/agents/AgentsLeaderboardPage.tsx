"use client";

import { useEffect, useMemo, useState } from "react";
import type { AgentRow, McpServerRow, SkillRow } from "@/components/dashboard-types";
import type { AppLocale } from "@/lib/i18n/locales";

type Category = "top_agents" | "skills" | "mcp_servers";
type SortType = "installs" | "rank" | "name";
type Officiality = "official" | "unofficial" | "unknown";

type Payload<T> = {
  category: Category;
  data: T[];
  total?: number;
  page?: number;
  pageSize?: number;
  sourceName: string;
  snapshotAt: string | null;
  provenanceCoverage?: {
    enrichedRows: number;
    enrichedRatio: number;
  };
};

const copy = {
  en: {
    top_agents: { title: "Top Agents", subtitle: "Agent leaderboard sourced from the latest DB snapshot." },
    skills: { title: "Top Skills", subtitle: "Live skills catalog with search, filters, and provenance." },
    mcp_servers: { title: "MCP Servers", subtitle: "Live MCP catalog with search, filters, and provenance." },
    loading: "Loading leaderboard...",
    empty: "No records yet.",
    source: "Source",
    updated: "Updated",
    search: "Search",
    officiality: "Officiality",
    sourceFilter: "Source",
    sort: "Sort",
    order: "Order",
    view: "View",
    all: "All",
    next: "Next",
    prev: "Prev",
  },
  tr: {
    top_agents: { title: "Top Agents", subtitle: "DB snapshot üzerinden üretilen agent sıralaması." },
    skills: { title: "Top Skills", subtitle: "Arama, filtre ve provenance ile canlı skill kataloğu." },
    mcp_servers: { title: "MCP Servers", subtitle: "Arama, filtre ve provenance ile canlı MCP kataloğu." },
    loading: "Leaderboard yükleniyor...",
    empty: "Henüz kayıt yok.",
    source: "Kaynak",
    updated: "Güncellendi",
    search: "Ara",
    officiality: "Officiality",
    sourceFilter: "Kaynak",
    sort: "Sıralama",
    order: "Yön",
    view: "Görünüm",
    all: "Tümü",
    next: "İleri",
    prev: "Geri",
  },
} as const;

export function AgentsLeaderboardPage({ locale, category }: { locale: AppLocale; category: Category }) {
  const [payload, setPayload] = useState<Payload<AgentRow | SkillRow | McpServerRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [officiality, setOfficiality] = useState<Officiality | "">("");
  const [view, setView] = useState<"all_time" | "trending" | "hot" | "">("");
  const [sort, setSort] = useState<SortType>("installs");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 30;

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams();
    params.set("kind", category);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));

    if (category !== "top_agents") {
      if (q.trim()) params.set("q", q.trim());
      if (source.trim()) params.set("source", source.trim());
      if (officiality) params.set("officiality", officiality);
      if (sort) params.set("sort", sort);
      if (order) params.set("order", order);
      if (category === "skills" && view) params.set("view", view);
    }

    queueMicrotask(() => {
      if (!alive) return;
      setLoading(true);
      setError(null);
    });

    void fetch(`/api/monitoring/agents?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
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
  }, [category, q, source, officiality, view, sort, order, page]);

  const strings = copy[locale][category];

  const totalPages = useMemo(() => {
    const total = payload?.total ?? payload?.data.length ?? 0;
    return Math.max(1, Math.ceil(total / pageSize));
  }, [payload]);

  return (
    <section
      className="w-full overflow-hidden rounded-[var(--radius-panel)] p-5"
      style={{ border: "1px solid var(--border)", background: "var(--surface-card)", boxShadow: "var(--shadow-md)" }}
    >
      <div className="mb-4">
        <h2 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>{strings.title}</h2>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{strings.subtitle}</p>
      </div>

      {category !== "top_agents" ? (
        <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-6">
          <input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
            placeholder={copy[locale].search}
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
              setPage(1);
            }}
            placeholder={copy[locale].sourceFilter}
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <select value={officiality} onChange={(event) => {
            setOfficiality(event.target.value as Officiality | "");
            setPage(1);
          }} className="rounded-lg border px-3 py-2 text-sm">
            <option value="">{copy[locale].officiality}: {copy[locale].all}</option>
            <option value="official">official</option>
            <option value="unofficial">unofficial</option>
            <option value="unknown">unknown</option>
          </select>
          {category === "skills" ? (
            <select value={view} onChange={(event) => {
              setView(event.target.value as "all_time" | "trending" | "hot" | "");
              setPage(1);
            }} className="rounded-lg border px-3 py-2 text-sm">
              <option value="">{copy[locale].view}: {copy[locale].all}</option>
              <option value="all_time">all_time</option>
              <option value="trending">trending</option>
              <option value="hot">hot</option>
            </select>
          ) : (
            <div />
          )}
          <select value={sort} onChange={(event) => {
            setSort(event.target.value as SortType);
            setPage(1);
          }} className="rounded-lg border px-3 py-2 text-sm">
            <option value="installs">{copy[locale].sort}: installs</option>
            <option value="rank">{copy[locale].sort}: rank</option>
            <option value="name">{copy[locale].sort}: name</option>
          </select>
          <select value={order} onChange={(event) => {
            setOrder(event.target.value as "asc" | "desc");
            setPage(1);
          }} className="rounded-lg border px-3 py-2 text-sm">
            <option value="desc">{copy[locale].order}: desc</option>
            <option value="asc">{copy[locale].order}: asc</option>
          </select>
        </div>
      ) : null}

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
                    {category === "top_agents" ? (
                      ["Name", "Provider", "Score", "Tasks", "Success %", "Latency (ms)"].map((column) => (
                        <th key={column} className="px-4 py-2">{column}</th>
                      ))
                    ) : category === "skills" ? (
                      ["Skill", "View", "Rank", "Installs", "Officiality", "Primary Source", "Enriched By"].map((column) => (
                        <th key={column} className="px-4 py-2">{column}</th>
                      ))
                    ) : (
                      ["Server", "Rank", "Installs", "Officiality", "Primary Source", "Enriched By", "Category"].map((column) => (
                        <th key={column} className="px-4 py-2">{column}</th>
                      ))
                    )}
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
                          <td className="px-4 py-2">{(row as SkillRow).view}</td>
                          <td className="px-4 py-2 tabular-nums">{(row as SkillRow).rank ?? "-"}</td>
                          <td className="px-4 py-2 tabular-nums">{(row as SkillRow).installs ?? "-"}</td>
                          <td className="px-4 py-2">{(row as SkillRow).officiality}</td>
                          <td className="px-4 py-2">{(row as SkillRow).primarySource}</td>
                          <td className="px-4 py-2">{(row as SkillRow).enrichedBy.join(", ") || "-"}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-2 font-semibold text-slate-900 dark:text-white">{(row as McpServerRow).server}</td>
                          <td className="px-4 py-2 tabular-nums">{(row as McpServerRow).rank ?? "-"}</td>
                          <td className="px-4 py-2 tabular-nums">{(row as McpServerRow).installs ?? "-"}</td>
                          <td className="px-4 py-2">{(row as McpServerRow).officiality}</td>
                          <td className="px-4 py-2">{(row as McpServerRow).primarySource}</td>
                          <td className="px-4 py-2">{(row as McpServerRow).enrichedBy.join(", ") || "-"}</td>
                          <td className="px-4 py-2">{(row as McpServerRow).category ?? "-"}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {category !== "top_agents" ? (
            <div className="mt-3 flex items-center justify-between text-xs" style={{ color: "var(--text-faint)" }}>
              <span>
                {payload.provenanceCoverage ? `enrichedRows=${payload.provenanceCoverage.enrichedRows}, ratio=${payload.provenanceCoverage.enrichedRatio}` : ""}
              </span>
              <div className="flex items-center gap-2">
                <button
                  className="rounded border px-2 py-1 disabled:opacity-50"
                  disabled={page <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                >
                  {copy[locale].prev}
                </button>
                <span>{page}/{totalPages}</span>
                <button
                  className="rounded border px-2 py-1 disabled:opacity-50"
                  disabled={page >= totalPages}
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                >
                  {copy[locale].next}
                </button>
              </div>
            </div>
          ) : null}
          <div className="mt-3 text-xs" style={{ color: "var(--text-faint)" }}>
            {copy[locale].source}: {payload.sourceName} · {copy[locale].updated}: {payload.snapshotAt ?? "-"}
          </div>
        </>
      )}
    </section>
  );
}
