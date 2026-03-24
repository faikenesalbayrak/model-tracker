import { canonicalRecordId } from "@/lib/canonical-map";
import { buildConfidence, createRecord, stampRecords } from "@/lib/normalize/common";
import { UpstreamFetchError } from "@/lib/fetcher";
import type { NormalizedRecord } from "@/lib/types";

const ARXIV_LAB = "arXiv";
const ARXIV_SOURCE = "arxiv_public";

export interface ArxivEntry {
  id: string;
  title: string;
  summary: string;
  published: string;
  updated: string;
  authors: string[];
  categories: string[];
  primaryCategory: string | null;
  abstractUrl: string;
  pdfUrl: string | null;
  comment: string | null;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function extractTagText(block: string, tagName: string): string | null {
  const match = block.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  if (!match?.[1]) {
    return null;
  }

  return normalizeWhitespace(decodeXmlEntities(match[1]));
}

function parseAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([A-Za-z_:][-A-Za-z0-9_.:]*)=(["'])(.*?)\2/g;
  for (const match of tag.matchAll(pattern)) {
    const [, name, , rawValue] = match;
    attributes[name] = decodeXmlEntities(rawValue);
  }

  return attributes;
}

function extractLink(block: string, predicate: (attributes: Record<string, string>) => boolean): string | null {
  const links = block.match(/<link\b[^>]*\/?>/gi) ?? [];
  for (const link of links) {
    const attributes = parseAttributes(link);
    if (predicate(attributes) && attributes.href) {
      return attributes.href;
    }
  }

  return null;
}

function extractCategories(block: string): string[] {
  const categories = block.match(/<category\b[^>]*\/?>/gi) ?? [];
  return categories
    .map((tag) => parseAttributes(tag).term)
    .filter((value): value is string => Boolean(value));
}

function extractAuthors(block: string): string[] {
  const authors = block.match(/<author\b[\s\S]*?<\/author>/gi) ?? [];
  return authors
    .map((authorBlock) => extractTagText(authorBlock, "name"))
    .filter((value): value is string => Boolean(value));
}

function extractEntryId(rawId: string): string {
  try {
    const url = new URL(rawId);
    return decodeXmlEntities(url.pathname.split("/").filter(Boolean).pop() ?? rawId);
  } catch {
    return decodeXmlEntities(rawId);
  }
}

function extractEntryBlocks(xml: string): string[] {
  return xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
}

export function parseArxivFeed(xml: string): ArxivEntry[] {
  if (!/<feed\b[\s\S]*<\/feed>/i.test(xml)) {
    throw new UpstreamFetchError("Invalid arXiv Atom feed", {
      kind: "parse_error",
      retryable: false,
      detail: "The response did not contain a valid Atom feed.",
    });
  }

  const entries = extractEntryBlocks(xml);

  return entries
    .flatMap((entryBlock): ArxivEntry[] => {
      const rawId = extractTagText(entryBlock, "id");
      const title = extractTagText(entryBlock, "title");
      const summary = extractTagText(entryBlock, "summary");
      const published = extractTagText(entryBlock, "published");
      const updated = extractTagText(entryBlock, "updated");

      if (!rawId || !title || !summary || !published || !updated) {
        return [];
      }

      const abstractUrl = extractLink(entryBlock, (attributes) => {
        const rel = attributes.rel?.toLowerCase();
        const type = attributes.type?.toLowerCase();
        return rel === "alternate" || type === "text/html";
      }) ?? rawId.replace("/pdf/", "/abs/");

      const pdfUrl = extractLink(entryBlock, (attributes) => {
        const rel = attributes.rel?.toLowerCase();
        const titleValue = attributes.title?.toLowerCase();
        const type = attributes.type?.toLowerCase();
        return rel === "related" && (titleValue === "pdf" || type === "application/pdf");
      });

      const authors = extractAuthors(entryBlock);
      const categories = extractCategories(entryBlock);
      const primaryCategory = parseAttributes(
        entryBlock.match(/<arxiv:primary_category\b[^>]*\/?>/i)?.[0] ?? "",
      ).term ?? categories[0] ?? null;
      const comment = extractTagText(entryBlock, "arxiv:comment");

      return [{
        id: extractEntryId(rawId),
        title: normalizeWhitespace(decodeXmlEntities(title)),
        summary: normalizeWhitespace(decodeXmlEntities(summary)),
        published,
        updated,
        authors,
        categories,
        primaryCategory,
        abstractUrl,
        pdfUrl,
        comment,
      } satisfies ArxivEntry];
    });
}

export function normalizeArxivFeed(params: {
  xml: string;
  lastSuccessAt: string;
  generatedAt: string;
}): NormalizedRecord[] {
  const entries = parseArxivFeed(params.xml);

  const records = entries.map((entry) =>
    createRecord({
      id: canonicalRecordId(ARXIV_LAB, entry.id, "release"),
      kind: "release",
      lab: ARXIV_LAB,
      source: ARXIV_SOURCE,
      value: entry.summary,
      title: entry.title,
      subtitle: entry.authors.length > 0 ? entry.authors.join(", ") : entry.primaryCategory ?? "arXiv",
      url: entry.abstractUrl,
      timestamp: entry.published ?? params.generatedAt,
      confidence: buildConfidence({
        hasFreshTimestamp: Boolean(entry.published),
        hasSummary: Boolean(entry.summary),
      }),
      last_success_at: params.lastSuccessAt,
      payload: {
        arxiv_id: entry.id,
        abstract_url: entry.abstractUrl,
        pdf_url: entry.pdfUrl,
        published: entry.published,
        updated: entry.updated,
        authors: entry.authors,
        categories: entry.categories,
        primary_category: entry.primaryCategory,
        comment: entry.comment,
      },
    }),
  );

  return stampRecords(records, params.lastSuccessAt);
}
