// Supabase Database type definitions
// Run `supabase gen types typescript --linked` to regenerate from live schema.

import type { CountryCode, DocumentType, ActionType, Executability } from '@/lib/types';

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

// Supabase v2 requires Relationships on each table, and Views/Enums/CompositeTypes on the schema.
type NoRelationships = { Relationships: [] };

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string | null;
          phone: string | null;
          country_code: CountryCode;
          language_preference: string;
          google_access_token: string | null;
          google_refresh_token: string | null;
          google_token_expiry: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          phone?: string | null;
          country_code?: CountryCode;
          language_preference?: string;
          google_access_token?: string | null;
          google_refresh_token?: string | null;
          google_token_expiry?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['users']['Insert']>;
      } & NoRelationships;

      admin_units: {
        Row: {
          id: string;
          country_code: CountryCode;
          region_level_1: string;
          region_level_2: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          country_code?: CountryCode;
          region_level_1: string;
          region_level_2?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['admin_units']['Insert']>;
      } & NoRelationships;

      documents: {
        Row: {
          id: string;
          country_code: CountryCode;
          url: string | null;
          storage_path: string | null;
          raw_text: string | null;
          content_hash: string | null;
          scraped_at: string | null;
          uploaded_by: string | null;
          source: 'manual' | 'scraper' | 'whatsapp';
          created_at: string;
        };
        Insert: {
          id?: string;
          country_code?: CountryCode;
          url?: string | null;
          storage_path?: string | null;
          raw_text?: string | null;
          content_hash?: string | null;
          scraped_at?: string | null;
          uploaded_by?: string | null;
          source?: 'manual' | 'scraper' | 'whatsapp';
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['documents']['Insert']>;
      } & NoRelationships;

      document_analyses: {
        Row: {
          id: string;
          document_id: string;
          country_code: CountryCode;
          document_type: DocumentType | null;
          summary_en: string | null;
          summary_sw: string | null;
          affected_region_l1: string[] | null;
          affected_region_l2: string[] | null;
          key_dates: Json;
          analysis_json: Json;
          confidence_score: number | null;
          needs_review: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          country_code?: CountryCode;
          document_type?: DocumentType | null;
          summary_en?: string | null;
          summary_sw?: string | null;
          affected_region_l1?: string[] | null;
          affected_region_l2?: string[] | null;
          key_dates?: Json;
          analysis_json?: Json;
          confidence_score?: number | null;
          needs_review?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['document_analyses']['Insert']>;
      } & NoRelationships;

      actions: {
        Row: {
          id: string;
          analysis_id: string;
          country_code: CountryCode;
          action_type: ActionType;
          executability: Executability;
          title_en: string;
          title_sw: string | null;
          description_en: string | null;
          description_sw: string | null;
          legal_basis: string | null;
          draft_content_en: string | null;
          draft_content_sw: string | null;
          deadline: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          analysis_id: string;
          country_code?: CountryCode;
          action_type: ActionType;
          executability?: Executability;
          title_en: string;
          title_sw?: string | null;
          description_en?: string | null;
          description_sw?: string | null;
          legal_basis?: string | null;
          draft_content_en?: string | null;
          draft_content_sw?: string | null;
          deadline?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['actions']['Insert']>;
      } & NoRelationships;

      action_executions: {
        Row: {
          id: string;
          action_id: string;
          user_id: string;
          country_code: CountryCode;
          status: 'pending' | 'draft_shown' | 'confirmed' | 'submitted' | 'failed' | 'cancelled';
          draft_content: string | null;
          reference_id: string | null;
          error_message: string | null;
          executed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          action_id: string;
          user_id: string;
          country_code?: CountryCode;
          status?: 'pending' | 'draft_shown' | 'confirmed' | 'submitted' | 'failed' | 'cancelled';
          draft_content?: string | null;
          reference_id?: string | null;
          error_message?: string | null;
          executed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['action_executions']['Insert']>;
      } & NoRelationships;

      law_chunks: {
        Row: {
          id: string;
          country_code: CountryCode;
          statute_name: string;
          section_ref: string | null;
          chunk_text: string;
          chunk_index: number;
          // pgvector returns number[] via RPC; direct column reads vary by client version
          embedding: number[] | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          country_code?: CountryCode;
          statute_name: string;
          section_ref?: string | null;
          chunk_text: string;
          chunk_index: number;
          embedding?: number[] | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['law_chunks']['Insert']>;
      } & NoRelationships;

      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          country_code: CountryCode;
          region_l1: string | null;
          region_l2: string | null;
          topics: string[];
          channel: 'whatsapp' | 'sms' | 'email';
          language_preference: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          country_code?: CountryCode;
          region_l1?: string | null;
          region_l2?: string | null;
          topics?: string[];
          channel?: 'whatsapp' | 'sms' | 'email';
          language_preference?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['subscriptions']['Insert']>;
      } & NoRelationships;

      standing_consents: {
        Row: {
          id: string;
          user_id: string;
          country_code: CountryCode;
          action_type: ActionType;
          granted_at: string;
          revoked_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          country_code?: CountryCode;
          action_type: ActionType;
          granted_at?: string;
          revoked_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['standing_consents']['Insert']>;
      } & NoRelationships;

      deadlines: {
        Row: {
          id: string;
          user_id: string;
          document_id: string;
          country_code: CountryCode;
          deadline_date: string;
          label: string;
          notified_7d: boolean;
          notified_3d: boolean;
          notified_1d: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          document_id: string;
          country_code?: CountryCode;
          deadline_date: string;
          label: string;
          notified_7d?: boolean;
          notified_3d?: boolean;
          notified_1d?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['deadlines']['Insert']>;
      } & NoRelationships;

      notifications: {
        Row: {
          id: string;
          user_id: string;
          country_code: CountryCode;
          channel: 'whatsapp' | 'sms' | 'email';
          status: 'queued' | 'sent' | 'delivered' | 'failed';
          subject: string | null;
          body: string;
          document_id: string | null;
          action_id: string | null;
          external_id: string | null;
          sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          country_code?: CountryCode;
          channel: 'whatsapp' | 'sms' | 'email';
          status?: 'queued' | 'sent' | 'delivered' | 'failed';
          subject?: string | null;
          body: string;
          document_id?: string | null;
          action_id?: string | null;
          external_id?: string | null;
          sent_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>;
      } & NoRelationships;

      error_logs: {
        Row: {
          id: string;
          error_message: string;
          stack: string | null;
          context: Json;
          severity: 'debug' | 'info' | 'warning' | 'error' | 'fatal';
          created_at: string;
        };
        Insert: {
          id?: string;
          error_message: string;
          stack?: string | null;
          context?: Json;
          severity?: 'debug' | 'info' | 'warning' | 'error' | 'fatal';
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['error_logs']['Insert']>;
      } & NoRelationships;
    };

    Views: Record<string, never>;

    Functions: {
      match_law_chunks: {
        Args: {
          query_embedding: number[];
          query_country_code: CountryCode;
          match_threshold: number;
          match_count: number;
        };
        Returns: Array<{
          id: string;
          country_code: CountryCode;
          statute_name: string;
          section_ref: string | null;
          chunk_text: string;
          similarity: number;
        }>;
      };
    };

    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
