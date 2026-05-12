import Papa from 'papaparse';
import type { Parser, ParseResult, ParsedBlock } from './types.js';

export const csvParser: Parser = {
  name: 'csv',
  async parse(input): Promise<ParseResult> {
    const text = Buffer.isBuffer(input) ? input.toString('utf-8') : new TextDecoder().decode(input);
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    const block: ParsedBlock = {
      type: 'table',
      text: JSON.stringify(parsed.data, null, 2),
      metadata: { rowCount: parsed.data.length, fields: parsed.meta.fields },
    };
    return { text, blocks: [block], metadata: { fields: parsed.meta.fields } };
  },
};
