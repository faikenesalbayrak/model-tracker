import { NextRequest, NextResponse } from "next/server";
import { normalizeGitHubReleases, type GitHubReleaseApiItem } from "@/lib/normalize/github-releases";
import { isStale, readSnapshot, refreshSnapshot, startAutoRefresh } from "@/lib/local-snapshot";
import { BACKOFF_BASE_MS, BACKOFF_JITTER_MS, MAX_BACKOFF_MS, MAX_RETRIES, REQUEST_TIMEOUT_MS } from "@/lib/sources";
import type { ApiErrorMeta, NormalizedRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GitHubSource = "github_public";

interface GitHubEnvelope {
  data: NormalizedRecord[];
  error: ApiErrorMeta | null;
  generated_at: string;
  last_success_at: string;
  note?: string;
  route: "github-releases";
  source: GitHubSource;
  stale: boolean;
}

interface GitHubApiErrorBody {
  documentation_url?: string;
  message?: string;
  errors?: unknown;
}

class GitHubFetchError extends Error {
  attempts?: number;
  detail?: string;
  kind: ApiErrorMeta["kind"];
  retryAfterSeconds?: number;
  retryable: boolean;
  status?: number;
  upstreamUrl?: string;

  constructor(
    message: string,
    options: {
      attempts?: number;
      detail?: string;
      kind: ApiErrorMeta["kind"];
      retryAfterSeconds?: number;
      retryable: boolean;
      status?: number;
      upstreamUrl?: string;
    },
  ) {
    super(message);
    this.name = "GitHubFetchError";
    this.kind = options.kind;
    this.retryable = options.retryable;
    this.status = options.status;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.upstreamUrl = options.upstreamUrl;
    this.attempts = options.attempts;
    this.detail = options.detail;
  }
}

const DEFAULT_OWNER = "vercel";
const DEFAULT_REPO = "next.js";
const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 30;
const REFRESH_MS = 12 * 60 * 60 * 1000;

function clampLimit(value: string | null | undefined, fallback: number, max = MAX_LIMIT): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

function normalizeName(value: string | null | undefined, fallback: string, label: "owner" | "repo"): {
  error?: ApiErrorMeta;
  value: string;
} {
  const raw = value?.trim();
  if (!raw) {
    return { value: fallback };
  }

  if (!/^[A-Za-z0-9._-]+$/.test(raw)) {
    return {
      value: fallback,
      error: {
        kind: "validation_error",
        message: `Invalid GitHub ${label} value.`,
        detail: `Only letters, numbers, dot, underscore, and hyphen are allowed for ${label}.`,
      },
    };
  }

  return { value: raw };
}

function cacheKey(owner: string, repo: string, limit: number): string {
  const normOwner = owner.toLowerCase().replace(/[^a-z0-9._-]+/g, "_");
  const normRepo = repo.toLowerCase().replace(/[^a-z0-9._-]+/g, "_");
  return `api-github-releases-${normOwner}-${normRepo}-${limit}`;
}

function buildUrl(owner: string, repo: string, limit: number): string {
  const url = new URL(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases`);
  url.searchParams.set("per_page", String(limit));
  return url.toString();
}

function jitterDelay(baseDelayMs: number): number {
  const jitter = Math.floor(Math.random() * BACKOFF_JITTER_MS);
  return Math.min(MAX_BACKOFF_MS, baseDelayMs + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseRetryAfter(headerValue: string | null): number | undefined {
  if (!headerValue) {
    return undefined;
  }

  const numeric = Number(headerValue);
  if (Number.isFinite(numeric)) {
    return Math.max(0, Math.round(numeric));
  }

  const parsed = Date.parse(headerValue);
  if (Number.isFinite(parsed)) {
    return Math.max(0, Math.ceil((parsed - Date.now()) / 1000));
  }

  return undefined;
}

function parseRateLimitReset(headerValue: string | null): number | undefined {
  if (!headerValue) {
    return undefined;
  }

  const epochSeconds = Number(headerValue);
  if (!Number.isFinite(epochSeconds)) {
    return undefined;
  }

  return Math.max(0, Math.ceil(epochSeconds - Date.now() / 1000));
}

function buildRateLimitDetail(params: {
  limit?: string | null;
  remaining?: string | null;
  reset?: string | null;
  message?: string;
}): string {
  const pieces = [
    typeof params.limit === "string" ? `limit=${params.limit}` : null,
    typeof params.remaining === "string" ? `remaining=${params.remaining}` : null,
    typeof params.reset === "string" ? `reset=${params.reset}` : null,
    params.message ? `message=${params.message}` : null,
  ].filter((piece): piece is string => Boolean(piece));

  return pieces.join("; ");
}

async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") {
    return undefined;
  }

  const candidate = body as GitHubApiErrorBody;
  return typeof candidate.message === "string" && candidate.message.trim()
    ? candidate.message.trim()
    : undefined;
}

function metaFromError(error: unknown, upstreamUrl: string, attempts: number): ApiErrorMeta {
  if (error instanceof GitHubFetchError) {
    return {
      kind: error.kind,
      message: error.message,
      status: error.status,
      retryAfterSeconds: error.retryAfterSeconds,
      upstreamUrl: error.upstreamUrl ?? upstreamUrl,
      detail: error.detail,
      attempts: error.attempts ?? attempts,
    };
  }

  return {
    kind: "unknown",
    message: error instanceof Error ? error.message : "Unknown GitHub API error",
    upstreamUrl,
    attempts,
  };
}

async function fetchGitHubReleases(owner: string, repo: string, limit: number) {
  const upstreamUrl = buildUrl(owner, repo, limit);
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(upstreamUrl, {
        method: "GET",
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "model-tracker",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await readJsonBody(response);
        const remaining = response.headers.get("x-ratelimit-remaining");
        const limitHeader = response.headers.get("x-ratelimit-limit");
        const resetHeader = response.headers.get("x-ratelimit-reset");
        const retryAfterHeader = response.headers.get("retry-after");
        const bodyMessage = extractErrorMessage(body);

        const isRateLimit =
          response.status === 429 ||
          remaining === "0" ||
          (typeof bodyMessage === "string" && /rate limit|secondary rate limit/i.test(bodyMessage));

        if (isRateLimit) {
          const retryAfterSeconds =
            parseRetryAfter(retryAfterHeader) ??
            parseRateLimitReset(resetHeader);

          throw new GitHubFetchError("GitHub public API rate limit reached.", {
            kind: "rate_limit",
            retryable: false,
            status: response.status,
            retryAfterSeconds,
            upstreamUrl,
            attempts: attempt + 1,
            detail: buildRateLimitDetail({
              limit: limitHeader,
              remaining,
              reset: resetHeader,
              message: bodyMessage ?? undefined,
            }),
          });
        }

        if (response.status >= 500) {
          throw new GitHubFetchError("GitHub upstream error.", {
            kind: "upstream_error",
            retryable: true,
            status: response.status,
            upstreamUrl,
            attempts: attempt + 1,
            detail: bodyMessage,
          });
        }

        throw new GitHubFetchError("GitHub validation error.", {
          kind: "validation_error",
          retryable: false,
          status: response.status,
          upstreamUrl,
          attempts: attempt + 1,
          detail: bodyMessage,
        });
      }

      const remaining = response.headers.get("x-ratelimit-remaining");
      const limitHeader = response.headers.get("x-ratelimit-limit");
      const resetHeader = response.headers.get("x-ratelimit-reset");
      const json = (await response.json()) as GitHubReleaseApiItem[];
      if (!Array.isArray(json)) {
        throw new GitHubFetchError("GitHub releases response was not an array.", {
          kind: "parse_error",
          retryable: false,
          status: response.status,
          upstreamUrl,
          attempts: attempt + 1,
          detail: "Expected the GitHub releases API to return a JSON array.",
        });
      }
      const note =
        typeof remaining === "string" && typeof limitHeader === "string"
          ? `GitHub public API remaining ${remaining}/${limitHeader}` +
            (resetHeader ? `; reset=${resetHeader}` : "")
          : undefined;

      return {
        data: json,
        note,
        rateLimit: {
          limit: limitHeader,
          remaining,
          reset: resetHeader,
        },
      };
    } catch (error) {
      if (error instanceof GitHubFetchError && !error.retryable) {
        throw error;
      }

      lastError = error;

      if (attempt === MAX_RETRIES) {
        break;
      }

      const delayMs = jitterDelay(BACKOFF_BASE_MS * 2 ** attempt);
      await sleep(delayMs);
    } finally {
      clearTimeout(timeout);
    }
  }

  if (lastError instanceof Error && lastError.name === "AbortError") {
    throw new GitHubFetchError("GitHub request timed out.", {
      kind: "timeout",
      retryable: true,
      upstreamUrl,
      attempts: MAX_RETRIES + 1,
    });
  }

  throw lastError instanceof GitHubFetchError
    ? lastError
    : new GitHubFetchError("GitHub request failed.", {
        kind: "unknown",
        retryable: false,
        upstreamUrl,
        attempts: MAX_RETRIES + 1,
        detail: lastError instanceof Error ? lastError.message : undefined,
      });
}

function buildEnvelope(params: {
  data: NormalizedRecord[];
  error: ApiErrorMeta | null;
  generatedAt: string;
  lastSuccessAt: string;
  note?: string;
  stale: boolean;
}): GitHubEnvelope {
  return {
    route: "github-releases",
    source: "github_public",
    generated_at: params.generatedAt,
    last_success_at: params.lastSuccessAt,
    stale: params.stale,
    data: params.data,
    error: params.error,
    ...(params.note ? { note: params.note } : {}),
  };
}

async function buildFreshSnapshot(owner: string, repo: string, limit: number): Promise<GitHubEnvelope> {
  const fetchedAt = new Date().toISOString();
  const { data, note, rateLimit } = await fetchGitHubReleases(owner, repo, limit);
  const records = normalizeGitHubReleases({
    owner,
    repo,
    releases: data,
    generatedAt: fetchedAt,
    lastSuccessAt: fetchedAt,
  }).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  return buildEnvelope({
    data: records,
    error: null,
    generatedAt: fetchedAt,
    lastSuccessAt: fetchedAt,
    stale: false,
    note:
      note ??
      (rateLimit.limit && rateLimit.remaining
        ? `GitHub public API remaining ${rateLimit.remaining}/${rateLimit.limit}`
        : undefined),
  });
}

export async function GET(request: NextRequest) {
  const generatedAt = new Date().toISOString();
  const ownerResult = normalizeName(request.nextUrl.searchParams.get("owner"), DEFAULT_OWNER, "owner");
  const repoResult = normalizeName(request.nextUrl.searchParams.get("repo"), DEFAULT_REPO, "repo");
  const limit = clampLimit(request.nextUrl.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
  const key = cacheKey(ownerResult.value, repoResult.value, limit);

  if (ownerResult.error || repoResult.error) {
    const cached = await readSnapshot<GitHubEnvelope>(key);
    const validationError = ownerResult.error ?? repoResult.error;
    const envelope = cached
      ? buildEnvelope({
          ...cached,
          generatedAt,
          lastSuccessAt: cached.last_success_at,
          error: validationError ?? cached.error,
          stale: true,
          note: "Returning cached GitHub releases because the request parameters were invalid.",
        })
      : buildEnvelope({
          data: [],
          error: validationError ?? {
            kind: "validation_error",
            message: "Invalid GitHub release request.",
          },
          generatedAt,
          lastSuccessAt: generatedAt,
          stale: true,
          note: "No cached GitHub releases available yet.",
        });

    return NextResponse.json(envelope, {
      status: cached ? 200 : 400,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  startAutoRefresh(key, REFRESH_MS, () =>
    buildFreshSnapshot(ownerResult.value, repoResult.value, limit),
  );

  try {
    let snapshot = await readSnapshot<GitHubEnvelope>(key);
    if (!snapshot) {
      snapshot = await refreshSnapshot(key, () =>
        buildFreshSnapshot(ownerResult.value, repoResult.value, limit),
      );
    }

    const stale = isStale(snapshot.last_success_at, REFRESH_MS);
    if (stale) {
      void refreshSnapshot(key, () =>
        buildFreshSnapshot(ownerResult.value, repoResult.value, limit),
      ).catch(() => {
        // keep last good snapshot
      });
    }

    return NextResponse.json(
      {
        ...snapshot,
        generated_at: generatedAt,
        stale,
      } satisfies GitHubEnvelope,
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const errorMeta = metaFromError(error, buildUrl(ownerResult.value, repoResult.value, limit), MAX_RETRIES + 1);
    const cached = await readSnapshot<GitHubEnvelope>(key);

    if (cached) {
      return NextResponse.json(
        {
          ...cached,
          generated_at: generatedAt,
          stale: true,
          error: errorMeta,
          note: errorMeta.kind === "rate_limit"
            ? `GitHub public API rate limit hit${errorMeta.retryAfterSeconds ? `; retry in ~${errorMeta.retryAfterSeconds}s` : ""}.`
            : "Returning stale GitHub releases from local cache.",
        } satisfies GitHubEnvelope,
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const envelope = buildEnvelope({
      data: [],
      error: errorMeta,
      generatedAt,
      lastSuccessAt: generatedAt,
      stale: true,
      note: errorMeta.kind === "rate_limit"
        ? `GitHub public API rate limit hit${errorMeta.retryAfterSeconds ? `; retry in ~${errorMeta.retryAfterSeconds}s` : ""}.`
        : "No cached GitHub releases available yet.",
    });

    return NextResponse.json(envelope, {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }
}
