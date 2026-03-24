import { canonicalRecordId } from "@/lib/canonical-map";
import { buildConfidence } from "@/lib/normalize/common";
import type { NormalizedRecord } from "@/lib/types";

export interface GitHubReleaseAsset {
  browser_download_url?: string;
  content_type?: string;
  download_count?: number;
  name?: string;
  size?: number;
}

export interface GitHubReleaseApiItem {
  assets?: GitHubReleaseAsset[];
  author?: {
    html_url?: string;
    login?: string;
  } | null;
  body?: string | null;
  created_at?: string;
  draft?: boolean;
  html_url?: string;
  id?: number;
  name?: string | null;
  prerelease?: boolean;
  published_at?: string | null;
  repository_url?: string;
  tag_name?: string | null;
  target_commitish?: string;
  tarball_url?: string | null;
  updated_at?: string | null;
  zipball_url?: string | null;
}

function safeIsoTimestamp(value: string | null | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : fallback;
}

function excerptBody(body: string | null | undefined, maxLength = 240): string | undefined {
  if (!body) {
    return undefined;
  }

  const normalized = body
    .replace(/\r\n/g, "\n")
    .split("\n\n")[0]
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return undefined;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function createGithubRecord(params: {
  owner: string;
  repo: string;
  release: GitHubReleaseApiItem;
  generatedAt: string;
  lastSuccessAt: string;
}): NormalizedRecord | null {
  const { release, owner, repo, generatedAt, lastSuccessAt } = params;

  if (release.draft) {
    return null;
  }

  const tag = release.tag_name?.trim() || release.name?.trim() || `release-${release.id ?? "unknown"}`;
  const title = release.name?.trim() || tag;
  const htmlUrl = release.html_url?.trim() || `https://github.com/${owner}/${repo}/releases`;
  const publishedAt = safeIsoTimestamp(release.published_at ?? release.created_at, generatedAt);
  const summary = excerptBody(release.body);
  const assetDownloadUrls = (release.assets ?? [])
    .map((asset) => asset.browser_download_url?.trim())
    .filter((value): value is string => Boolean(value));

  return {
    id: canonicalRecordId(owner, `${owner}/${repo}`, tag),
    kind: "release",
    lab: owner,
    source: "github_public",
    metric: undefined,
    value: release.tag_name?.trim() || title,
    title,
    subtitle: `${owner}/${repo}`,
    url: htmlUrl,
    timestamp: publishedAt,
    confidence: buildConfidence({
      hasFreshTimestamp: Boolean(release.published_at ?? release.created_at),
      hasSummary: Boolean(summary),
    }),
    last_success_at: lastSuccessAt,
    payload: {
      source_label: "github_public",
      owner,
      repo,
      repository_full_name: `${owner}/${repo}`,
      html_url: htmlUrl,
      tarball_url: release.tarball_url ?? null,
      zipball_url: release.zipball_url ?? null,
      tag_name: release.tag_name ?? null,
      name: release.name ?? null,
      prerelease: Boolean(release.prerelease),
      draft: Boolean(release.draft),
      published_at: release.published_at ?? null,
      created_at: release.created_at ?? null,
      updated_at: release.updated_at ?? null,
      body_excerpt: summary ?? null,
      asset_download_urls: assetDownloadUrls,
      author_login: release.author?.login ?? null,
      author_html_url: release.author?.html_url ?? null,
      repository_url: release.repository_url ?? null,
    },
  } as NormalizedRecord;
}

export function normalizeGitHubReleases(params: {
  owner: string;
  repo: string;
  releases: GitHubReleaseApiItem[];
  generatedAt: string;
  lastSuccessAt: string;
}): NormalizedRecord[] {
  return params.releases
    .map((release) =>
      createGithubRecord({
        owner: params.owner,
        repo: params.repo,
        release,
        generatedAt: params.generatedAt,
        lastSuccessAt: params.lastSuccessAt,
      }),
    )
    .filter((record): record is NormalizedRecord => Boolean(record));
}
