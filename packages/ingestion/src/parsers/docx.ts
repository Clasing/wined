import mammoth from 'mammoth';
import type { Parser, ParseResult, ParsedBlock } from './types.js';

export const docxParser: Parser = {
  name: 'docx',
  async parse(input): Promise<ParseResult> {
    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
    const res = await mammoth.extractRawText({ buffer });
    const text = res.value;
    return {
      text,
      blocks: text
        .split(/\n+/)
        .filter((l) => l.trim())
        .map((l): ParsedBlock => ({ type: 'paragraph', text: l })),
    };
  },
};
