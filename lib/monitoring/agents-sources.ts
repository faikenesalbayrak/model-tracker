import { fetchWithRetry } from "@/lib/fetcher";
import type { NormalizedMcpEntry, NormalizedSkillEntry, Officiality } from "@/lib/monitoring/contracts";

interface SourceHealthSample {
  sourceName: string;
  success: boolean;
  latencyMs: number;
  errorMessage?: string;
}

export interface AgentCatalogCollectionResult {
  skills: NormalizedSkillEntry[];
  mcp: NormalizedMcpEntry[];
  sourceHealth: SourceHealthSample[];
}

type RawSkillSeed = {
  source: string;
  skillId: string;
  name: string;
  installs: number;
  installsYesterday?: number;
  change?: number;
};

type RawMcpSeed = {
  sourceServerId: string;
  name: string;
  category?: string;
  description?: string;
  installs?: number;
  sourceUrl?: string;
};

const MCP_FALLBACK_ROWS: RawMcpSeed[] = [
  { sourceServerId: "mcp-github", name: "GitHub MCP", installs: 142, sourceUrl: "https://github.com" },
  { sourceServerId: "mcp-notion", name: "Notion MCP", installs: 113, sourceUrl: "https://notion.so" },
  { sourceServerId: "mcp-slack", name: "Slack MCP", installs: 104, sourceUrl: "https://slack.com" },
  { sourceServerId: "mcp-jira", name: "Jira MCP", installs: 93, sourceUrl: "https://atlassian.com" },
  { sourceServerId: "mcp-google-drive", name: "Google Drive MCP", installs: 88, sourceUrl: "https://drive.google.com" },
];

const SKILLS_SH_BASE = "https://skills.sh";
const SKILLS_RANK_BASE = "https://skills-rank.com";
const MCPMARKET_BASE = "https://mcpmarket.com";
const GETMYMCP_BASE = "https://www.getmymcp.com";
const MCPSERVERS_BASE = "https://mcpservers.org";
const MCPSMITH_BASE = "https://mcpsmith.com";

const OFFICIAL_REPO_ALLOWLIST = [
  "anthropics/skills",
  "vercel-labs/skills",
  "vercel-labs/agent-skills",
  "microsoft/azure-skills",
  "microsoft/github-copilot-for-azure",
  "openai",
  "google-gemini/gemini-skills",
  "cloudflare/skills",
  "langchain-ai/langchain-skills",
];

const OFFICIAL_VENDOR_ALLOWLIST = [
  "openai",
  "anthropic",
  "google",
  "microsoft",
  "github",
  "cloudflare",
  "vercel",
  "elevenlabs",
];

function toCanonicalToken(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function inferOfficiality(input: { repository?: string; provider?: string; source?: string }): Officiality {
  const repo = (input.repository ?? "").toLowerCase();
  if (repo) {
    if (OFFICIAL_REPO_ALLOWLIST.some((item) => repo.includes(item))) return "official";
    if (repo.includes("/")) return "unofficial";
  }

  const provider = (input.provider ?? "").toLowerCase();
  if (provider) {
    if (OFFICIAL_VENDOR_ALLOWLIST.some((item) => provider.includes(item))) return "official";
    return "unofficial";
  }

  const source = (input.source ?? "").toLowerCase();
  if (source.includes("official")) return "official";
  return "unknown";
}

async function fetchHtml(url: string, allowedHosts: string[], timeoutMs: number): Promise<string> {
  const { data } = await fetchWithRetry<string>(
    url,
    {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "model-tracker-monitoring/1.0",
      },
    },
    async (response) => response.text(),
    { allowedHosts, timeoutMs },
  );
  return data;
}

function parseSkillsShRows(html: string): RawSkillSeed[] {
  const rows: RawSkillSeed[] = [];
  const patterns = [
    /\{"source":"([^"\\]+)","skillId":"([^"\\]+)","name":"([^"\\]+)","installs":(\d+)(?:,"installsYesterday":(\d+),"change":(-?\d+))?\}/g,
    /\{\\"source\\":\\"([^"\\]+)\\",\\"skillId\\":\\"([^"\\]+)\\",\\"name\\":\\"([^"\\]+)\\",\\"installs\\":(\d+)(?:,\\"installsYesterday\\":(\d+),\\"change\\":(-?\d+))?\}/g,
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const source = match[1]?.trim();
      const skillId = match[2]?.trim();
      const name = match[3]?.trim();
      const installs = Number(match[4]);
      if (!source || !skillId || !name || !Number.isFinite(installs)) continue;
      rows.push({
        source,
        skillId,
        name,
        installs,
        installsYesterday: match[5] ? Number(match[5]) : undefined,
        change: match[6] ? Number(match[6]) : undefined,
      });
    }
    if (rows.length > 0) break;
  }

  return rows;
}

function parseSkillsRankDetail(html: string): { description?: string; repository?: string; rank?: number; installs?: number } {
  const clean = html.replace(/\s+/g, " ");

  const repoMatch = clean.match(/(?:仓库|Repo(?:sitory)?):\s*<[^>]*>\s*([^<\s]+\/[^<\s]+)\s*</i);
  const rankMatch = clean.match(/(?:排名|Rank):\s*#?(\d+)/i);
  const installsMatch = clean.match(/(?:安装量|Installs?):\s*([\d,]+)/i);
  const descMatch = clean.match(/<div class="prose[^>]*>\s*<p><strong>([^<]{10,300})<\/strong><\/p>/i);

  const repository = repoMatch?.[1]?.trim();
  const rank = rankMatch ? Number(rankMatch[1]) : undefined;
  const installs = installsMatch ? Number(installsMatch[1].replace(/,/g, "")) : undefined;
  const description = descMatch?.[1]?.trim();

  return {
    repository,
    rank: Number.isFinite(rank) ? rank : undefined,
    installs: Number.isFinite(installs) ? installs : undefined,
    description,
  };
}

function parseAnchorCards(html: string, hrefMatchers: RegExp[]): Array<{ name: string; href: string; category?: string; description?: string; installs?: number }> {
  const out: Array<{ name: string; href: string; category?: string; description?: string; installs?: number }> = [];
  const anchorPattern = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const href = match[1] ?? "";
    if (!hrefMatchers.some((rx) => rx.test(href))) continue;

    const rawInner = match[2] ?? "";
    const inner = rawInner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!inner) continue;

    const h3Match = rawInner.match(/<h3[^>]*>([^<]+)<\/h3>/i);
    const name = (h3Match?.[1] ?? inner.split(" ").slice(0, 8).join(" ")).trim();
    if (!name || name.length < 2) continue;

    const around = html.slice(Math.max(0, match.index - 240), Math.min(html.length, (match.index ?? 0) + 480));
    const installsMatch = around.match(/([\d]{1,3}(?:,[\d]{3})+|\d{2,})/);
    const categoryMatch = around.match(/(Developer Tools|API Development|Data Science(?:\s*&\s*ML)?|Productivity(?:\s*&\s*Workflow)?|Analytics(?:\s*&\s*Monitoring)?|Database Management)/i);

    out.push({
      name,
      href,
      category: categoryMatch?.[1],
      installs: installsMatch ? Number(installsMatch[1].replace(/,/g, "")) : undefined,
      description: inner,
    });
  }

  return out;
}

function mergeSkills(rows: NormalizedSkillEntry[]): NormalizedSkillEntry[] {
  const merged = new Map<string, NormalizedSkillEntry>();

  for (const row of rows) {
    const key = `${row.view}::${row.canonicalSkillKey}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, row);
      continue;
    }

    const candidate = { ...existing };
    const enrichedBy = new Set<string>([...(existing.enrichedBy ?? []), ...(row.enrichedBy ?? [])]);

    if ((!candidate.description || candidate.description.length < 20) && row.description) {
      candidate.description = row.description;
    }
    if (!candidate.repository && row.repository) {
      candidate.repository = row.repository;
    }
    if ((candidate.rank == null || candidate.rank <= 0) && row.rank != null) {
      candidate.rank = row.rank;
    }
    if ((candidate.installs == null || candidate.installs <= 0) && row.installs != null) {
      candidate.installs = row.installs;
    }
    if ((candidate.matchConfidence ?? 0) < (row.matchConfidence ?? 0)) {
      candidate.matchConfidence = row.matchConfidence;
      candidate.matchMethod = row.matchMethod;
    }

    candidate.enrichedBy = [...enrichedBy];
    candidate.payload = { ...(candidate.payload ?? {}), ...(row.payload ?? {}) };
    merged.set(key, candidate);
  }

  return [...merged.values()].sort((a, b) => {
    const ai = a.installs ?? -1;
    const bi = b.installs ?? -1;
    if (bi !== ai) return bi - ai;
    return (a.rank ?? 999999) - (b.rank ?? 999999);
  });
}

function mergeMcp(rows: NormalizedMcpEntry[]): NormalizedMcpEntry[] {
  const merged = new Map<string, NormalizedMcpEntry>();

  for (const row of rows) {
    const existing = merged.get(row.canonicalMcpKey);
    if (!existing) {
      merged.set(row.canonicalMcpKey, row);
      continue;
    }

    const enrichedBy = new Set<string>([...(existing.enrichedBy ?? []), ...(row.enrichedBy ?? [])]);
    const candidate = { ...existing };

    if ((!candidate.description || candidate.description.length < 20) && row.description) {
      candidate.description = row.description;
    }
    if (!candidate.repository && row.repository) {
      candidate.repository = row.repository;
    }
    if ((candidate.installs ?? 0) < (row.installs ?? 0)) {
      candidate.installs = row.installs;
      candidate.rank = row.rank ?? candidate.rank;
    }
    if (candidate.officiality !== "official" && row.officiality === "official") {
      candidate.officiality = "official";
    }

    candidate.enrichedBy = [...enrichedBy];
    candidate.payload = { ...(candidate.payload ?? {}), ...(row.payload ?? {}) };
    merged.set(row.canonicalMcpKey, candidate);
  }

  return [...merged.values()].sort((a, b) => {
    const ai = a.installs ?? -1;
    const bi = b.installs ?? -1;
    if (bi !== ai) return bi - ai;
    return (a.rank ?? 999999) - (b.rank ?? 999999);
  });
}

async function collectSkills(nowIso: string, timeoutMs: number, sourceHealth: SourceHealthSample[]): Promise<NormalizedSkillEntry[]> {
  const views: Array<{ view: "all_time" | "trending" | "hot"; url: string }> = [
    { view: "all_time", url: `${SKILLS_SH_BASE}/` },
    { view: "trending", url: `${SKILLS_SH_BASE}/trending` },
    { view: "hot", url: `${SKILLS_SH_BASE}/hot` },
  ];

  const baseRows: NormalizedSkillEntry[] = [];

  for (const item of views) {
    const startedAt = Date.now();
    try {
      const html = await fetchHtml(item.url, ["skills.sh", "www.skills.sh"], timeoutMs);
      const rows = parseSkillsShRows(html);
      for (const [index, row] of rows.entries()) {
        const canonicalSkillKey = `${toCanonicalToken(row.source)}::${toCanonicalToken(row.skillId)}`;
        baseRows.push({
          canonicalSkillKey,
          sourceSkillId: row.skillId,
          name: row.name,
          provider: row.source,
          repository: row.source,
          view: item.view,
          installs: row.installs,
          installsYesterday: row.installsYesterday,
          change24h: row.change,
          rank: index + 1,
          officiality: inferOfficiality({ repository: row.source, provider: row.source }),
          matchConfidence: 1,
          matchMethod: "strict",
          primarySource: "skills_sh",
          enrichedBy: [],
          payload: {
            source: row.source,
            observed_at: nowIso,
            view: item.view,
          },
        });
      }
      sourceHealth.push({ sourceName: "skills_sh", success: true, latencyMs: Date.now() - startedAt });
    } catch (error) {
      sourceHealth.push({
        sourceName: "skills_sh",
        success: false,
        latencyMs: Date.now() - startedAt,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Best-effort enrichment from skills-rank (top corpus window for cost control)
  const enrichmentCandidates = [...baseRows]
    .filter((item) => item.view === "all_time")
    .sort((a, b) => (b.installs ?? 0) - (a.installs ?? 0))
    .slice(0, 180);

  if (enrichmentCandidates.length > 0) {
    const startedAt = Date.now();
    try {
      const enriched = await Promise.all(
        enrichmentCandidates.map(async (item) => {
          const providerPath = (item.provider ?? "").trim();
          if (!providerPath || !item.sourceSkillId) return null;

          const detailUrl = `${SKILLS_RANK_BASE}/skill/${providerPath}/${encodeURIComponent(item.sourceSkillId)}`;
          try {
            const html = await fetchHtml(detailUrl, ["skills-rank.com"], timeoutMs);
            const details = parseSkillsRankDetail(html);
            return {
              ...item,
              description: details.description ?? item.description,
              repository: details.repository ?? item.repository,
              rank: details.rank ?? item.rank,
              installs: details.installs ?? item.installs,
              matchConfidence: 0.92,
              matchMethod: "strict" as const,
              enrichedBy: [...(item.enrichedBy ?? []), "skills_rank"],
              payload: {
                ...(item.payload ?? {}),
                skills_rank_url: detailUrl,
              },
            } satisfies NormalizedSkillEntry;
          } catch {
            return null;
          }
        }),
      );

      for (const row of enriched) {
        if (!row) continue;
        baseRows.push(row);
      }
      sourceHealth.push({ sourceName: "skills_rank", success: true, latencyMs: Date.now() - startedAt });
    } catch (error) {
      sourceHealth.push({
        sourceName: "skills_rank",
        success: false,
        latencyMs: Date.now() - startedAt,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Optional skill signal from MCP Market skills listing page.
  const mcpMarketSkillStarted = Date.now();
  try {
    const html = await fetchHtml(`${MCPMARKET_BASE}/skills`, ["mcpmarket.com"], timeoutMs);
    const cards = parseAnchorCards(html, [/\/skills?\//i]);
    for (const [idx, card] of cards.entries()) {
      const keyBase = toCanonicalToken(card.href || card.name);
      baseRows.push({
        canonicalSkillKey: `mcpmarket::${keyBase}`,
        sourceSkillId: keyBase,
        name: card.name,
        provider: "mcpmarket",
        view: "hot",
        installs: card.installs,
        rank: idx + 1,
        officiality: inferOfficiality({ source: card.description }),
        matchConfidence: 0.55,
        matchMethod: "fuzzy",
        primarySource: "mcpmarket_catalog",
        enrichedBy: ["mcpmarket_catalog"],
        payload: {
          category: card.category,
          source_url: card.href,
          mcpmarket_skill_signal: true,
        },
      });
    }
    sourceHealth.push({ sourceName: "mcpmarket_catalog", success: true, latencyMs: Date.now() - mcpMarketSkillStarted });
  } catch (error) {
    sourceHealth.push({
      sourceName: "mcpmarket_catalog",
      success: false,
      latencyMs: Date.now() - mcpMarketSkillStarted,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  return mergeSkills(baseRows);
}

function mcpEntryFromRaw(raw: RawMcpSeed, sourceName: string, rank: number): NormalizedMcpEntry {
  const repoHost = raw.sourceUrl ? new URL(raw.sourceUrl, "https://example.com").hostname.replace(/^www\./, "") : "";
  const canonicalMcpKey = `${toCanonicalToken(raw.name)}${repoHost ? `::${toCanonicalToken(repoHost)}` : ""}`;

  return {
    canonicalMcpKey,
    sourceServerId: raw.sourceServerId,
    name: raw.name,
    category: raw.category,
    description: raw.description,
    installs: raw.installs,
    rank,
    officiality: inferOfficiality({ source: raw.description, provider: raw.name }),
    primarySource: sourceName,
    enrichedBy: [],
    payload: {
      source_url: raw.sourceUrl,
      source_name: sourceName,
    },
  };
}

async function collectMcp(timeoutMs: number, sourceHealth: SourceHealthSample[]): Promise<NormalizedMcpEntry[]> {
  const rawMcp: NormalizedMcpEntry[] = [];

  const collectors: Array<{ sourceName: string; url: string; hosts: string[]; matchers: RegExp[] }> = [
    { sourceName: "mcpmarket_catalog", url: MCPMARKET_BASE, hosts: ["mcpmarket.com"], matchers: [/\/servers?\//i, /\/mcp\//i] },
    { sourceName: "getmymcp_catalog", url: `${GETMYMCP_BASE}/leaderboard`, hosts: ["www.getmymcp.com", "getmymcp.com"], matchers: [/\/servers?\//i, /\/mcp\//i] },
    { sourceName: "getmymcp_catalog", url: `${GETMYMCP_BASE}/server`, hosts: ["www.getmymcp.com", "getmymcp.com"], matchers: [/\/servers?\//i, /\/mcp\//i] },
    { sourceName: "mcpservers_catalog", url: `${MCPSERVERS_BASE}/all`, hosts: ["mcpservers.org", "www.mcpservers.org"], matchers: [/\/servers?\//i, /\/mcp\//i] },
    { sourceName: "mcpservers_catalog", url: MCPSERVERS_BASE, hosts: ["mcpservers.org", "www.mcpservers.org"], matchers: [/\/servers?\//i, /\/mcp\//i] },
    { sourceName: "mcpsmith_catalog", url: MCPSMITH_BASE, hosts: ["mcpsmith.com", "www.mcpsmith.com"], matchers: [/\/servers?\//i, /\/mcp\//i] },
  ];

  for (const collector of collectors) {
    const startedAt = Date.now();
    try {
      const html = await fetchHtml(collector.url, collector.hosts, timeoutMs);
      const cards = parseAnchorCards(html, collector.matchers);
      for (const [index, card] of cards.entries()) {
        rawMcp.push(
          mcpEntryFromRaw(
            {
              sourceServerId: toCanonicalToken(card.href || `${collector.sourceName}-${index + 1}`),
              name: card.name,
              category: card.category,
              description: card.description,
              installs: card.installs,
              sourceUrl: card.href,
            },
            collector.sourceName,
            index + 1,
          ),
        );
      }
      sourceHealth.push({ sourceName: collector.sourceName, success: true, latencyMs: Date.now() - startedAt });
    } catch (error) {
      // mcpsmith and other catalogs are fail-open best-effort.
      sourceHealth.push({
        sourceName: collector.sourceName,
        success: false,
        latencyMs: Date.now() - startedAt,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const merged = mergeMcp(rawMcp);
  if (merged.length > 0) {
    return merged;
  }

  sourceHealth.push({
    sourceName: "mcp_seed_fallback",
    success: true,
    latencyMs: 0,
  });

  return MCP_FALLBACK_ROWS.map((row, index) =>
    mcpEntryFromRaw(
      {
        ...row,
        category: row.category ?? "General",
        description: row.description ?? "Fallback MCP entry when external catalogs are unavailable.",
      },
      "mcp_seed_fallback",
      index + 1,
    ),
  );
}

export async function collectAgentCatalogSnapshot(options: {
  nowIso: string;
  timeoutMs: number;
}): Promise<AgentCatalogCollectionResult> {
  const sourceHealth: SourceHealthSample[] = [];

  const [skills, mcp] = await Promise.all([
    collectSkills(options.nowIso, options.timeoutMs, sourceHealth),
    collectMcp(options.timeoutMs, sourceHealth),
  ]);

  return { skills, mcp, sourceHealth };
}
