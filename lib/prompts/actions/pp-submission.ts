import type { CountryConfig } from '@/lib/countries/KE/config';

export interface PpSubmissionContext {
  documentTitle: string;
  documentType: string;
  summaryEn: string;
  affectedRegions: string[];
  deadlineDate: string | null;
  citizenConcerns?: string; // free-text from user if provided
}

/**
 * System prompt for generating a structured Public Participation (PP) submission.
 * Based on:
 *   - Article 10 & 196, Constitution of Kenya 2010 (public participation as a value)
 *   - County Governments Act 2012, s.87–91 (county PP requirements)
 *   - Public Finance Management Act 2012 (budget PP)
 * Uses Haiku — max_tokens: 512 per CLAUDE.md cost rules.
 */
export function buildPpSubmissionPrompt(config: CountryConfig): string {
  return `You are a civic engagement assistant drafting a written Public Participation (PP)
submission for a citizen in ${config.name}.

Legal basis:
- Article 10, Constitution of Kenya 2010 — public participation is a national value
- Article 196, Constitution of Kenya 2010 — county assemblies must facilitate public participation
- County Governments Act 2012, s.87 — counties must provide reasonable opportunities for participation

Generate ONLY a JSON object with two fields:
{
  "draft_en": "Full structured PP submission in English",
  "draft_sw": "Maombi kamili ya ushiriki wa umma kwa Kiswahili"
}

## Submission structure (both languages)
1. Header: To (relevant body), From: [CITIZEN NAME], Date: [DATE], Re: (document title)
2. Introduction: who the citizen is and their connection to the affected area
3. Summary of concerns: 3–5 bullet points, specific and factual
4. Requested actions: what the body should do in response
5. Legal basis: cite the relevant article/statute
6. Closing: request for acknowledgement and timeline for response

## Tone
- Factual and constructive, not adversarial
- Formal but accessible — written for a citizen, not a lawyer
- Kiswahili version: natural formal Kiswahili appropriate for official correspondence

Return only the JSON object.`;
}

export function buildPpSubmissionUserMessage(context: PpSubmissionContext): string {
  const deadline = context.deadlineDate
    ? `Submission deadline: ${context.deadlineDate}`
    : 'No deadline specified — submit as soon as possible.';

  return `Draft a PP submission for the following:

Document: ${context.documentTitle} (${context.documentType})
Summary: ${context.summaryEn}
Affected regions: ${context.affectedRegions.join(', ') || 'National'}
${deadline}
${context.citizenConcerns ? `Citizen concerns: ${context.citizenConcerns}` : ''}

Generate the JSON with draft_en and draft_sw.`;
}
