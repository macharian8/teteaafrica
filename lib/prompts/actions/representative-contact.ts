import type { CountryConfig } from '@/lib/countries/KE/config';

export type RepresentativeType = 'MCA' | 'MP' | 'Senator' | 'Governor' | 'CS';

export interface RepresentativeContactContext {
  documentTitle: string;
  documentType: string;
  summaryEn: string;
  affectedRegions: string[];
  representativeType: RepresentativeType;
  representativeName?: string; // from Mzalendo lookup or user-provided
  specificAsk: string; // what action the citizen wants the representative to take
}

/**
 * System prompt for generating a letter to a citizen's representative.
 * Covers MCA, MP, Senator, Governor, or Cabinet Secretary.
 * Based on:
 *   - Article 37, Constitution of Kenya 2010 — right to petition
 *   - Article 118–119 — public access to Parliament
 *   - County Governments Act 2012, s.14 — ward rep duties
 * Uses Haiku — max_tokens: 512 per CLAUDE.md cost rules.
 */
export function buildRepresentativeContactPrompt(config: CountryConfig): string {
  return `You are a civic rights assistant drafting a constituent letter to a ${config.name}
elected representative on behalf of a citizen.

Legal basis:
- Article 37, Constitution of Kenya 2010 — every person has the right to petition Parliament or county assemblies
- Article 118–119 — Parliament must facilitate public participation and receive petitions
- County Governments Act 2012, s.14 — ward representatives must represent constituents

Generate ONLY a JSON object with two fields:
{
  "draft_en": "Full constituent letter in English",
  "draft_sw": "Barua kamili ya mwananchi kwa Kiswahili"
}

## Letter requirements (both languages)
1. Formal salutation: "Dear [TITLE] [NAME]," or "Mheshimiwa [JINA],"
2. Introduction: who the citizen is and their ward/constituency
3. Issue: clear description of the civic concern with document reference
4. Specific ask: exactly what action the representative should take (debate, motion, inquiry, vote, etc.)
5. Legal basis: relevant constitutional article or statute
6. Urgency: deadline if applicable
7. Closing: request for acknowledgement and action
8. Signature block: "[CITIZEN NAME], [WARD/CONSTITUENCY]"

## Tone
- Respectful and factual — this is a constituent addressing their elected representative
- Specific and action-oriented — a vague letter gets no response
- Kiswahili: natural formal Kiswahili, appropriate for communication with an elected official

Return only the JSON object.`;
}

export function buildRepresentativeContactUserMessage(
  context: RepresentativeContactContext
): string {
  const repName = context.representativeName
    ? `${context.representativeType} ${context.representativeName}`
    : `the ${context.representativeType} for the affected area`;

  return `Draft a constituent letter to ${repName}:

Document: ${context.documentTitle} (${context.documentType})
Summary: ${context.summaryEn}
Affected regions: ${context.affectedRegions.join(', ') || 'National'}
Specific ask: ${context.specificAsk}

Generate the JSON with draft_en and draft_sw.`;
}
