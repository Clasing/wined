import pdf from 'pdf-parse';
import { createWorker } from 'tesseract.js';
import type { Parser, ParseResult, ParsedBlock } from './types.js';

function splitIntoParagraphs(text: string): ParsedBlock[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((t): ParsedBlock => ({ type: 'paragraph', text: t }));
}

function detectLanguage(text: string): 'es' | 'en' | undefined {
  const sample = text.slice(0, 1000).toLowerCase();
  const esHits = (sample.match(/\b(el|la|los|las|de|que|para|con|por|una?)\b/g) ?? []).length;
  const enHits = (sample.match(/\b(the|of|and|to|in|that|for|with|a|an)\b/g) ?? []).length;
  if (esHits === 0 && enHits === 0) return undefined;
  return esHits > enHits ? 'es' : 'en';
}

export const pdfParser: Parser = {
  name: 'pdf',
  async parse(input): Promise<ParseResult> {
    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
    const res = await pdf(buffer);
    const text = res.text;
    const pages = res.numpages;
    const blocks: ParsedBlock[] = splitIntoParagraphs(text);

    // Heuristic: if extracted text is too sparse for the page count, assume scanned PDF
    const needsOcr = pages > 0 && text.length < 100 * pages;
    if (needsOcr) {
      const worker = await createWorker(['eng', 'spa']);
      const { data } = await worker.recognize(buffer);
      await worker.terminate();
      const ocrText = data.text;
      const lang = detectLanguage(ocrText);
      const result: ParseResult = {
        text: ocrText,
        blocks: splitIntoParagraphs(ocrText),
        pages,
        confidence: (data.confidence ?? 0) / 100,
        metadata: { ocrUsed: true },
      };
      if (lang !== undefined) result.language = lang;
      return result;
    }

    const lang = detectLanguage(text);
    const result: ParseResult = {
      text,
      blocks,
      pages,
      metadata: { ocrUsed: false },
    };
    if (lang !== undefined) result.language = lang;
    return result;
  },
};
