// Shared application types for Tetea Africa

export type CountryCode = 'KE' | 'TZ' | 'UG' | 'RW';

export type DocumentType =
  | 'gazette_notice'
  | 'county_policy'
  | 'parliamentary_bill'
  | 'budget'
  | 'tender'
  | 'nema'
  | 'land'
  | 'other';

export type ActionType =
  | 'ati_request'
  | 'petition'
  | 'calendar_invite'
  | 'submission'
  | 'complaint_anticorruption'
  | 'complaint_ombudsman'
  | 'environment_objection'
  | 'representative_contact'
  | 'media_pitch'
  | 'inform_only';

export type Executability = 'auto' | 'scaffolded' | 'inform_only';

export interface KeyDate {
  label: string;
  date: string; // ISO date string
  is_deadline: boolean;
}

export interface ActionDraft {
  id: string;
  type: ActionType;
  title_en: string;
  title_sw: string;
  description_en: string;
  description_sw: string;
  legal_basis: string;
  deadline: string | null; // ISO date or null
  executability: Executability;
  draft_content_en: string;
  draft_content_sw: string;
}

export interface DocumentAnalysisResult {
  country_code: CountryCode;
  title: string;
  document_type: DocumentType;
  summary_en: string;
  summary_sw: string;
  affected_region_l1: string[];
  affected_region_l2: string[];
  key_dates: KeyDate[];
  actions: ActionDraft[];
  raw_legal_provisions: string[];
  confidence_score: number; // 0.0–1.0
}

export interface LawChunk {
  id: string;
  country_code: CountryCode;
  statute_name: string;
  section_ref: string | null;
  chunk_text: string;
  similarity: number;
}

export interface ApiResponse<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}
