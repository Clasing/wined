import * as XLSX from 'xlsx';
import type { Parser, ParseResult, ParsedBlock } from './types.js';

export const xlsxParser: Parser = {
  name: 'xlsx',
  async parse(input): Promise<ParseResult> {
    const wb = XLSX.read(input, { type: 'buffer' });
    const blocks: ParsedBlock[] = [];
    let text = '';

    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      const sheetText = JSON.stringify(rows, null, 2);
      blocks.push({
        type: 'table',
        text: sheetText,
        sectionPath: sheetName,
        metadata: { sheetName, rowCount: rows.length },
      });
      text += `\n## ${sheetName}\n${sheetText}\n`;
    }

    return { text: text.trim(), blocks, metadata: { sheets: wb.SheetNames } };
  },
};
