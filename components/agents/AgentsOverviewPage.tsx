"use client";

import Link from "next/link";
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

type FacetsPayload = {
  facets?: {
    categories?: string[];
    sources?: string[];
  };
};

type RankedItem = {
  id?: string;
  skill?: string;
  server?: string;
  displayName?: string;
  installs?: number | null;
  provider?: string;
  owner?: string;
};

type TopListPayload = FacetsPayload & {
  data?: RankedItem[];
  snapshotAt?: string | null;
};

const labels = {
  en: {
    title: "Add-Ons Overview",
    subtitle: "What this page tracks, why it matters, and the current footprint.",
    intro:
      "This page is the quick brief for Add-Ons data. It summarizes tracked inventory and gives a lightweight Top 5 signal for skills and MCP servers.",
    whatTitle: "What this means",
    whatText:
      "Use this page for fast health checks: tracking breadth, source diversity, and current top surface without opening full leaderboards.",
    skills: "Skills",
    mcpServers: "MCP Servers",
    total: "Total Tracked",
    sources: "Unique Sources",
    categories: "Covered Categories",
    quickLinks: "Quick Links",
    openSkills: "Open Skills",
    openMcp: "Open MCP Servers",
    topSkills: "Top 5 Skills",
    topMcp: "Top 5 MCP Servers",
    noData: "No data",
    source: "Source",
    updated: "Updated",
  },
  tr: {
    title: "Add-Ons Overview",
    subtitle: "Bu sayfanın neyi takip ettiğini ve mevcut kapsamı hızlıca gösterir.",
    intro:
      "Burası Add-Ons için hızlı briefing ekranı. Takip edilen envanteri özetler, skill ve MCP tarafında hafif bir Top 5 sinyali verir.",
    whatTitle: "Bu sayfa ne anlama geliyor",
    whatText:
      "Amaç, detay leaderboard açmadan kapsamı görmek: kaç öğe takip ediliyor, kaynak çeşitliliği nasıl, öne çıkanlar kimler.",
    skills: "Skills",
    mcpServers: "MCP Servers",
    total: "Toplam İzlenen",
    sources: "Benzersiz Kaynak",
    categories: "Kapsanan Kategori",
    quickLinks: "Hızlı Linkler",
    openSkills: "Skills Aç",
    openMcp: "MCP Servers Aç",
    topSkills: "Top 5 Skills",
    topMcp: "Top 5 MCP Servers",
    noData: "Veri yok",
    source: "Kaynak",
    updated: "Güncellendi",
  },
} as const;

export function AgentsOverviewPage({ locale }: { locale: AppLocale }) {
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [topSkills, setTopSkills] = useState<RankedItem[]>([]);
  const [topMcpServers, setTopMcpServers] = useState<RankedItem[]>([]);
  const [sourceCount, setSourceCount] = useState(0);
  const [categoryCount, setCategoryCount] = useState(0);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    void Promise.allSettled([
      fetch("/api/monitoring/agents?category=overview", { cache: "no-store" }),
      fetch("/api/monitoring/agents?kind=skills&board=top&page=1&pageSize=5", { cache: "no-store" }),
      fetch("/api/monitoring/agents?kind=mcp_servers&board=top&page=1&pageSize=5", { cache: "no-store" }),
    ])
      .then(async ([overviewRes, skillsRes, mcpRes]) => {
        if (!alive) return;

        const overviewJson = await toJson<OverviewPayload>(overviewRes);
        const skillsJson = await toJson<TopListPayload>(skillsRes);
        const mcpJson = await toJson<TopListPayload>(mcpRes);

        setOverview(overviewJson);
        setTopSkills((skillsJson?.data ?? []).slice(0, 5));
        setTopMcpServers((mcpJson?.data ?? []).slice(0, 5));
        setSnapshotAt(overviewJson?.snapshotAt ?? skillsJson?.snapshotAt ?? mcpJson?.snapshotAt ?? null);

        const allSources = new Set<string>([
          ...(skillsJson?.facets?.sources ?? []),
          ...(mcpJson?.facets?.sources ?? []),
        ]);
        const allCategories = new Set<string>([
          ...(skillsJson?.facets?.categories ?? []),
          ...(mcpJson?.facets?.categories ?? []),
        ]);
        setSourceCount(allSources.size);
        setCategoryCount(allCategories.size);
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
  const totalTracked = overview?.data.totalTracked ?? (overview?.data.skills ?? 0) + (overview?.data.mcpServers ?? 0);

  return (
    <section
      className="w-full overflow-hidden rounded-[var(--radius-panel)] p-5"
      style={{ border: "1px solid var(--border)", background: "var(--surface-card)", boxShadow: "var(--shadow-md)" }}
    >
      <div className="mb-4">
        <h2 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>{t.title}</h2>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{t.subtitle}</p>
        <p className="mt-3 max-w-4xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>{t.intro}</p>
      </div>

      {loading || !overview ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="h-24 animate-pulse rounded-xl bg-slate-200/70 dark:bg-white/10" />
          ))}
        </div>
      ) : (
        <>
          <div
            className="mb-4 rounded-xl px-4 py-3"
            style={{ border: "1px solid var(--border)", background: "var(--surface-subtle)" }}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--text-faint)" }}>{t.whatTitle}</p>
            <p className="mt-1 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{t.whatText}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link
                href={`/${locale}/agents/skills`}
                className="rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{ border: "1px solid var(--border)", color: "var(--text)", background: "var(--surface-card)" }}
              >
                {t.openSkills}
              </Link>
              <Link
                href={`/${locale}/agents/mcp-servers`}
                className="rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{ border: "1px solid var(--border)", color: "var(--text)", background: "var(--surface-card)" }}
              >
                {t.openMcp}
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { label: t.skills, value: overview.data.skills },
              { label: t.mcpServers, value: overview.data.mcpServers },
              { label: t.sources, value: sourceCount },
              { label: t.categories, value: categoryCount },
              { label: t.total, value: totalTracked },
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

          <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <TopFivePanel locale={locale} title={t.topSkills} items={topSkills} type="skill" noData={t.noData} />
            <TopFivePanel locale={locale} title={t.topMcp} items={topMcpServers} type="mcp" noData={t.noData} />
          </div>

          <p className="mt-4 text-xs" style={{ color: "var(--text-faint)" }}>
            {t.source}: {overview.sourceName} · {t.updated}: {snapshotAt ?? "-"}
          </p>
        </>
      )}
    </section>
  );
}

function TopFivePanel({
  locale,
  title,
  items,
  type,
  noData,
}: {
  locale: AppLocale;
  title: string;
  items: RankedItem[];
  type: "skill" | "mcp";
  noData: string;
}) {
  const targetHref = type === "skill" ? `/${locale}/agents/skills` : `/${locale}/agents/mcp-servers`;

  return (
    <article className="rounded-xl p-4" style={{ border: "1px solid var(--border)", background: "var(--surface-subtle)" }}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>{title}</h3>
        <Link
          href={targetHref}
          className="text-xs font-semibold"
          style={{ color: "var(--accent)" }}
        >
          View all
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>{noData}</p>
      ) : (
        <ol className="space-y-2">
          {items.map((item, index) => {
            const name = type === "skill"
              ? item.displayName ?? item.skill ?? "-"
              : item.displayName ?? item.server ?? "-";

            return (
              <li
                key={`${name}-${index}`}
                className="flex items-center justify-between rounded-lg px-3 py-2"
                style={{ border: "1px solid var(--border)", background: "var(--surface-card)" }}
              >
                <span className="truncate pr-3 text-sm font-medium" style={{ color: "var(--text)" }}>
                  {index + 1}. {name}
                </span>
                <span className="shrink-0 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {fmtInt(item.installs)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </article>
  );
}

function fmtInt(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

async function toJson<T>(result: PromiseSettledResult<Response>): Promise<T | null> {
  if (result.status !== "fulfilled") return null;
  if (!result.value.ok) return null;
  try {
    return await result.value.json() as T;
  } catch {
    return null;
  }
}
