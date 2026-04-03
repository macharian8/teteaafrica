import Anthropic from '@anthropic-ai/sdk';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/types';
import { queryLawChunks, formatChunksForPrompt } from '@/lib/rag/query';
import { buildSystemPrompt, buildUserMessage } from '@/lib/prompts/document-analysis';
import { logError, logTokenUsage } from '@/lib/supabase/errors';
import KE from '@/lib/countries/KE/config';
import type { CountryCode, DocumentAnalysisResult, ActionDraft } from '@/lib/types';
import type { CountryConfig } from '@/lib/countries/KE/config';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ANALYSIS_MODEL = 'claude-opus-4-6';
const MAX_TOKENS = 4096; // 2048 is insufficient for multi-action Acts (JSON truncates mid-array)
const CONFIDENCE_REVIEW_THRESHOLD = 0.7;

// Country config registry — extend when adding new countries
const COUNTRY_CONFIGS: Record<CountryCode, CountryConfig> = {
  KE,
  // TZ and UG added when lib/countries/TZ/ and lib/countries/UG/ are created
  TZ: KE, // eslint-disable-line @typescript-eslint/no-explicit-any -- placeholder, replaced in Phase 3
  UG: KE, // eslint-disable-line @typescript-eslint/no-explicit-any -- placeholder, replaced in Phase 3
  RW: KE, // eslint-disable-line @typescript-eslint/no-explicit-any -- placeholder, replaced in Phase 3
};

export interface AnalyzeDocumentInput {
  documentId: string;
  rawText: string;
  countryCode: CountryCode;
}

export interface AnalyzeDocumentOutput {
  analysisId: string;
  result: DocumentAnalysisResult;
  needsReview: boolean;
  alreadyExisted: boolean;
}

/**
 * Smart text extraction — prioritises civically relevant sections.
 * Always includes the document preamble (first 2,000 chars), then adds
 * 500-char windows around civic-action keywords, deduplicates overlapping
 * ranges, and falls back to a simple prefix slice if under budget.
 */
function extractRelevantText(rawText: string, maxChars = 12000): string {
  if (rawText.length <= maxChars) return rawText;

  const KEYWORDS = [
    'public participation', 'citizen', 'right', 'deadline', 'penalty',
    'objection', 'appeal', 'county', 'ward', 'budget',
  ];
  const WINDOW = 500;

  // Seed with the document opening
  const segments: [number, number][] = [[0, Math.min(2000, rawText.length)]];
  const lower = rawText.toLowerCase();

  for (const kw of KEYWORDS) {
    let pos = lower.indexOf(kw);
    while (pos !== -1) {
      segments.push([
        Math.max(0, pos - WINDOW),
        Math.min(rawText.length, pos + kw.length + WINDOW),
      ]);
      pos = lower.indexOf(kw, pos + 1);
    }
  }

  // Sort then merge overlapping / adjacent ranges
  segments.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of segments) {
    if (merged.length && s <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    } else {
      merged.push([s, e]);
    }
  }

  // Collect within budget
  let out = '';
  for (const [s, e] of merged) {
    if (out.length >= maxChars) break;
    out += rawText.slice(s, Math.min(e, s + maxChars - out.length));
  }

  // Under budget — pad from the beginning to reach maxChars
  if (out.length < maxChars) {
    out = rawText.slice(0, maxChars);
  }

  return out;
}

/**
 * Full document analysis pipeline:
 * 1. Check for existing analysis (dedup by document_id)
 * 2. RAG retrieval (max 5 law chunks, filtered by country_code)
 * 3. Build system prompt with prompt caching
 * 4. Stream Claude Opus response
 * 5. Parse + validate JSON output
 * 6. Persist to document_analyses + actions tables
 * 7. Log token usage
 */
export async function analyzeDocument(
  input: AnalyzeDocumentInput
): Promise<AnalyzeDocumentOutput> {
  const { documentId, rawText, countryCode } = input;
  const supabase = createServiceRoleClient();
  const countryConfig = COUNTRY_CONFIGS[countryCode] ?? COUNTRY_CONFIGS['KE'];

  // ── 1. Deduplication ─────────────────────────────────────────────────────
  const { data: existing } = await supabase
    .from('document_analyses')
    .select('id, analysis_json, confidence_score, needs_review')
    .eq('document_id', documentId)
    .gt('confidence_score', 0) // skip fallback rows (confidence_score = 0) so they can be re-analysed
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return {
      analysisId: existing.id,
      result: existing.analysis_json as unknown as DocumentAnalysisResult,
      needsReview: existing.needs_review,
      alreadyExisted: true,
    };
  }

  // ── 2. RAG retrieval ─────────────────────────────────────────────────────
  // Run three targeted queries and deduplicate by chunk id
  const ragQueries = [
    rawText.slice(0, 500), // document opening
    'citizen rights public participation',
    'government notice deadline obligation',
  ];

  const chunkSets = await Promise.all(
    ragQueries.map((q) => queryLawChunks(q, countryCode).catch(() => []))
  );
  const seenIds = new Set<string>();
  const lawChunks = chunkSets
    .flat()
    .filter((c) => {
      if (seenIds.has(c.id)) return false;
      seenIds.add(c.id);
      return true;
    })
    .slice(0, 5); // hard cap per CLAUDE.md

  const ragContext = formatChunksForPrompt(lawChunks);

  // ── 3. Build prompts ──────────────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(countryConfig, ragContext);
  const truncatedText = extractRelevantText(rawText);
  const userMessage = buildUserMessage(truncatedText, countryCode);

  // ── 4. Stream Claude Opus with prompt caching ─────────────────────────────
  // Use anthropic.beta.messages (supports cache_control on system blocks)
  // cache_control: ephemeral cuts repeated-context costs by ~90%
  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;

  const stream = anthropic.beta.messages.stream(
    {
      model: ANALYSIS_MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userMessage }],
      betas: ['prompt-caching-2024-07-31'],
    },
    { signal: AbortSignal.timeout(120000) }
  );

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      fullText += event.delta.text;
    }
  }

  const finalMessage = await stream.finalMessage();
  inputTokens = finalMessage.usage.input_tokens;
  outputTokens = finalMessage.usage.output_tokens;

  // ── 5. Parse JSON response ────────────────────────────────────────────────
  const jsonMatch = fullText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON object found in response');
  const result = JSON.parse(jsonMatch[0]) as DocumentAnalysisResult;

  const needsReview =
    !result.confidence_score || result.confidence_score < CONFIDENCE_REVIEW_THRESHOLD;

  // ── 6. Persist analysis ───────────────────────────────────────────────────
  const { data: analysisRow, error: analysisErr } = await supabase
    .from('document_analyses')
    .insert({
      document_id: documentId,
      country_code: countryCode,
      document_type: result.document_type ?? null,
      summary_en: result.summary_en ?? null,
      summary_sw: result.summary_sw ?? null,
      affected_region_l1: result.affected_region_l1 ?? [],
      affected_region_l2: result.affected_region_l2 ?? [],
      key_dates: (result.key_dates ?? []) as unknown as Json,
      analysis_json: result as unknown as Json,
      confidence_score: result.confidence_score ?? null,
      needs_review: needsReview,
    })
    .select('id')
    .single();

  if (analysisErr || !analysisRow) {
    await logError(supabase, analysisErr?.message ?? 'Analysis insert failed', {
      document_id: documentId,
    });
    throw new Error('Failed to save analysis');
  }

  // Persist individual actions
  if (result.actions?.length) {
    const actionRows = result.actions.map((a: ActionDraft) => ({
      analysis_id: analysisRow.id,
      country_code: countryCode,
      action_type: a.type,
      executability: a.executability,
      title_en: a.title_en,
      title_sw: a.title_sw ?? null,
      description_en: a.description_en ?? null,
      description_sw: a.description_sw ?? null,
      legal_basis: a.legal_basis ?? null,
      draft_content_en: a.draft_content_en ?? null,
      draft_content_sw: a.draft_content_sw ?? null,
      deadline: a.deadline ?? null,
    }));

    const { error: actionsErr } = await supabase.from('actions').insert(actionRows);
    if (actionsErr) {
      await logError(supabase, actionsErr.message, { analysis_id: analysisRow.id });
      // Non-fatal — analysis is stored, actions missing is recoverable
    }
  }

  // ── 7. Log token usage ────────────────────────────────────────────────────
  await logTokenUsage(
    supabase,
    ANALYSIS_MODEL,
    inputTokens,
    outputTokens,
    '/api/documents/analyze',
    documentId
  );

  return {
    analysisId: analysisRow.id,
    result,
    needsReview,
    alreadyExisted: false,
  };
}
