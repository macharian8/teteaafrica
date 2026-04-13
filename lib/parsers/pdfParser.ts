// pdf-parse ships as CJS only — use require to avoid ESM/pdfjs-dist browser-API issues
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require('pdf-parse') as {
  PDFParse: new (opts: { data: Buffer }) => { getText(): Promise<{ text: string; total: number }> };
};

export interface ParsedDocument {
  text: string;
  pageCount: number;
  /** True when text/page ratio is very low — likely a scanned PDF needing OCR */
  isScanned: boolean;
  /** OCR confidence 0–100, null if not OCR'd */
  ocrConfidence: number | null;
}

const SCANNED_CHARS_PER_PAGE_THRESHOLD = 100;
// Target <4000 tokens ≈ 16 000 characters (4 chars/token)
const MAX_ANALYSIS_CHARS = 16_000;

export async function parsePdfBuffer(buffer: Buffer): Promise<ParsedDocument> {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  const text = preprocessText(result.text);
  const pageCount = result.total;
  const isScanned =
    pageCount > 0 && text.length / pageCount < SCANNED_CHARS_PER_PAGE_THRESHOLD;

  // OCR fallback for scanned PDFs with insufficient text
  if (isScanned && text.length < 500) {
    console.log('[parser] OCR fallback triggered for scanned PDF');
    try {
      const { ocrPdfBuffer } = await import('@/lib/parsers/ocrParser');
      const ocrResult = await ocrPdfBuffer(buffer);
      if (ocrResult.text.length > text.length) {
        return {
          text: preprocessText(ocrResult.text),
          pageCount: ocrResult.pageCount,
          isScanned: true,
          ocrConfidence: ocrResult.confidence,
        };
      }
    } catch (err) {
      console.error('[parser] OCR fallback failed:', err instanceof Error ? err.message : err);
    }
  }

  return { text, pageCount, isScanned, ocrConfidence: null };
}

export async function parseUrl(
  url: string
): Promise<ParsedDocument & { contentType: string }> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'TeteaAfrica/1.0 (+https://tetea.africa/bot)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
  }
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/pdf')) {
    const buffer = Buffer.from(await response.arrayBuffer());
    const parsed = await parsePdfBuffer(buffer);
    return { ...parsed, contentType };
  }

  if (contentType.includes('text/html')) {
    const html = await response.text();
    const text = preprocessText(stripHtml(html));
    return { text, pageCount: 1, isScanned: false, ocrConfidence: null, contentType };
  }

  throw new Error(`Unsupported content type: ${contentType}`);
}

/** Strip HTML tags, scripts, styles — return plain text */
function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

/**
 * Clean extracted text for analysis.
 * Collapses whitespace, removes page-number artefacts.
 * Truncates to MAX_ANALYSIS_CHARS to stay within the <4000 token budget.
 */
export function preprocessText(rawText: string): string {
  const cleaned = rawText
    .replace(/\f/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    // Strip lone page-number lines: e.g. "\n47\n"
    .replace(/^\s*\d{1,4}\s*$/gm, '')
    .trim();

  if (cleaned.length <= MAX_ANALYSIS_CHARS) return cleaned;

  // Truncate at a paragraph boundary to avoid mid-sentence cuts
  const truncated = cleaned.slice(0, MAX_ANALYSIS_CHARS);
  const lastParagraph = truncated.lastIndexOf('\n\n');
  return lastParagraph > MAX_ANALYSIS_CHARS * 0.8
    ? truncated.slice(0, lastParagraph)
    : truncated;
}
