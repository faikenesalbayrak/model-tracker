import vm from "node:vm";

export interface ArtificialAnalysisModel {
  id: string;
  slug?: string;
  name?: string;
  short_name?: string;
  model_creators?: {
    name?: string;
    logo_small?: string;
  } | null;
  intelligence_index?: number | null;
  coding_index?: number | null;
  agentic_index?: number | null;
  gpqa?: number | null;
  mmlu_pro?: number | null;
  terminalbench_hard?: number | null;
  aime?: number | null;
  aime25?: number | null;
  livecodebench?: number | null;
  math_500?: number | null;
  ifbench?: number | null;
  price_1m_blended_3_to_1?: number | null;
  price_1m_input_tokens?: number | null;
  price_1m_output_tokens?: number | null;
  context_window_tokens?: number | null;
  is_open_weights?: boolean | null;
  reasoning_model?: boolean | null;
  release_date?: string | null;
  knowledge_cutoff_date?: string | null;
  model_url?: string | null;
  hosts_url?: string | null;
  input_modality_image?: boolean | null;
  input_modality_speech?: boolean | null;
  input_modality_text?: boolean | null;
  input_modality_video?: boolean | null;
  output_modality_image?: boolean | null;
  output_modality_speech?: boolean | null;
  output_modality_text?: boolean | null;
  output_modality_video?: boolean | null;
  price_per_1k_1mp_images?: number | null;
  timescaleData?: {
    median_output_speed?: number | null;
    median_time_to_first_chunk?: number | null;
  } | null;
  end_to_end_response_time_metrics?: {
    total_time?: number | null;
  } | null;
}

export function decodeNextStreamChunks(html: string): string {
  const pattern = /<script>self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g;
  const chunks: string[] = [];

  for (const match of html.matchAll(pattern)) {
    const literal = match[1];
    if (!literal) continue;

    try {
      const evaluated = vm.runInNewContext(literal) as unknown;
      if (
        Array.isArray(evaluated) &&
        evaluated[0] === 1 &&
        typeof evaluated[1] === "string"
      ) {
        chunks.push(evaluated[1]);
      }
    } catch {
      // Ignore invalid stream chunks.
    }
  }

  return chunks.join("");
}

function extractJsonArrayAt(input: string, startBracketIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startBracketIndex; i < input.length; i += 1) {
    const char = input[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "[") {
      depth += 1;
      continue;
    }

    if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        return input.slice(startBracketIndex, i + 1);
      }
    }
  }

  return null;
}

function parseModelsArray(decodedStream: string): ArtificialAnalysisModel[] {
  const marker = "\"models\":[";
  const markerLen = marker.length;
  let position = decodedStream.indexOf(marker);

  while (position !== -1) {
    const arrayStart = position + markerLen - 1;
    const arrayLiteral = extractJsonArrayAt(decodedStream, arrayStart);
    if (!arrayLiteral) {
      break;
    }

    try {
      const parsed = JSON.parse(arrayLiteral) as unknown;
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        typeof parsed[0] === "object" &&
        parsed[0] !== null &&
        "intelligence_index" in parsed[0]
      ) {
        return parsed as ArtificialAnalysisModel[];
      }
    } catch {
      // Try the next `models` array.
    }

    position = decodedStream.indexOf(marker, position + markerLen);
  }

  return [];
}

export function extractArtificialAnalysisModels(html: string): ArtificialAnalysisModel[] {
  const decodedStream = decodeNextStreamChunks(html);
  if (!decodedStream) {
    return [];
  }

  return parseModelsArray(decodedStream);
}

// ─── AA Arena leaderboard extractor (image / video / TTS) ───────────────────
// These pages embed rows as: [{"formatted":{rank,elo,...},"values":{id,name,elo,creator,...}}]
// The primary score is values.elo (numeric Elo rating, higher = better).

export interface ArtificialAnalysisArenaEntry {
  id: string;
  name: string;
  vendorName: string | null;
  elo: number;
  winRate: number | null;
  appearances: number | null;
  released: string | null;
  openWeightsUrl: string | null;
  pricePer1kImages: number | null;   // image only
  pricePerMinute: number | null;     // video only
  pricePer1mCharacters: number | null; // TTS only
}

function extractJsonArrayAt2(input: string, startBracketIndex: number): string | null {
  return extractJsonArrayAt(input, startBracketIndex);
}

function parseArenaEntries(decodedStream: string): ArtificialAnalysisArenaEntry[] {
  // marker: [{"formatted":{"rank":
  const marker = '[{"formatted":{"rank":';
  let position = decodedStream.indexOf(marker);

  while (position !== -1) {
    const arrayLiteral = extractJsonArrayAt2(decodedStream, position);
    if (!arrayLiteral) {
      position = decodedStream.indexOf(marker, position + marker.length);
      continue;
    }

    try {
      const parsed = JSON.parse(arrayLiteral) as unknown;
      if (!Array.isArray(parsed) || parsed.length < 3) {
        position = decodedStream.indexOf(marker, position + marker.length);
        continue;
      }

      const entries: ArtificialAnalysisArenaEntry[] = [];
      for (const row of parsed) {
        if (!row || typeof row !== "object") continue;
        const r = row as Record<string, unknown>;
        const v = r.values;
        if (!v || typeof v !== "object") continue;
        const vals = v as Record<string, unknown>;

        const id = String(vals.id ?? "").trim();
        const name = String(vals.name ?? "").trim();
        if (!id || !name) continue;

        const eloRaw = vals.elo;
        if (typeof eloRaw !== "number" || !Number.isFinite(eloRaw) || eloRaw <= 0) continue;

        const creator = vals.creator as Record<string, unknown> | null | undefined;
        const vendorName = creator ? String(creator.name ?? "").trim() || null : null;

        entries.push({
          id,
          name,
          vendorName,
          elo: eloRaw,
          winRate: typeof vals.winRate === "number" && Number.isFinite(vals.winRate) ? vals.winRate : null,
          appearances: typeof vals.appearances === "number" ? vals.appearances : null,
          released: typeof vals.released === "string" ? vals.released : null,
          openWeightsUrl: typeof vals.openWeightsUrl === "string" ? vals.openWeightsUrl : null,
          pricePer1kImages: typeof vals.pricePer1kImages === "number" && Number.isFinite(vals.pricePer1kImages) ? vals.pricePer1kImages : null,
          pricePerMinute: typeof vals.pricePerMinute === "number" && Number.isFinite(vals.pricePerMinute) ? vals.pricePerMinute : null,
          pricePer1mCharacters: typeof vals.pricePer1mCharacters === "number" && Number.isFinite(vals.pricePer1mCharacters) ? vals.pricePer1mCharacters : null,
        });
      }

      if (entries.length >= 3) return entries;
    } catch {
      // try next occurrence
    }

    position = decodedStream.indexOf(marker, position + marker.length);
  }

  return [];
}

export function extractArtificialAnalysisArenaPage(html: string): ArtificialAnalysisArenaEntry[] {
  const decodedStream = decodeNextStreamChunks(html);
  if (!decodedStream) return [];
  return parseArenaEntries(decodedStream);
}

// ─── AA STT page extractor ───────────────────────────────────────────────────
// STT page embeds a flat array of model objects with word_error_rate (lower = better).
// Score is converted to accuracy: (1 - wer) * 100

export interface ArtificialAnalysisSttEntry {
  id: string;
  name: string;
  shortName: string | null;
  wordErrorRate: number;        // raw WER, 0–1
  accuracyScore: number;        // (1 - wer) * 100, higher = better
  pricePerMinute: number | null;
}

function parseSttEntries(decodedStream: string): ArtificialAnalysisSttEntry[] {
  // Look for arrays where objects have word_error_rate
  const marker = '"word_error_rate":';
  const position = decodedStream.indexOf(marker);
  if (position === -1) return [];

  // Walk back to find opening [ of parent array
  let arrayStart = position;
  let bracketDepth = 0;
  for (let i = position; i >= 0; i--) {
    if (decodedStream[i] === "]") bracketDepth++;
    if (decodedStream[i] === "[") {
      if (bracketDepth === 0) { arrayStart = i; break; }
      bracketDepth--;
    }
  }

  const arrayLiteral = extractJsonArrayAt2(decodedStream, arrayStart);
  if (!arrayLiteral) return [];

  try {
    const parsed = JSON.parse(arrayLiteral) as unknown;
    if (!Array.isArray(parsed)) return [];

    const entries: ArtificialAnalysisSttEntry[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;

      const id = String(row.id ?? "").trim();
      const name = String(row.name ?? row.short_name ?? "").trim();
      const wer = row.word_error_rate;
      if (!id || !name) continue;
      if (typeof wer !== "number" || !Number.isFinite(wer) || wer < 0 || wer > 1) continue;

      const priceRaw = row.price_per_1k_minutes;
      entries.push({
        id,
        name,
        shortName: typeof row.short_name === "string" ? row.short_name : null,
        wordErrorRate: wer,
        accuracyScore: Math.round((1 - wer) * 10000) / 100,
        pricePerMinute: typeof priceRaw === "number" && Number.isFinite(priceRaw) ? priceRaw : null,
      });
    }

    return entries.filter((e) => e.wordErrorRate < 1);
  } catch {
    return [];
  }
}

export function extractArtificialAnalysisSttPage(html: string): ArtificialAnalysisSttEntry[] {
  const decodedStream = decodeNextStreamChunks(html);
  if (!decodedStream) return [];
  return parseSttEntries(decodedStream);
}
