import {
  BACKOFF_BASE_MS,
  BACKOFF_JITTER_MS,
  MAX_BACKOFF_MS,
  MAX_RETRIES,
  REQUEST_TIMEOUT_MS,
} from "@/lib/sources";
import type { ApiErrorMeta, ErrorKey } from "@/lib/types";

type ResponseParser<T> = (response: Response) => Promise<T>;

export class UpstreamFetchError extends Error {
  kind: ErrorKey;
  status?: number;
  retryAfterSeconds?: number;
  upstreamUrl?: string;
  attempts?: number;
  detail?: string;
  retryable: boolean;

  constructor(message: string, options: {
    kind: ErrorKey;
    retryable: boolean;
    status?: number;
    retryAfterSeconds?: number;
    upstreamUrl?: string;
    attempts?: number;
    detail?: string;
  }) {
    super(message);
    this.name = "UpstreamFetchError";
    this.kind = options.kind;
    this.retryable = options.retryable;
    this.status = options.status;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.upstreamUrl = options.upstreamUrl;
    this.attempts = options.attempts;
    this.detail = options.detail;
  }
}

export interface FetchWithRetryOptions {
  timeoutMs?: number;
  retries?: number;
  allowedHosts?: string[];
  headers?: HeadersInit;
  method?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitterDelay(baseDelayMs: number): number {
  const jitter = Math.floor(Math.random() * BACKOFF_JITTER_MS);
  return Math.min(MAX_BACKOFF_MS, baseDelayMs + jitter);
}

function parseRetryAfter(headerValue: string | null): number | undefined {
  if (!headerValue) {
    return undefined;
  }

  const trimmed = headerValue.trim();
  if (!trimmed) {
    return undefined;
  }

  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber)) {
    return Math.max(0, Math.round(asNumber));
  }

  const asDate = Date.parse(trimmed);
  if (Number.isFinite(asDate)) {
    const deltaSeconds = Math.ceil((asDate - Date.now()) / 1000);
    return Math.max(0, deltaSeconds);
  }

  return undefined;
}

function hostIsAllowed(url: string, allowedHosts?: string[]): boolean {
  if (!allowedHosts || allowedHosts.length === 0) {
    return true;
  }

  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return allowedHosts.some((allowedHost) => {
      const normalized = allowedHost.toLowerCase();
      return hostname === normalized || hostname.endsWith(`.${normalized}`);
    });
  } catch {
    return false;
  }
}

function createFetchError(
  response: Response,
  upstreamUrl: string,
  attempts: number,
): UpstreamFetchError {
  const retryAfterSeconds = parseRetryAfter(response.headers.get("retry-after"));
  if (response.status === 429) {
    return new UpstreamFetchError("Rate limit exceeded", {
      kind: "rate_limit",
      retryable: true,
      status: response.status,
      retryAfterSeconds,
      upstreamUrl,
      attempts,
    });
  }

  if (response.status >= 500) {
    return new UpstreamFetchError(`Upstream error (${response.status})`, {
      kind: "upstream_error",
      retryable: true,
      status: response.status,
      upstreamUrl,
      attempts,
    });
  }

  return new UpstreamFetchError(`Validation error (${response.status})`, {
    kind: "validation_error",
    retryable: false,
    status: response.status,
    upstreamUrl,
    attempts,
  });
}

async function fetchOnce<T>(
  url: string,
  init: RequestInit,
  parser: ResponseParser<T>,
  allowedHosts?: string[],
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<{ data: T; response: Response }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    if (!hostIsAllowed(response.url, allowedHosts)) {
      throw new UpstreamFetchError("Unexpected redirect target", {
        kind: "redirect",
        retryable: true,
        status: response.status,
        upstreamUrl: response.url,
      });
    }

    if (!response.ok) {
      throw createFetchError(response, response.url || url, 1);
    }

    const data = await parser(response);
    return { data, response };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchWithRetry<T>(
  url: string,
  init: RequestInit,
  parser: ResponseParser<T>,
  options: FetchWithRetryOptions = {},
): Promise<{ data: T; response: Response; attempts: number }> {
  const retries = options.retries ?? MAX_RETRIES;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;

  let lastError: UpstreamFetchError | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const result = await fetchOnce<T>(
        url,
        init,
        parser,
        options.allowedHosts,
        timeoutMs,
      );
      return {
        ...result,
        attempts: attempt + 1,
      };
    } catch (error) {
      if (error instanceof UpstreamFetchError) {
        lastError = error;
      } else if (error instanceof Error && error.name === "AbortError") {
        lastError = new UpstreamFetchError("Request timeout", {
          kind: "timeout",
          retryable: true,
          upstreamUrl: url,
        });
      } else {
        lastError = new UpstreamFetchError(
          error instanceof Error ? error.message : "Unknown upstream error",
          {
            kind: "unknown",
            retryable: true,
            upstreamUrl: url,
          },
        );
      }

      if (!lastError.retryable || attempt === retries) {
        break;
      }

      const retryAfterSeconds = lastError.retryAfterSeconds;
      const delayMs = typeof retryAfterSeconds === "number"
        ? retryAfterSeconds * 1000
        : jitterDelay(BACKOFF_BASE_MS * 2 ** attempt);
      await sleep(delayMs);
    }
  }

  throw lastError ?? new UpstreamFetchError("Unknown upstream error", {
    kind: "unknown",
    retryable: false,
    upstreamUrl: url,
  });
}

export async function fetchJsonWithRetry<T>(
  url: string,
  init: RequestInit,
  options: FetchWithRetryOptions = {},
): Promise<{ data: T; response: Response; attempts: number }> {
  return fetchWithRetry<T>(
    url,
    init,
    async (response) => {
      try {
        return (await response.json()) as T;
      } catch (error) {
        throw new UpstreamFetchError(
          error instanceof Error ? error.message : "Invalid JSON",
          {
            kind: "parse_error",
            retryable: false,
            upstreamUrl: response.url,
            detail: "Response body could not be parsed as JSON",
          },
        );
      }
    },
    options,
  );
}

export function toApiErrorMeta(error: unknown, attempts?: number): ApiErrorMeta {
  if (error instanceof UpstreamFetchError) {
    return {
      kind: error.kind,
      message: error.message,
      status: error.status,
      retryAfterSeconds: error.retryAfterSeconds,
      upstreamUrl: error.upstreamUrl,
      detail: error.detail,
      attempts: attempts ?? error.attempts,
    };
  }

  return {
    kind: "unknown",
    message: error instanceof Error ? error.message : "Unknown error",
    attempts,
  };
}
