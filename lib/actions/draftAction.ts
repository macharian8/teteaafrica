import Anthropic from '@anthropic-ai/sdk';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logTokenUsage, logError } from '@/lib/supabase/errors';
import KE from '@/lib/countries/KE/config';
import {
  buildAtiRequestPrompt,
  buildAtiRequestUserMessage,
  type AtiRequestContext,
} from '@/lib/prompts/actions/ati-request';
import {
  buildPpSubmissionPrompt,
  buildPpSubmissionUserMessage,
  type PpSubmissionContext,
} from '@/lib/prompts/actions/pp-submission';
import {
  buildRepresentativeContactPrompt,
  buildRepresentativeContactUserMessage,
  type RepresentativeContactContext,
} from '@/lib/prompts/actions/representative-contact';
import type { ActionType, CountryCode } from '@/lib/types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Haiku for all action drafting — cost rule from CLAUDE.md
const DRAFT_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 512;

export interface DraftActionInput {
  actionType: ActionType;
  countryCode: CountryCode;
  context:
    | { type: 'ati_request'; data: AtiRequestContext }
    | { type: 'submission'; data: PpSubmissionContext }
    | { type: 'representative_contact'; data: RepresentativeContactContext };
  documentId?: string;
}

export interface DraftActionOutput {
  draft_en: string;
  draft_sw: string;
}

/**
 * Generate an EN + SW action draft using Claude Haiku.
 * Both languages are produced in a single call — never two calls.
 * Max tokens: 512 per CLAUDE.md cost rules.
 */
export async function draftAction(input: DraftActionInput): Promise<DraftActionOutput> {
  const { countryCode, context, documentId } = input;
  const supabase = createServiceRoleClient();

  // Country config — extend registry when adding TZ/UG
  const countryConfig = KE; // Only KE in MVP; generalise in Phase 3

  let systemPrompt: string;
  let userMessage: string;

  switch (context.type) {
    case 'ati_request':
      systemPrompt = buildAtiRequestPrompt(countryConfig);
      userMessage = buildAtiRequestUserMessage(context.data);
      break;

    case 'submission':
      systemPrompt = buildPpSubmissionPrompt(countryConfig);
      userMessage = buildPpSubmissionUserMessage(context.data);
      break;

    case 'representative_contact':
      systemPrompt = buildRepresentativeContactPrompt(countryConfig);
      userMessage = buildRepresentativeContactUserMessage(context.data);
      break;

    default: {
      const _exhaustive: never = context;
      throw new Error(`Unsupported action context type: ${(_exhaustive as { type: string }).type}`);
    }
  }

  const response = await anthropic.messages.create({
    model: DRAFT_MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const rawText =
    response.content[0].type === 'text' ? response.content[0].text : '';

  // Log token usage
  await logTokenUsage(
    supabase,
    DRAFT_MODEL,
    response.usage.input_tokens,
    response.usage.output_tokens,
    '/lib/actions/draftAction',
    documentId
  );

  // Parse JSON response
  let parsed: DraftActionOutput;
  try {
    const jsonText = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    parsed = JSON.parse(jsonText) as DraftActionOutput;
  } catch (parseErr) {
    await logError(
      supabase,
      'Failed to parse draftAction JSON',
      { action_type: input.actionType, country_code: countryCode, raw: rawText.slice(0, 300) },
      'error',
      parseErr instanceof Error ? parseErr.stack : undefined
    );
    throw new Error('Action draft generation failed — output was not valid JSON');
  }

  if (!parsed.draft_en || !parsed.draft_sw) {
    throw new Error('Action draft missing draft_en or draft_sw fields');
  }

  return parsed;
}
