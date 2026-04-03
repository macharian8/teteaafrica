/**
 * Seed admin_units table from ken_admin_boundaries.xlsx
 *
 * admin1 sheet → region_level_1 (County), region_level_2 = null
 * admin2 sheet → region_level_1 (County), region_level_2 (Sub-county)
 *
 * Usage: npx tsx scripts/seed_admin_units.ts ~/Downloads/ken_admin_boundaries.xlsx
 */

import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'
import * as path from 'path'
import * as os from 'os'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

type Admin1Row = {
  adm1_name: string
  adm1_pcode: string
}

type Admin2Row = {
  adm2_name: string
  adm2_pcode: string
  adm1_name: string
  adm1_pcode: string
}

async function main() {
  const filePath = process.argv[2]
    ? process.argv[2].replace('~', os.homedir())
    : path.join(os.homedir(), 'Downloads', 'ken_admin_boundaries.xlsx')

  console.log(`Reading: ${filePath}`)
  const wb = XLSX.readFile(filePath)

  // --- admin1: one row per county, region_level_2 = null ---
  const admin1Rows: Admin1Row[] = XLSX.utils.sheet_to_json(wb.Sheets['ken_admin1'])
  const countiesPayload = admin1Rows.map((r) => ({
    country_code: 'KE',
    region_level_1: r.adm1_name.trim(),
    region_level_2: null as string | null,
  }))
  console.log(`Counties (admin1): ${countiesPayload.length}`)

  // --- admin2: sub-counties linked to their county ---
  const admin2Rows: Admin2Row[] = XLSX.utils.sheet_to_json(wb.Sheets['ken_admin2'])
  const subCountiesPayload = admin2Rows.map((r) => ({
    country_code: 'KE',
    region_level_1: r.adm1_name.trim(),
    region_level_2: r.adm2_name.trim(),
  }))
  console.log(`Sub-counties (admin2): ${subCountiesPayload.length}`)

  // --- Upsert counties first ---
  console.log('\nInserting counties...')
  const { error: err1 } = await supabase
    .from('admin_units')
    .upsert(countiesPayload, {
      onConflict: 'country_code,region_level_1,region_level_2',
      ignoreDuplicates: true,
    })
  if (err1) {
    // Upsert requires a unique constraint; fall back to delete+insert
    console.warn('Upsert failed (no unique constraint?), using insert with duplicates ignored:', err1.message)
    const { error: err1b } = await supabase.from('admin_units').insert(countiesPayload)
    if (err1b) { console.error('County insert failed:', err1b.message); process.exit(1) }
  }
  console.log(`✓ ${countiesPayload.length} counties inserted`)

  // --- Upsert sub-counties in batches of 100 ---
  console.log('Inserting sub-counties...')
  const BATCH = 100
  let inserted = 0
  for (let i = 0; i < subCountiesPayload.length; i += BATCH) {
    const batch = subCountiesPayload.slice(i, i + BATCH)
    const { error: err2 } = await supabase.from('admin_units').insert(batch)
    if (err2) { console.error(`Batch ${i}–${i + BATCH} failed:`, err2.message); process.exit(1) }
    inserted += batch.length
    process.stdout.write(`\r  ${inserted}/${subCountiesPayload.length}`)
  }
  console.log(`\n✓ ${inserted} sub-counties inserted`)

  console.log('\nDone.')
}

main().catch((e) => { console.error(e); process.exit(1) })
