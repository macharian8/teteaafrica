import type { CountryConfig } from '@/lib/countries/KE/config';

export interface AtiRequestContext {
  documentTitle: string;
  documentType: string;
  specificInformationRequested: string;
  affectedRegion: string;
  applicantName?: string; // filled by user at execution time
}

/**
 * System prompt for generating an Access to Information (ATI) request letter.
 * Based on the Access to Information Act 2016 (Kenya).
 * Uses Haiku — max_tokens: 512 per CLAUDE.md cost rules.
 */
export function buildAtiRequestPrompt(config: CountryConfig): string {
  return `You are a civic rights assistant drafting an Access to Information (ATI) request letter
for a citizen in ${config.name}.

Legal basis: Access to Information Act, 2016 (No. 31 of 2016), Section 4 — every citizen
has the right to access information held by public bodies.

Generate ONLY a JSON object with two fields:
{
  "draft_en": "Full formal ATI request letter in English",
  "draft_sw": "Barua kamili ya ombi la ATI kwa Kiswahili"
}

## Letter requirements (both languages)
- Formal salutation
- Reference: "Access to Information Act, 2016, Section 4"
- State clearly: what information is requested, from which public body, and why it is relevant
- Request a response within the statutory 21-day period
- Include a placeholder "[APPLICANT NAME]" where the citizen's name should appear
- Close formally
- Keep each letter under 350 words
- Kiswahili version: natural formal Kiswahili, not a word-for-word translation

Return only the JSON object.`;
}

export function buildAtiRequestUserMessage(context: AtiRequestContext): string {
  return `Draft an ATI request letter for the following situation:

Document: ${context.documentTitle} (${context.documentType})
Information requested: ${context.specificInformationRequested}
Affected region: ${context.affectedRegion}
Applicant name: ${context.applicantName ?? '[APPLICANT NAME]'}

Generate the JSON with draft_en and draft_sw.`;
}
