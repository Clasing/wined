import { createWorker } from 'tesseract.js';
import type { Parser, ParseResult, ParsedBlock } from './types.js';

export const imageOcrParser: Parser = {
  name: 'image-ocr',
  async parse(input): Promise<ParseResult> {
    const worker = await createWorker(['eng', 'spa']);
    const { data } = await worker.recognize(Buffer.isBuffer(input) ? input : Buffer.from(input));
    await worker.terminate();
    return {
      text: data.text,
      blocks: data.text
        .split(/\n+/)
        .filter((l) => l.trim())
        .map((l): ParsedBlock => ({ type: 'paragraph', text: l })),
      confidence: (data.confidence ?? 0) / 100,
      metadata: { ocrUsed: true },
    };
  },
};
