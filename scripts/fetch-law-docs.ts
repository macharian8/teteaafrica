#!/usr/bin/env tsx
/**
 * scripts/fetch-law-docs.ts
 *
 * Downloads the 9 Kenya law documents from kenyalaw.org / parliament.go.ke,
 * extracts plain text with pdf-parse v2, and saves .txt files to
 * supabase/seed/law/KE/.
 *
 * Usage:
 *   pnpm run fetch:law-docs
 *
 * Skips files that already exist (run again after a partial failure).
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PDFParse } from 'pdf-parse';

// ── Target directory ──────────────────────────────────────────────────────────

const OUT_DIR = join(process.cwd(), 'supabase', 'seed', 'law', 'KE');
mkdirSync(OUT_DIR, { recursive: true });

// ── Document manifest ─────────────────────────────────────────────────────────

interface LawDoc {
  filename: string;
  label: string;
  url: string;
  /** Some URLs resolve to an HTML page containing a PDF link — set true to scrape */
  scrapeHtml?: boolean;
}

const DOCS: LawDoc[] = [
  {
    filename: 'constitution_2010.txt',
    label: 'Constitution of Kenya 2010 (Revised Edition 2022)',
    // Updated URL — kenyalaw.org reorganised /pdfdownloads/ structure
    url: 'https://www.kenyalaw.org/kl/fileadmin/pdfdownloads/TheConstitutionOfKenya.pdf',
  },
  {
    filename: 'access_to_information_act_2016.txt',
    label: 'Access to Information Act 2016 (No. 31 of 2016)',
    // Acts from 2016 onward are filed under /Acts/2016/
    url: 'https://kenyalaw.org/kl/fileadmin/pdfdownloads/Acts/2016/No._31_of_2016.pdf',
  },
  {
    filename: 'county_governments_act_2012.txt',
    label: 'County Governments Act 2012',
    url: 'https://kenyalaw.org/kl/fileadmin/pdfdownloads/Acts/CountyGovernmentsAct_No17of2012.pdf',
  },
  {
    filename: 'public_finance_management_act_2012.txt',
    label: 'Public Finance Management Act 2012 (Cap. 412A)',
    // Stored under chapter number, not year
    url: 'https://kenyalaw.org/kl/fileadmin/pdfdownloads/Cap_412A_Public_Finance_Management_Act.pdf',
  },
  {
    filename: 'emca.txt',
    label: 'Environment Management and Coordination Act (EMCA, No. 8 of 1999)',
    // Filename uses No8of1999, not Cap387
    url: 'https://kenyalaw.org/kl/fileadmin/pdfdownloads/Acts/EnvironmentalManagementandCo-ordinationAct_No8of1999.pdf',
  },
  {
    filename: 'ppra_act_2015.txt',
    label: 'Public Procurement and Asset Disposal Act 2015',
    // Double underscore before 33 in the actual filename
    url: 'https://kenyalaw.org/kl/fileadmin/pdfdownloads/Acts/PublicProcurementandAssetDisposalAct__33of2015.pdf',
  },
  {
    filename: 'national_assembly_standing_orders.txt',
    label: 'National Assembly Standing Orders (6th Edition, 2022)',
    // parliament.go.ke uses 2022-08 not 2022-10
    url: 'https://www.parliament.go.ke/sites/default/files/2022-08/National%20Assembly%20Standing%20Orders%20-%206th%20Edition,%202022_0.pdf',
  },
  {
    filename: 'senate_standing_orders.txt',
    label: 'Senate Standing Orders (2023 Revision)',
    // 2021 file no longer hosted; 2023 revision is the current published version
    url: 'https://www.parliament.go.ke/sites/default/files/2023-04/SENATE%20STANDING%20ORDERS%20-%202023%20REVISION%20iii.pdf',
  },
  {
    filename: 'county_assembly_model_standing_orders.txt',
    label: 'County Assembly Model Procedure and Practice Manual (County Assembly Forum)',
    // kenyalaw.org no longer hosts a model standing orders PDF.
    // This manual was produced by the County Assembly Forum / Council of Governors
    // and covers the same procedures: PP, petitions, legislative process.
    url: 'https://www.socattkenya.org/wp-content/uploads/2018/02/CountyAssemblyProcedurePracticeManual.pdf',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, timeoutMs = 60_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'TeteaAfrica/1.0 (law-seed-bot; +https://tetea.africa)' },
      redirect: 'follow',
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** Find the first href ending in .pdf inside an HTML string */
function extractPdfLink(html: string, baseUrl: string): string | null {
  const matches = html.match(/href="([^"]*\.pdf[^"]*)"/gi) ?? [];
  for (const m of matches) {
    const href = m.match(/href="([^"]+)"/i)?.[1];
    if (!href) continue;
    if (href.startsWith('http')) return href;
    try {
      return new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
  }
  return null;
}

async function fetchPdfBuffer(url: string): Promise<{ buffer: Buffer; finalUrl: string }> {
  let targetUrl = url;

  // For HTML index pages, scrape to find the PDF link first
  const isHtml =
    url.includes('index.php') || url.endsWith('.html') || url.endsWith('.htm');

  if (isHtml) {
    const htmlRes = await fetchWithTimeout(url);
    if (!htmlRes.ok) throw new Error(`HTTP ${htmlRes.status} fetching index page`);
    const html = await htmlRes.text();
    const pdfLink = extractPdfLink(html, url);
    if (!pdfLink) throw new Error('No .pdf link found on index page');
    targetUrl = pdfLink;
    process.stdout.write(`  (PDF link: ${pdfLink})\n`);
  }

  const res = await fetchWithTimeout(targetUrl, 90_000);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching PDF`);

  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('pdf') && !ct.includes('octet-stream') && !ct.includes('application')) {
    throw new Error(`Unexpected content-type: ${ct}`);
  }

  const arrayBuf = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuf), finalUrl: targetUrl };
}

function cleanText(raw: string): string {
  return raw
    .replace(/\f/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    // Remove isolated page numbers
    .replace(/^\s*\d{1,4}\s*$/gm, '')
    .trim();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nFetching Kenya law corpus → ${OUT_DIR}\n`);

  const results: Array<{
    filename: string;
    label: string;
    status: 'ok' | 'skipped' | 'error';
    chars?: number;
    pages?: number;
    isScanned?: boolean;
    error?: string;
  }> = [];

  for (const doc of DOCS) {
    const outPath = join(OUT_DIR, doc.filename);
    process.stdout.write(`  [${DOCS.indexOf(doc) + 1}/${DOCS.length}] ${doc.label}\n`);

    // Skip already-fetched files
    if (existsSync(outPath)) {
      const { statSync } = await import('fs');
      const existing = statSync(outPath);
      process.stdout.write(`      ✓ already exists (${existing.size.toLocaleString()} bytes) — skipped\n\n`);
      results.push({ filename: doc.filename, label: doc.label, status: 'skipped', chars: existing.size });
      continue;
    }

    try {
      process.stdout.write(`      fetching ${doc.url}\n`);
      const { buffer } = await fetchPdfBuffer(doc.url);
      process.stdout.write(`      parsing PDF (${(buffer.length / 1024).toFixed(0)} KB)\n`);

      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();

      const text = cleanText(result.text);
      const pages = result.total;
      const isScanned = pages > 0 && text.length / pages < 100;

      writeFileSync(outPath, text, 'utf-8');

      process.stdout.write(
        `      ✓ saved — ${text.length.toLocaleString()} chars, ${pages} pages${isScanned ? ' ⚠ LOW TEXT (likely scanned)' : ''}\n\n`
      );
      results.push({ filename: doc.filename, label: doc.label, status: 'ok', chars: text.length, pages, isScanned });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`      ✗ FAILED: ${msg}\n\n`);
      results.push({ filename: doc.filename, label: doc.label, status: 'error', error: msg });
    }
  }

  // ── Summary table ───────────────────────────────────────────────────────────
  console.log('─'.repeat(72));
  console.log('SUMMARY');
  console.log('─'.repeat(72));
  for (const r of results) {
    const icon = r.status === 'ok' ? '✓' : r.status === 'skipped' ? '↩' : '✗';
    const detail =
      r.status === 'ok'
        ? `${r.chars!.toLocaleString()} chars, ${r.pages} pages${r.isScanned ? ' ⚠ scanned' : ''}`
        : r.status === 'skipped'
        ? `already exists (${r.chars!.toLocaleString()} bytes)`
        : `ERROR: ${r.error}`;
    console.log(`  ${icon}  ${r.filename.padEnd(50)} ${detail}`);
  }
  console.log('─'.repeat(72));

  const ok = results.filter((r) => r.status === 'ok').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const failed = results.filter((r) => r.status === 'error').length;
  console.log(`\n  ${ok} fetched, ${skipped} skipped, ${failed} failed\n`);

  if (failed > 0) {
    console.log('  Failed files must be manually downloaded and saved to:');
    console.log(`  ${OUT_DIR}\n`);
    console.log('  See supabase/seed/law/KE/README.md for source URLs.\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('fetch:law-docs failed:', err);
  process.exit(1);
});
