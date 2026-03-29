import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function resolveCacheRootDir(): string {
  const explicit = process.env.MONITORING_CACHE_DIR?.trim();
  if (explicit) {
    return explicit;
  }

  const isServerlessProd =
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.VERCEL) ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (isServerlessProd) {
    return "/tmp/model-tracker";
  }

  return path.join(process.cwd(), "data");
}

const CACHE_DIR = resolveCacheRootDir();
const memory = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();
const loops = new Set<string>();
const warnedPaths = new Set<string>();

function filePathFor(key: string): string {
  return path.join(CACHE_DIR, `${key}.json`);
}

function warnCachePersistenceIssue(filePath: string, error: unknown): void {
  const signature = `${filePath}:${error instanceof Error ? error.name : typeof error}`;
  if (warnedPaths.has(signature)) {
    return;
  }
  warnedPaths.add(signature);
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.warn(`Snapshot disk persistence disabled for ${filePath}; continuing with memory cache. ${detail}`);
}

export async function readSnapshot<T>(key: string): Promise<T | null> {
  if (memory.has(key)) {
    return memory.get(key) as T;
  }

  try {
    const raw = await readFile(filePathFor(key), "utf8");
    const parsed = JSON.parse(raw) as T;
    memory.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export async function writeSnapshot<T>(key: string, value: T): Promise<void> {
  memory.set(key, value);
  const filePath = filePathFor(key);
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
  } catch (error) {
    warnCachePersistenceIssue(filePath, error);
  }
}

export async function refreshSnapshot<T>(
  key: string,
  producer: () => Promise<T>,
): Promise<T> {
  if (inflight.has(key)) {
    return inflight.get(key) as Promise<T>;
  }

  const promise = (async () => {
    const fresh = await producer();
    await writeSnapshot(key, fresh);
    return fresh;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise as Promise<unknown>);
  return promise;
}

export function isStale(lastSuccessAt: string, maxAgeMs: number): boolean {
  const parsed = Date.parse(lastSuccessAt);
  if (!Number.isFinite(parsed)) {
    return true;
  }
  return Date.now() - parsed >= maxAgeMs;
}

export function startAutoRefresh(
  key: string,
  intervalMs: number,
  producer: () => Promise<unknown>,
): void {
  if (loops.has(key)) {
    return;
  }
  loops.add(key);

  const timer = setInterval(() => {
    void refreshSnapshot(key, producer).catch(() => {
      // Keep last good snapshot when refresh fails.
    });
  }, intervalMs);

  timer.unref?.();
}
