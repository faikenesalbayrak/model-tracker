import { canonicalRecordId, normalizeLabName } from "@/lib/canonical-map";
import { buildConfidence, createRecord, stampRecords } from "@/lib/normalize/common";
import type { NormalizedRecord } from "@/lib/types";

export interface SemanticScholarAuthor {
  authorId?: string;
  name?: string;
}

export interface SemanticScholarPaper {
  paperId?: string;
  title?: string;
  abstract?: string;
  venue?: string;
  year?: number;
  publicationDate?: string;
  citationCount?: number;
  url?: string;
  openAccessPdf?: {
    url?: string;
    status?: string;
  };
  authors?: SemanticScholarAuthor[];
  externalIds?: {
    DOI?: string;
    ArXiv?: string;
    CorpusId?: string;
    PMID?: string;
  };
  fieldsOfStudy?: string[];
}

export interface SemanticScholarSearchResponse {
  total?: number;
  offset?: number;
  next?: number;
  data?: SemanticScholarPaper[];
}

const OFFLINE_FALLBACK_PAPERS: SemanticScholarPaper[] = [
  {
    paperId: "attention-is-all-you-need",
    title: "Attention Is All You Need",
    venue: "NeurIPS",
    year: 2017,
    publicationDate: "2017-06-12",
    citationCount: 100000,
    url: "https://arxiv.org/abs/1706.03762",
    authors: [{ name: "Ashish Vaswani" }, { name: "Noam Shazeer" }],
    fieldsOfStudy: ["Computer Science"],
  },
  {
    paperId: "bert-pre-training-of-deep-bidirectional-transformers",
    title: "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
    venue: "NAACL",
    year: 2018,
    publicationDate: "2018-10-11",
    citationCount: 90000,
    url: "https://arxiv.org/abs/1810.04805",
    authors: [{ name: "Jacob Devlin" }, { name: "Ming-Wei Chang" }],
    fieldsOfStudy: ["Computer Science"],
  },
  {
    paperId: "training-compute-optimal-large-language-models",
    title: "Training Compute-Optimal Large Language Models",
    venue: "arXiv",
    year: 2022,
    publicationDate: "2022-03-29",
    citationCount: 18000,
    url: "https://arxiv.org/abs/2203.15556",
    authors: [{ name: "Jordan Hoffmann" }, { name: "Sebastian Borgeaud" }],
    fieldsOfStudy: ["Computer Science"],
  },
  {
    paperId: "llama-2-open-foundation-and-fine-tuned-chat-models",
    title: "Llama 2: Open Foundation and Fine-Tuned Chat Models",
    venue: "arXiv",
    year: 2023,
    publicationDate: "2023-07-18",
    citationCount: 25000,
    url: "https://arxiv.org/abs/2307.09288",
    authors: [{ name: "Hugo Touvron" }, { name: "Lewis Tunstall" }],
    fieldsOfStudy: ["Computer Science"],
  },
  {
    paperId: "scaling-laws-for-neural-language-models",
    title: "Scaling Laws for Neural Language Models",
    venue: "arXiv",
    year: 2020,
    publicationDate: "2020-01-20",
    citationCount: 12000,
    url: "https://arxiv.org/abs/2001.08361",
    authors: [{ name: "Jared Kaplan" }, { name: "Sam McCandlish" }],
    fieldsOfStudy: ["Computer Science"],
  },
];

function safeTitle(paper: SemanticScholarPaper): string {
  return paper.title?.trim() || paper.paperId || "Unknown paper";
}

function safeTimestamp(paper: SemanticScholarPaper, fallback: string): string {
  if (typeof paper.publicationDate === "string" && paper.publicationDate.trim()) {
    const parsed = Date.parse(paper.publicationDate);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  if (typeof paper.year === "number" && Number.isFinite(paper.year)) {
    return new Date(Date.UTC(paper.year, 0, 1)).toISOString();
  }

  return fallback;
}

function safePaperUrl(paper: SemanticScholarPaper): string | undefined {
  if (typeof paper.url === "string" && paper.url.trim()) {
    return paper.url.trim();
  }

  if (typeof paper.openAccessPdf?.url === "string" && paper.openAccessPdf.url.trim()) {
    return paper.openAccessPdf.url.trim();
  }

  if (typeof paper.paperId === "string" && paper.paperId.trim()) {
    return `https://www.semanticscholar.org/paper/${encodeURIComponent(paper.paperId)}`;
  }

  return undefined;
}

function safeLab(paper: SemanticScholarPaper): string {
  const venue = paper.venue?.trim();
  if (venue) {
    return normalizeLabName(venue) ?? venue;
  }

  const firstAuthor = paper.authors?.[0]?.name?.trim();
  if (firstAuthor) {
    return normalizeLabName(firstAuthor) ?? firstAuthor;
  }

  return "Semantic Scholar";
}

export function normalizeSemanticScholarPapers(
  response: SemanticScholarSearchResponse,
  lastSuccessAt: string,
  query: string,
  sourceUrl: string,
): NormalizedRecord[] {
  const seen = new Set<string>();

  const records = (response.data ?? [])
    .map((paper, index) => {
      const paperId = paper.paperId?.trim() || paper.title?.trim() || `paper-${index}`;
      if (seen.has(paperId)) {
        return null;
      }
      seen.add(paperId);

      const title = safeTitle(paper);
      const lab = safeLab(paper);
      const timestamp = safeTimestamp(paper, lastSuccessAt);
      const paperUrl = safePaperUrl(paper);
      const citationCount = typeof paper.citationCount === "number" && Number.isFinite(paper.citationCount)
        ? paper.citationCount
        : null;
      const abstract = typeof paper.abstract === "string" ? paper.abstract.trim() : "";
      const authorNames = (paper.authors ?? [])
        .map((author) => author.name?.trim())
        .filter((name): name is string => Boolean(name));

      return createRecord({
        id: canonicalRecordId(lab, paperId, "release"),
        kind: "release",
        lab,
        source: "semantic_scholar_public",
        value: citationCount,
        title,
        subtitle: paper.venue?.trim() || (paper.year ? String(paper.year) : "Semantic Scholar"),
        url: paperUrl,
        timestamp,
        confidence: buildConfidence({
          hasFreshTimestamp: Boolean(paper.publicationDate ?? paper.year),
          hasSummary: Boolean(abstract),
        }),
        last_success_at: lastSuccessAt,
        payload: {
          provider: "semantic_scholar",
          query,
          paper_id: paper.paperId ?? null,
          paper_url: paperUrl ?? null,
          source_url: sourceUrl,
          title,
          abstract: abstract || null,
          venue: paper.venue ?? null,
          year: paper.year ?? null,
          citation_count: citationCount,
          authors: authorNames,
          external_ids: paper.externalIds ?? null,
          fields_of_study: paper.fieldsOfStudy ?? [],
          open_access_pdf: paper.openAccessPdf ?? null,
        },
      });
    })
    .filter((record): record is NormalizedRecord => Boolean(record));

  return stampRecords(
    records.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)),
    lastSuccessAt,
  );
}

export function offlineSemanticScholarFallback(
  query: string,
  lastSuccessAt: string,
  sourceUrl: string,
): NormalizedRecord[] {
  const queryTokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]+/g, ""))
    .filter(Boolean);

  const scored = OFFLINE_FALLBACK_PAPERS.map((paper) => {
    const haystack = [
      paper.title ?? "",
      paper.abstract ?? "",
      paper.venue ?? "",
      paper.authors?.map((author) => author.name ?? "").join(" ") ?? "",
    ]
      .join(" ")
      .toLowerCase();

    const score = queryTokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
    return { paper, score };
  });

  const ordered = scored
    .sort((a, b) => b.score - a.score || (b.paper.year ?? 0) - (a.paper.year ?? 0))
    .map((item) => item.paper);

  return normalizeSemanticScholarPapers(
    { data: ordered },
    lastSuccessAt,
    query,
    sourceUrl,
  ).map((record) => ({
    ...record,
    confidence: "low",
    payload: {
      ...record.payload,
      fallback: true,
    },
  }));
}
