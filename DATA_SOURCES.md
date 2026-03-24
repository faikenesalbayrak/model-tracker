# Data Sources Inventory

Bu doküman, projedeki tüm veri kaynaklarını ve her kaynaktan çekilebilen alanları listeler.

## 1) Artificial Analysis Models
- Internal endpoint: `/api/artificial-analysis`
- Upstream: `https://artificialanalysis.ai/models`
- Route/Source: `route: artificial-analysis` (payload’da route sabitlenmemiş olabilir), `source: artificial_analysis_models_page`
- Çekilebilen alanlar:
1. `id`
2. `model` (short name / name)
3. `lab` (model creator/provider)
4. `intelligence_index`
5. `coding_index`
6. `agentic_index`
7. `gpqa`
8. `mmlu_pro`
9. `terminalbench_hard`
10. `price_1m_input_tokens`
11. `price_1m_output_tokens`
12. `price_1m_blended_3_to_1`
13. `context_window_tokens`
14. `timescaleData.median_output_speed`
15. `timescaleData.median_time_to_first_chunk`
16. `end_to_end_response_time_metrics.total_time`
17. `is_open_weights`
18. `reasoning_model`
19. `release_date`
20. `model_url` / `hosts_url`

## 2) Releases (Hugging Face Hub)
- Internal endpoint: `/api/releases`
- Upstream: Hugging Face Model API (`/api/models`)
- Route/Source: `route: releases`, `source: hf_hub`
- Çekilebilen alanlar:
1. Model kimliği (`modelId`/`id`)
2. Lab/organization
3. Başlık (model adı)
4. `createdAt` / `lastModified`
5. `cardData.summary` / `cardData.description`
6. `tags`
7. `likes`
8. `downloads`
9. `pipeline_tag`
10. Hugging Face model URL

## 3) Leaderboard (HF Open LLM Leaderboard Dataset)
- Internal endpoint: `/api/leaderboard`
- Upstream: Hugging Face Datasets Server (`open-llm-leaderboard/contents`)
- Route/Source: `route: leaderboard`, `source: hf_leaderboard`
- Çekilebilen alanlar:
1. `fullname` / `eval_name`
2. `Average ⬆️`
3. `MMLU-PRO`
4. `BBH`
5. `MATH Lvl 5`
6. `GPQA`
7. `MUSR`
8. `IFEval`
9. `#Params (B)`
10. `Upload To Hub Date` / `Submission Date`
11. `Architecture`
12. `Hub License`
13. `Hub ❤️`
14. `MoE`
15. `Flagged`
16. Hugging Face model URL

## 4) Pricing (OpenRouter Models)
- Internal endpoint: `/api/pricing`
- Upstream: `https://openrouter.ai/api/v1/models`
- Route/Source: `route: pricing`, `source: pricing_feed`
- Çekilebilen alanlar:
1. `id`
2. `name`
3. Lab/owner (id’den türetilir)
4. `created`
5. `context_length`
6. `pricing.prompt` (input token fiyatı)
7. `pricing.completion` (output token fiyatı)
8. `pricing.input_cache_read`
9. Hesaplanan `price_1m_input`
10. Hesaplanan `price_1m_output`
11. Hesaplanan `price_1m_blended` (3:1 input/output)

## 5) Benchmarks (Papers With Code SOTA)
- Internal endpoint: `/api/benchmarks`
- Upstream: `https://paperswithcode.com/api/v1` (SOTA endpoint varyasyonları)
- Route/Source: `route: benchmarks`, `source: pwc`
- Çekilebilen alanlar:
1. Benchmark adı/metric (`mmlu`, `humaneval`, `arc`, `hellaswag`, `mtbench`)
2. `model`
3. `lab`
4. `score`
5. `rank`
6. `timestamp` / `date`
7. `sourceUrl`
8. Normalize edilmiş payload’da benchmark etiketi ve fallback işareti

## 6) arXiv Feed
- Internal endpoint: `/api/arxiv`
- Upstream: `https://export.arxiv.org/api/query`
- Route/Source: `route: arxiv`, `source: arxiv_public`
- Çekilebilen alanlar:
1. `id` (arXiv ID)
2. `title`
3. `summary` (abstract)
4. `published`
5. `updated`
6. `authors[]`
7. `categories[]`
8. `primaryCategory`
9. `abstractUrl`
10. `pdfUrl`
11. `comment`

## 7) Crossref Works
- Internal endpoint: `/api/crossref`
- Upstream: `https://api.crossref.org/works`
- Route/Source: `route: crossref`, `source: crossref_public`
- Çekilebilen alanlar:
1. `DOI`
2. `URL`
3. `title`
4. `container-title`
5. `author[]`
6. `created` / `issued` / `published-online` / `published-print`
7. `score`
8. `type`
9. `is-referenced-by-count`
10. DOI URL türevi (`https://doi.org/...`)

## 8) GitHub Releases
- Internal endpoint: `/api/github-releases`
- Upstream: GitHub REST API (`/repos/{owner}/{repo}/releases`)
- Route/Source: `route: github-releases`, `source: github_public`
- Çekilebilen alanlar:
1. `id`
2. `tag_name`
3. `name`
4. `html_url`
5. `published_at` / `created_at` / `updated_at`
6. `prerelease`
7. `draft`
8. `body` (excerpt)
9. `assets[]` (download URL, size, type, download count)
10. `author.login` / `author.html_url`
11. `tarball_url` / `zipball_url`
12. `target_commitish`

## 9) Semantic Scholar
- Internal endpoint: `/api/semantic-scholar`
- Upstream: `https://api.semanticscholar.org/graph/v1/paper/search`
- Route/Source: `route: semantic_scholar`, `source: semantic_scholar_public`
- Çekilebilen alanlar:
1. `paperId`
2. `title`
3. `abstract`
4. `venue`
5. `year`
6. `publicationDate`
7. `citationCount`
8. `url`
9. `openAccessPdf.url` / `openAccessPdf.status`
10. `authors[]`
11. `externalIds` (DOI, ArXiv, CorpusId, PMID)
12. `fieldsOfStudy[]`

## Cache ve Güncelleme Politikası
- Tüm endpointler local snapshot mantığıyla çalışır.
- Snapshot dosyaları `data/` klasörüne yazılır.
- Otomatik yenileme aralığı: 12 saat.
- Cache yoksa endpoint boş fallback data üretmez; uygun durumda `503` dönebilir.
