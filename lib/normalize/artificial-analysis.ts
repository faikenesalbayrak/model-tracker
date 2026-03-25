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

function decodeNextStreamChunks(html: string): string {
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
