"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Minus, SlidersHorizontal } from "lucide-react";
import type { McpServerRow, SkillRow } from "@/components/dashboard-types";
import type { AppLocale } from "@/lib/i18n/locales";

type Category = "top_agents" | "skills" | "mcp_servers";
type BoardKey = "main" | "trending24h" | "top";
type Officiality = "official" | "unofficial" | "unknown";
type SortType = "installs" | "rank" | "name";
type SortOrder = "asc" | "desc";

type Payload<T> = {
  category: Category;
  board?: BoardKey;
  data: T[];
  total?: number;
  page?: number;
  pageSize?: number;
  sourceName: string;
  snapshotAt: string | null;
  facets?: {
    categories: string[];
    sources: string[];
  };
  provenanceCoverage?: {
    enrichedRows: number;
    enrichedRatio: number;
  };
};

type BoardState = {
  sort: SortType;
  order: SortOrder;
  page: number;
  pageSize: number;
  loading: boolean;
  error: string | null;
  payload: Payload<SkillRow | McpServerRow> | null;
};

const ROW_OPTIONS = [20, 30, 50] as const;
const BOARD_KEYS: BoardKey[] = ["main", "trending24h", "top"];

const copy = {
  en: {
    skills: {
      title: "Top Skills",
      subtitle: "Multi-view skill intelligence with trend and top performance boards.",
      boards: {
        main: { title: "Skills Leaderboard", subtitle: "Detailed canonical skill ranking with metadata." },
        trending24h: { title: "Trending 24h", subtitle: "Highest 24h momentum. Prefers hot view when available." },
        top: { title: "Top Skills", subtitle: "All-time strongest skills by installs." },
      },
      spotlightLabel: "Skill Spotlight",
    },
    mcp_servers: {
      title: "MCP Servers",
      subtitle: "Operational view of MCP servers with trend and top server signals.",
      boards: {
        main: { title: "MCP Leaderboard", subtitle: "Detailed MCP server ranking with enrichment context." },
        trending24h: { title: "Trending 24h", subtitle: "24-hour movers from history-derived install delta." },
        top: { title: "Top MCP Servers", subtitle: "Highest install MCP servers right now." },
      },
      spotlightLabel: "Server Spotlight",
    },
    loading: "Loading leaderboard...",
    empty: "No records yet.",
    source: "Source",
    updated: "Updated",
    search: "Search",
    officiality: "Officiality",
    sourceFilter: "Primary Source",
    categoryFilter: "Category",
    sort: "Sort",
    order: "Order",
    rows: "Rows",
    all: "All",
    next: "Next",
    prev: "Prev",
    reset: "Reset",
    filters: "Filters",
  },
  tr: {
    skills: {
      title: "Top Skills",
      subtitle: "Trend ve top görünümü ile çok katmanlı skill leaderboard deneyimi.",
      boards: {
        main: { title: "Skills Leaderboard", subtitle: "Detaylı skill sıralaması ve zengin metadata görünümü." },
        trending24h: { title: "Trending 24h", subtitle: "24 saatlik en hızlı yükseliş. Uygunsa hot görünüm öncelikli." },
        top: { title: "Top Skills", subtitle: "All-time installs bazlı en güçlü skill listesi." },
      },
      spotlightLabel: "Skill Spotlight",
    },
    mcp_servers: {
      title: "MCP Servers",
      subtitle: "Trend ve top server sinyalleriyle MCP ekosistemi görünümü.",
      boards: {
        main: { title: "MCP Leaderboard", subtitle: "Enrichment bağlamıyla detaylı MCP server sıralaması." },
        trending24h: { title: "Trending 24h", subtitle: "History bazlı 24 saatlik install değişim liderleri." },
        top: { title: "Top MCP Servers", subtitle: "Anlık en yüksek install alan MCP server listesi." },
      },
      spotlightLabel: "Server Spotlight",
    },
    loading: "Leaderboard yükleniyor...",
    empty: "Henüz kayıt yok.",
    source: "Kaynak",
    updated: "Güncellendi",
    search: "Ara",
    officiality: "Officiality",
    sourceFilter: "Primary Source",
    categoryFilter: "Kategori",
    sort: "Sıralama",
    order: "Yön",
    rows: "Satır",
    all: "Tümü",
    next: "İleri",
    prev: "Geri",
    reset: "Sıfırla",
    filters: "Filtreler",
  },
} as const;

function makeBoardState(): BoardState {
  return {
    sort: "installs",
    order: "desc",
    page: 1,
    pageSize: 30,
    loading: true,
    error: null,
    payload: null,
  };
}

export function AgentsLeaderboardPage({ locale, category }: { locale: AppLocale; category: Category }) {
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [officiality, setOfficiality] = useState<Officiality | "">("");
  const [facets, setFacets] = useState<{ categories: string[]; sources: string[] }>({ categories: [], sources: [] });
  const [boards, setBoards] = useState<Record<BoardKey, BoardState>>({
    main: makeBoardState(),
    trending24h: makeBoardState(),
    top: makeBoardState(),
  });

  const labels = copy[locale][category === "skills" ? "skills" : "mcp_servers"];
  const ui = copy[locale];
  const mainPage = boards.main.page;
  const mainPageSize = boards.main.pageSize;
  const mainSort = boards.main.sort;
  const mainOrder = boards.main.order;
  const trendingPage = boards.trending24h.page;
  const trendingPageSize = boards.trending24h.pageSize;
  const trendingSort = boards.trending24h.sort;
  const trendingOrder = boards.trending24h.order;
  const topPage = boards.top.page;
  const topPageSize = boards.top.pageSize;
  const topSort = boards.top.sort;
  const topOrder = boards.top.order;

  useEffect(() => {
    let alive = true;
    const boardQueryState: Record<BoardKey, Pick<BoardState, "page" | "pageSize" | "sort" | "order">> = {
      main: { page: mainPage, pageSize: mainPageSize, sort: mainSort, order: mainOrder },
      trending24h: { page: trendingPage, pageSize: trendingPageSize, sort: trendingSort, order: trendingOrder },
      top: { page: topPage, pageSize: topPageSize, sort: topSort, order: topOrder },
    };

    const loadBoard = async (key: BoardKey, state: Pick<BoardState, "page" | "pageSize" | "sort" | "order">) => {
      const params = new URLSearchParams();
      params.set("kind", category);
      params.set("board", key);
      params.set("page", String(state.page));
      params.set("pageSize", String(state.pageSize));
      params.set("sort", state.sort);
      params.set("order", state.order);
      if (q.trim()) params.set("q", q.trim());
      if (source) params.set("source", source);
      if (officiality) params.set("officiality", officiality);
      if (categoryFilter) params.set("categoryFilter", categoryFilter);
      if (category === "skills" && key === "trending24h") params.set("view", "hot");

      try {
        const res = await fetch(`/api/monitoring/agents?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json() as Payload<SkillRow | McpServerRow>;
        if (!alive) return;
        if (payload.facets) setFacets(payload.facets);
        setBoards((prev) => ({
          ...prev,
          [key]: {
            ...prev[key],
            loading: false,
            error: null,
            payload,
          },
        }));
      } catch (error) {
        if (!alive) return;
        setBoards((prev) => ({
          ...prev,
          [key]: {
            ...prev[key],
            loading: false,
            error: error instanceof Error ? error.message : "Unknown error",
          },
        }));
      }
    };

    BOARD_KEYS.forEach((key) => {
      setBoards((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          loading: true,
          error: null,
        },
      }));
      void loadBoard(key, boardQueryState[key]);
    });

    return () => {
      alive = false;
    };
  }, [category, q, source, officiality, categoryFilter, mainPage, mainPageSize, mainSort, mainOrder, trendingPage, trendingPageSize, trendingSort, trendingOrder, topPage, topPageSize, topSort, topOrder]);

  const resetFilters = () => {
    setQ("");
    setSource("");
    setOfficiality("");
    setCategoryFilter("");
    setBoards((prev) => ({
      main: { ...prev.main, page: 1 },
      trending24h: { ...prev.trending24h, page: 1 },
      top: { ...prev.top, page: 1 },
    }));
  };

  return (
    <section className="space-y-4">
      <section
        className="w-full overflow-hidden rounded-[var(--radius-panel)] p-5"
        style={{ border: "1px solid var(--border)", background: "var(--surface-card)", boxShadow: "var(--shadow-md)" }}
      >
        <div className="mb-4">
          <h2 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>{labels.title}</h2>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{labels.subtitle}</p>
        </div>

        <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-subtle)" }}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--text-faint)" }}>
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {ui.filters}
            </p>
            <button
              className="rounded-full border px-3 py-1 text-xs"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
              onClick={resetFilters}
              type="button"
            >
              {ui.reset}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="flex flex-col">
              <span className="mb-1 text-xs" style={{ color: "var(--text-muted)" }}>{ui.search}</span>
              <input
                className="h-10 rounded-xl border px-3 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--surface-card)", color: "var(--text)" }}
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder={ui.search}
              />
            </label>

            <label className="flex flex-col">
              <span className="mb-1 text-xs" style={{ color: "var(--text-muted)" }}>{ui.officiality}</span>
              <select
                className="h-10 rounded-xl border px-3 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--surface-card)", color: "var(--text)" }}
                value={officiality}
                onChange={(event) => setOfficiality(event.target.value as Officiality | "")}
              >
                <option value="">{ui.all}</option>
                <option value="official">official</option>
                <option value="unofficial">unofficial</option>
                <option value="unknown">unknown</option>
              </select>
            </label>

            <label className="flex flex-col">
              <span className="mb-1 text-xs" style={{ color: "var(--text-muted)" }}>{ui.sourceFilter}</span>
              <select
                className="h-10 rounded-xl border px-3 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--surface-card)", color: "var(--text)" }}
                value={source}
                onChange={(event) => setSource(event.target.value)}
              >
                <option value="">{ui.all}</option>
                {facets.sources.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col">
              <span className="mb-1 text-xs" style={{ color: "var(--text-muted)" }}>{ui.categoryFilter}</span>
              <select
                className="h-10 rounded-xl border px-3 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--surface-card)", color: "var(--text)" }}
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="">{ui.all}</option>
                {facets.categories.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      {BOARD_KEYS.map((key) => (
        <LeaderboardBoard
          key={key}
          board={key}
          boardState={boards[key]}
          category={category}
          ui={ui}
          labels={labels}
          onBoardChange={(patch) => {
            setBoards((prev) => ({
              ...prev,
              [key]: {
                ...prev[key],
                ...patch,
              },
            }));
          }}
        />
      ))}
    </section>
  );
}

function LeaderboardBoard({
  board,
  boardState,
  category,
  ui,
  labels,
  onBoardChange,
}: {
  board: BoardKey;
  boardState: BoardState;
  category: Category;
  ui: typeof copy[AppLocale];
  labels: typeof copy[AppLocale]["skills"] | typeof copy[AppLocale]["mcp_servers"];
  onBoardChange: (patch: Partial<BoardState>) => void;
}) {
  const payload = boardState.payload;
  const rows = payload?.data ?? [];
  const total = payload?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / boardState.pageSize));
  const boardCopy = labels.boards[board];

  const spotlightRows = rows.slice(0, 3);

  return (
    <section
      className="w-full overflow-hidden rounded-[var(--radius-panel)] p-5"
      style={{ border: "1px solid var(--border)", background: "var(--surface-card)", boxShadow: "var(--shadow-md)" }}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold tracking-tight" style={{ color: "var(--text)" }}>{boardCopy.title}</h3>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{boardCopy.subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
            <span>{ui.rows}</span>
            <select
              className="h-7 rounded-lg border px-2 text-xs"
              style={{ borderColor: "var(--border)", background: "var(--surface-subtle)", color: "var(--text)" }}
              value={boardState.pageSize}
              onChange={(event) => onBoardChange({ pageSize: Number(event.target.value), page: 1 })}
            >
              {ROW_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <div className="text-right text-xs" style={{ color: "var(--text-faint)" }}>
            {rows.length} / {total}
          </div>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        {spotlightRows.map((row, index) => (
          <SpotlightCard key={String(row.id)} row={row} index={index} category={category} label={labels.spotlightLabel} />
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
        <select
          className="h-8 rounded-lg border px-2"
          style={{ borderColor: "var(--border)", background: "var(--surface-subtle)", color: "var(--text)" }}
          value={boardState.sort}
          onChange={(event) => onBoardChange({ sort: event.target.value as SortType, page: 1 })}
        >
          <option value="installs">{ui.sort}: installs</option>
          <option value="rank">{ui.sort}: rank</option>
          <option value="name">{ui.sort}: name</option>
        </select>
        <select
          className="h-8 rounded-lg border px-2"
          style={{ borderColor: "var(--border)", background: "var(--surface-subtle)", color: "var(--text)" }}
          value={boardState.order}
          onChange={(event) => onBoardChange({ order: event.target.value as SortOrder, page: 1 })}
        >
          <option value="desc">{ui.order}: desc</option>
          <option value="asc">{ui.order}: asc</option>
        </select>
      </div>

      {boardState.loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="h-11 animate-pulse rounded-xl bg-slate-200/70 dark:bg-white/10" />
          ))}
        </div>
      ) : boardState.error ? (
        <p style={{ color: "var(--text-muted)" }}>{boardState.error}</p>
      ) : rows.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>{ui.empty}</p>
      ) : (
        <div className="relative">
          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white dark:border-white/8 dark:bg-white/[0.02]">
            <table className="w-full min-w-[1320px] text-left text-sm">
              <thead className="whitespace-nowrap bg-slate-50 text-xs tracking-[0.14em] text-slate-500 dark:bg-white/[0.03] dark:text-slate-400">
                {category === "skills" ? <SkillsHeader board={board} /> : <McpHeader board={board} />}
              </thead>
              <tbody>
                {rows.map((row) => (
                  category === "skills"
                    ? <SkillsRow key={String(row.id)} row={row as SkillRow} board={board} />
                    : <McpRow key={String(row.id)} row={row as McpServerRow} board={board} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-xs" style={{ color: "var(--text-faint)" }}>
        <span>
          {ui.source}: {payload?.sourceName ?? "-"} · {ui.updated}: {formatTime(payload?.snapshotAt ?? null)}
        </span>
        <div className="flex items-center gap-2">
          <button
            className="rounded border px-2 py-1 disabled:opacity-50"
            disabled={boardState.page <= 1}
            onClick={() => onBoardChange({ page: Math.max(1, boardState.page - 1) })}
          >
            {ui.prev}
          </button>
          <span>{boardState.page}/{totalPages}</span>
          <button
            className="rounded border px-2 py-1 disabled:opacity-50"
            disabled={boardState.page >= totalPages}
            onClick={() => onBoardChange({ page: Math.min(totalPages, boardState.page + 1) })}
          >
            {ui.next}
          </button>
        </div>
      </div>
    </section>
  );
}

function SkillsHeader({ board }: { board: BoardKey }) {
  if (board === "trending24h") {
    return (
      <tr>
        {[
          "Skill",
          "24h Δ",
          "Installs",
          "View",
          "Provider",
          "Officiality",
          "Source",
          "Updated",
        ].map((column) => <th key={column} className="px-4 py-2">{column}</th>)}
      </tr>
    );
  }
  if (board === "top") {
    return (
      <tr>
        {["Rank", "Skill", "Provider", "Installs", "Officiality", "Source", "Updated"].map((column) => (
          <th key={column} className="px-4 py-2">{column}</th>
        ))}
      </tr>
    );
  }
  return (
    <tr>
      {[
        "Rank",
        "Skill",
        "Provider",
        "Repository",
        "Description",
        "Installs",
        "Installs Yday",
        "24h Δ",
        "Officiality",
        "Primary Source",
        "Match",
        "Enriched By",
        "Updated",
      ].map((column) => <th key={column} className="px-4 py-2">{column}</th>)}
    </tr>
  );
}

function McpHeader({ board }: { board: BoardKey }) {
  if (board === "trending24h") {
    return (
      <tr>
        {["Server", "24h Δ", "Installs", "Owner", "Source", "Updated"].map((column) => (
          <th key={column} className="px-4 py-2">{column}</th>
        ))}
      </tr>
    );
  }
  if (board === "top") {
    return (
      <tr>
        {["Rank", "Server", "Owner", "Installs", "Officiality", "Source", "Updated"].map((column) => (
          <th key={column} className="px-4 py-2">{column}</th>
        ))}
      </tr>
    );
  }
  return (
    <tr>
      {["Rank", "Server", "Owner", "Category", "Installs", "Officiality", "Primary Source", "Enriched By", "Description", "Updated"].map((column) => (
        <th key={column} className="px-4 py-2">{column}</th>
      ))}
    </tr>
  );
}

function SkillsRow({ row, board }: { row: SkillRow; board: BoardKey }) {
  const name = row.displayName || row.skill;
  if (board === "trending24h") {
    return (
      <tr className="border-t border-slate-200/70 text-slate-700 dark:border-white/8 dark:text-slate-300">
        <td className="px-4 py-2 font-semibold text-slate-900 dark:text-white">{name}</td>
        <td className="px-4 py-2">{renderDelta(row.delta24h ?? row.change24h ?? null)}</td>
        <td className="px-4 py-2 tabular-nums">{fmtInt(row.installs)}</td>
        <td className="px-4 py-2">{row.view}</td>
        <td className="px-4 py-2">{row.provider ?? "-"}</td>
        <td className="px-4 py-2">{row.officiality}</td>
        <td className="px-4 py-2">{row.primarySource}</td>
        <td className="px-4 py-2">{formatTime(row.updatedAt ?? null)}</td>
      </tr>
    );
  }
  if (board === "top") {
    return (
      <tr className="border-t border-slate-200/70 text-slate-700 dark:border-white/8 dark:text-slate-300">
        <td className="px-4 py-2 tabular-nums">{row.rank ?? "-"}</td>
        <td className="px-4 py-2 font-semibold text-slate-900 dark:text-white">{name}</td>
        <td className="px-4 py-2">{row.provider ?? "-"}</td>
        <td className="px-4 py-2 tabular-nums">{fmtInt(row.installs)}</td>
        <td className="px-4 py-2">{row.officiality}</td>
        <td className="px-4 py-2">{row.primarySource}</td>
        <td className="px-4 py-2">{formatTime(row.updatedAt ?? null)}</td>
      </tr>
    );
  }
  return (
    <tr className="border-t border-slate-200/70 text-slate-700 dark:border-white/8 dark:text-slate-300">
      <td className="px-4 py-2 tabular-nums">{row.rank ?? "-"}</td>
      <td className="px-4 py-2 font-semibold text-slate-900 dark:text-white">{name}</td>
      <td className="px-4 py-2">{row.provider ?? "-"}</td>
      <td className="px-4 py-2">{row.repository ?? "-"}</td>
      <DescriptionCell value={row.description} />
      <td className="px-4 py-2 tabular-nums">{fmtInt(row.installs)}</td>
      <td className="px-4 py-2 tabular-nums">{fmtInt(row.installsYesterday)}</td>
      <td className="px-4 py-2">{renderDelta(row.change24h)}</td>
      <td className="px-4 py-2">{row.officiality}</td>
      <td className="px-4 py-2">{row.primarySource}</td>
      <td className="px-4 py-2">{row.matchMethod ?? "-"} {typeof row.matchConfidence === "number" ? `(${row.matchConfidence.toFixed(2)})` : ""}</td>
      <td className="px-4 py-2">{(row.enrichedBy ?? []).join(", ") || "-"}</td>
      <td className="px-4 py-2">{formatTime(row.updatedAt ?? null)}</td>
    </tr>
  );
}

function McpRow({ row, board }: { row: McpServerRow; board: BoardKey }) {
  const name = row.displayName || row.server;
  if (board === "trending24h") {
    return (
      <tr className="border-t border-slate-200/70 text-slate-700 dark:border-white/8 dark:text-slate-300">
        <td className="px-4 py-2 font-semibold text-slate-900 dark:text-white">{name}</td>
        <td className="px-4 py-2">{renderDelta(row.delta24h ?? null)}</td>
        <td className="px-4 py-2 tabular-nums">{fmtInt(row.installs)}</td>
        <td className="px-4 py-2">{row.owner ?? "-"}</td>
        <td className="px-4 py-2">{row.primarySource}</td>
        <td className="px-4 py-2">{formatTime(row.updatedAt ?? null)}</td>
      </tr>
    );
  }
  if (board === "top") {
    return (
      <tr className="border-t border-slate-200/70 text-slate-700 dark:border-white/8 dark:text-slate-300">
        <td className="px-4 py-2 tabular-nums">{row.rank ?? "-"}</td>
        <td className="px-4 py-2 font-semibold text-slate-900 dark:text-white">{name}</td>
        <td className="px-4 py-2">{row.owner ?? "-"}</td>
        <td className="px-4 py-2 tabular-nums">{fmtInt(row.installs)}</td>
        <td className="px-4 py-2">{row.officiality}</td>
        <td className="px-4 py-2">{row.primarySource}</td>
        <td className="px-4 py-2">{formatTime(row.updatedAt ?? null)}</td>
      </tr>
    );
  }
  return (
    <tr className="border-t border-slate-200/70 text-slate-700 dark:border-white/8 dark:text-slate-300">
      <td className="px-4 py-2 tabular-nums">{row.rank ?? "-"}</td>
      <td className="px-4 py-2 font-semibold text-slate-900 dark:text-white">{name}</td>
      <td className="px-4 py-2">{row.owner ?? "-"}</td>
      <td className="px-4 py-2">{row.category ?? "-"}</td>
      <td className="px-4 py-2 tabular-nums">{fmtInt(row.installs)}</td>
      <td className="px-4 py-2">{row.officiality}</td>
      <td className="px-4 py-2">{row.primarySource}</td>
      <td className="px-4 py-2">{(row.enrichedBy ?? []).join(", ") || "-"}</td>
      <DescriptionCell value={row.description} />
      <td className="px-4 py-2">{formatTime(row.updatedAt ?? null)}</td>
    </tr>
  );
}

function DescriptionCell({ value }: { value: string | null | undefined }) {
  const text = (value ?? "").trim();
  if (!text) {
    return <td className="max-w-[360px] px-4 py-2">-</td>;
  }
  return (
    <td className="max-w-[360px] px-4 py-2">
      <span
        className="block overflow-hidden text-ellipsis"
        title={text}
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          lineHeight: 1.35,
          maxHeight: "2.7em",
        }}
      >
        {text}
      </span>
    </td>
  );
}

function SpotlightCard({
  row,
  index,
  category,
  label,
}: {
  row: SkillRow | McpServerRow;
  index: number;
  category: Category;
  label: string;
}) {
  const isSkill = category === "skills";
  const name = (isSkill ? (row as SkillRow).displayName ?? (row as SkillRow).skill : (row as McpServerRow).displayName ?? (row as McpServerRow).server) || "-";
  const installs = row.installs ?? null;
  const delta = (row as SkillRow).delta24h ?? (row as SkillRow).change24h ?? (row as McpServerRow).delta24h ?? null;

  return (
    <article className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-subtle)" }}>
      <div className="mb-1 flex items-center justify-between text-[11px]" style={{ color: "var(--text-faint)" }}>
        <span>{label}</span>
        <span>#{index + 1}</span>
      </div>
      <p className="truncate text-sm font-semibold" style={{ color: "var(--text)" }}>{name}</p>
      <div className="mt-2 flex items-center justify-between text-xs" style={{ color: "var(--text-muted)" }}>
        <span>Installs</span>
        <span className="tabular-nums">{fmtInt(installs)}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200/70 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,var(--tt-red),var(--tt-blue))]"
          style={{ width: `${Math.min(100, Math.max(5, installs ? Math.log10(installs + 1) * 20 : 5))}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs" style={{ color: "var(--text-muted)" }}>
        <span>24h</span>
        <span>{renderDelta(delta)}</span>
      </div>
    </article>
  );
}

function renderDelta(value: number | null | undefined) {
  if (typeof value !== "number") {
    return <span className="inline-flex items-center gap-1"><Minus className="h-3 w-3" />-</span>;
  }
  if (value > 0) {
    return <span className="inline-flex items-center gap-1 text-emerald-600"><ArrowUp className="h-3 w-3" />+{fmtInt(value)}</span>;
  }
  if (value < 0) {
    return <span className="inline-flex items-center gap-1 text-red-600"><ArrowDown className="h-3 w-3" />{fmtInt(value)}</span>;
  }
  return <span className="inline-flex items-center gap-1"><Minus className="h-3 w-3" />0</span>;
}

function fmtInt(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)}`;
}
