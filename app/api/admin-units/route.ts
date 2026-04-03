import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ApiResponse, CountryCode } from '@/lib/types';
import type { Database } from '@/lib/supabase/types';

const VALID_COUNTRY_CODES: CountryCode[] = ['KE', 'TZ', 'UG', 'RW'];

export const runtime = 'nodejs';

type AdminUnit = Database['public']['Tables']['admin_units']['Row'];

/**
 * GET /api/admin-units?country_code=KE[&region_l1=Nairobi]
 * Returns admin units for a given country, optionally filtered by region_level_1.
 * Public endpoint — no auth required.
 */
export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<AdminUnit[]>>> {
  const { searchParams } = new URL(request.url);
  const rawCode = searchParams.get('country_code') ?? 'KE';
  const countryCode: CountryCode = VALID_COUNTRY_CODES.includes(rawCode as CountryCode)
    ? (rawCode as CountryCode)
    : 'KE';
  const regionL1 = searchParams.get('region_l1');

  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from('admin_units')
    .select('id, country_code, region_level_1, region_level_2, created_at')
    .eq('country_code', countryCode)
    .order('region_level_1')
    .order('region_level_2');

  if (regionL1) {
    query = query.eq('region_level_1', regionL1);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ success: false, error: 'Failed to load admin units' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: data ?? [] });
}
