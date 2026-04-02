import type { AiNewsItem } from "@/components/dashboard-types";

export type NewsCardVariant = "hero" | "wide" | "tall" | "standard";

type VariantSize = {
  colSpan: number;
  rowSpan: number;
};

export type ScoredNewsItem = AiNewsItem & {
  priorityScore: number;
  variant: NewsCardVariant;
  colStart: number;
  rowStart: number;
  colSpan: number;
  rowSpan: number;
};

const SOURCE_WEIGHT: Array<{ matcher: RegExp; weight: number }> = [
  { matcher: /openai|anthropic|google|deepmind|microsoft|meta|nvidia/i, weight: 1 },
  { matcher: /reuters|techcrunch|the verge|mit|venturebeat/i, weight: 0.8 },
  { matcher: /hacker news|hn|arxiv/i, weight: 0.65 },
];

const TITLE_SIGNAL: Array<{ matcher: RegExp; weight: number }> = [
  { matcher: /release|launch|announc|introduc/i, weight: 0.32 },
  { matcher: /regulation|policy|compliance|law|act/i, weight: 0.28 },
  { matcher: /benchmark|model|agent|inference|safety|research/i, weight: 0.24 },
  { matcher: /aviation|airline|airport|flight/i, weight: 0.2 },
];

const LAYOUT_PATTERN: NewsCardVariant[] = [
  "hero",
  "tall",
  "wide",
  "wide",
  "standard",
  "tall",
  "standard",
  "wide",
  "standard",
  "standard",
];

const VARIANT_SIZE: Record<NewsCardVariant, VariantSize> = {
  hero: { colSpan: 3, rowSpan: 3 },
  wide: { colSpan: 2, rowSpan: 2 },
  tall: { colSpan: 2, rowSpan: 3 },
  standard: { colSpan: 1, rowSpan: 2 },
};

export function scoreNewsItem(item: AiNewsItem, nowMs = Date.now()): number {
  const recency = recencyScore(item.publishedAt, nowMs);
  const source = sourceScore(item.source);
  const signal = titleSignalScore(item.title);
  return Number((recency * 0.55 + source * 0.25 + signal * 0.2).toFixed(6));
}

export function variantForIndex(index: number): NewsCardVariant {
  return LAYOUT_PATTERN[index % LAYOUT_PATTERN.length] ?? "standard";
}

function variantCandidates(variant: NewsCardVariant): NewsCardVariant[] {
  if (variant === "hero") return ["hero", "tall", "wide", "standard"];
  if (variant === "tall") return ["tall", "wide", "standard"];
  if (variant === "wide") return ["wide", "standard"];
  return ["standard"];
}

function resolveVariantSize(variant: NewsCardVariant, item: AiNewsItem): VariantSize {
  const base = VARIANT_SIZE[variant];
  const titleLen = item.title.trim().length;
  const descriptionLen = (item.description ?? item.timeAgo ?? "").trim().length;
  const imageBoost = item.imageKind === "photo" ? 1 : 0;
  const textWeight = Math.floor((titleLen + descriptionLen) / 260);
  const bonus = Math.max(0, Math.min(1, textWeight + imageBoost));
  return { ...base, rowSpan: base.rowSpan + bonus };
}

type Placement = {
  rowStart: number;
  colStart: number;
  colSpan: number;
  rowSpan: number;
  variant: NewsCardVariant;
};

function ensureRow(occupancy: boolean[][], rowIndex: number, columns: number): void {
  while (occupancy.length <= rowIndex) {
    occupancy.push(Array.from({ length: columns }, () => false));
  }
}

function fitsAt(
  occupancy: boolean[][],
  rowIndex: number,
  colIndex: number,
  size: VariantSize,
  columns: number,
): boolean {
  if (colIndex + size.colSpan > columns) return false;
  for (let r = rowIndex; r < rowIndex + size.rowSpan; r += 1) {
    ensureRow(occupancy, r, columns);
    for (let c = colIndex; c < colIndex + size.colSpan; c += 1) {
      if (occupancy[r]?.[c]) return false;
    }
  }
  return true;
}

function occupy(
  occupancy: boolean[][],
  rowIndex: number,
  colIndex: number,
  size: VariantSize,
  columns: number,
): void {
  for (let r = rowIndex; r < rowIndex + size.rowSpan; r += 1) {
    ensureRow(occupancy, r, columns);
    for (let c = colIndex; c < colIndex + size.colSpan; c += 1) {
      occupancy[r][c] = true;
    }
  }
}

function nextFreeCell(occupancy: boolean[][], columns: number): { row: number; col: number } {
  let row = 0;
  while (true) {
    ensureRow(occupancy, row, columns);
    for (let col = 0; col < columns; col += 1) {
      if (!occupancy[row]?.[col]) return { row, col };
    }
    row += 1;
  }
}

function placeItem(occupancy: boolean[][], preferred: NewsCardVariant, columns: number, item: AiNewsItem): Placement {
  const { row, col } = nextFreeCell(occupancy, columns);
  const candidates = variantCandidates(preferred);

  for (const variant of candidates) {
    const size = resolveVariantSize(variant, item);
    if (fitsAt(occupancy, row, col, size, columns)) {
      occupy(occupancy, row, col, size, columns);
      return {
        rowStart: row + 1,
        colStart: col + 1,
        colSpan: size.colSpan,
        rowSpan: size.rowSpan,
        variant,
      };
    }
  }

  const fallback = VARIANT_SIZE.standard;
  occupy(occupancy, row, col, fallback, columns);
  return {
    rowStart: row + 1,
    colStart: col + 1,
    colSpan: fallback.colSpan,
    rowSpan: fallback.rowSpan,
    variant: "standard",
  };
}

export function buildNewsBento(items: AiNewsItem[], nowMs = Date.now(), columns = 6): ScoredNewsItem[] {
  const withScores = items.map((item) => ({ item, score: scoreNewsItem(item, nowMs) }));

  withScores.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    const l = Date.parse(left.item.publishedAt);
    const r = Date.parse(right.item.publishedAt);
    return (Number.isFinite(r) ? r : 0) - (Number.isFinite(l) ? l : 0);
  });

  const occupancy: boolean[][] = [];
  return withScores.map(({ item, score }, index) => {
    const preferred = variantForIndex(index);
    const placed = placeItem(occupancy, preferred, columns, item);
    return {
      ...item,
      priorityScore: score,
      variant: placed.variant,
      colStart: placed.colStart,
      rowStart: placed.rowStart,
      colSpan: placed.colSpan,
      rowSpan: placed.rowSpan,
    };
  });
}

export function layoutClassForVariant(variant: NewsCardVariant): string {
  const size = VARIANT_SIZE[variant];
  return `md:col-span-${size.colSpan} md:row-span-${size.rowSpan}`;
}

function recencyScore(publishedAt: string, nowMs: number): number {
  const ts = Date.parse(publishedAt);
  if (!Number.isFinite(ts)) return 0;
  const hours = Math.max(0, (nowMs - ts) / (1000 * 60 * 60));
  const decay = Math.min(1.2, hours / 96);
  return Number(Math.max(0, 1.2 - decay).toFixed(6));
}

function sourceScore(source: string): number {
  const value = source.trim();
  if (!value) return 0;
  for (const entry of SOURCE_WEIGHT) {
    if (entry.matcher.test(value)) return entry.weight;
  }
  return 0.45;
}

function titleSignalScore(title: string): number {
  const text = title.trim();
  if (!text) return 0;

  let score = 0;
  for (const entry of TITLE_SIGNAL) {
    if (entry.matcher.test(text)) score += entry.weight;
  }

  const len = text.length;
  if (len >= 38 && len <= 125) score += 0.2;
  if (len > 125) score += 0.08;
  return Math.min(1.2, Number(score.toFixed(6)));
}
