/**
 * lib/parsers/ocrParser.ts
 * OCR pipeline for scanned PDFs using pdftoppm (poppler) + tesseract.js.
 *
 * Flow: PDF buffer → pdftoppm renders pages to PNG → tesseract.js OCR → concat.
 * Caller passes maxPages to cap work on long gazette issues (default 20).
 *
 * System dependency: pdftoppm (poppler-utils).
 *   macOS:  brew install poppler
 *   Ubuntu: apt install poppler-utils
 *   Vercel: use poppler buildpack or pre-built layer
 */

import { createWorker } from 'tesseract.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, readdir, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const execFileAsync = promisify(execFile);

const DPI = 200; // 200 DPI balances quality vs. speed for OCR

export interface OcrResult {
  text: string;
  pageCount: number;
  /** Average OCR confidence 0–100 */
  confidence: number;
}

/**
 * OCR a PDF buffer: converts pages to PNG via pdftoppm, runs Tesseract on each.
 * Languages: English + Swahili.
 */
export async function ocrPdfBuffer(buffer: Buffer, maxPages = 20): Promise<OcrResult> {
  // Create temp directory for this run
  const tempDir = await mkdtemp(join(tmpdir(), 'tetea-ocr-'));
  const pdfPath = join(tempDir, 'input.pdf');

  try {
    // Write PDF to temp file
    await writeFile(pdfPath, buffer);

    // Get page count using pdfinfo (part of poppler-utils)
    let totalPages = 0;
    try {
      const { stdout } = await execFileAsync('pdfinfo', [pdfPath]);
      const match = stdout.match(/Pages:\s+(\d+)/);
      totalPages = match ? parseInt(match[1], 10) : 0;
    } catch {
      // pdfinfo not available — estimate from pdftoppm output
      totalPages = maxPages;
    }

    const pagesToProcess = Math.min(totalPages, maxPages);
    console.log(`[ocr] Starting OCR: ${totalPages} pages total, processing ${pagesToProcess}`);

    // Render PDF pages to PNG using pdftoppm
    const outputPrefix = join(tempDir, 'page');
    await execFileAsync('pdftoppm', [
      '-png',
      '-r', String(DPI),
      '-f', '1',
      '-l', String(pagesToProcess),
      pdfPath,
      outputPrefix,
    ]);

    // Find rendered page images (pdftoppm names: page-01.png, page-02.png, etc.)
    const files = await readdir(tempDir);
    const pageFiles = files
      .filter((f) => f.startsWith('page-') && f.endsWith('.png'))
      .sort();

    if (pageFiles.length === 0) {
      console.warn('[ocr] pdftoppm produced no images');
      return { text: '', pageCount: totalPages, confidence: 0 };
    }

    console.log(`[ocr] Rendered ${pageFiles.length} page images`);

    // Create a single Tesseract worker (amortize init cost)
    const worker = await createWorker('eng+swa');

    const pageTexts: string[] = [];
    const confidences: number[] = [];

    for (let i = 0; i < pageFiles.length; i++) {
      const pagePath = join(tempDir, pageFiles[i]);
      try {
        const imgBuffer = await readFile(pagePath);
        const { data } = await worker.recognize(imgBuffer);

        pageTexts.push(data.text);
        confidences.push(data.confidence);

        console.log(`[ocr] Page ${i + 1}/${pageFiles.length}: ${data.text.length} chars, confidence=${Math.round(data.confidence)}%`);
      } catch (err) {
        console.error(`[ocr] Page ${i + 1} failed:`, err instanceof Error ? err.message : err);
      }
    }

    await worker.terminate();

    const text = pageTexts.join('\n\n');
    const avgConfidence = confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;

    console.log(`[ocr] pages=${pageFiles.length} confidence=${Math.round(avgConfidence)}% chars=${text.length}`);

    if (avgConfidence < 40) {
      console.warn(`[ocr] WARNING: Low OCR confidence (${Math.round(avgConfidence)}%). Text may be unreliable.`);
    }

    return {
      text,
      pageCount: totalPages,
      confidence: Math.round(avgConfidence),
    };
  } finally {
    // Clean up temp directory
    await rm(tempDir, { recursive: true, force: true }).catch(() => {
      // Ignore cleanup failures
    });
  }
}
