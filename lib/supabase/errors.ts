import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from './types';

type Severity = Database['public']['Tables']['error_logs']['Row']['severity'];

/**
 * Log a server-side error to the error_logs table.
 * Uses service-role client only — never call from browser.
 */
export async function logError(
  supabase: SupabaseClient<Database>,
  message: string,
  context: Record<string, unknown> = {},
  severity: Severity = 'error',
  stack?: string
): Promise<void> {
  await supabase.from('error_logs').insert({
    error_message: message,
    stack: stack ?? null,
    context: context as Json,
    severity,
  });
}

/**
 * Log Claude API token usage to error_logs (context field).
 * Keyed with severity 'info' so it doesn't pollute error alerts.
 */
export async function logTokenUsage(
  supabase: SupabaseClient<Database>,
  model: string,
  inputTokens: number,
  outputTokens: number,
  path: string,
  documentId?: string
): Promise<void> {
  await logError(
    supabase,
    `token_usage model=${model} input=${inputTokens} output=${outputTokens}`,
    { model, input_tokens: inputTokens, output_tokens: outputTokens, path, document_id: documentId },
    'info'
  );
}
