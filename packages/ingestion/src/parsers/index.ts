export * from './types.js';
export { pdfParser } from './pdf.js';
export { xlsxParser } from './xlsx.js';
export { docxParser } from './docx.js';
export { csvParser } from './csv.js';
export { imageOcrParser } from './image-ocr.js';
export { audioParser } from './audio.js';

import type { Parser } from './types.js';
import { pdfParser } from './pdf.js';
import { xlsxParser } from './xlsx.js';
import { docxParser } from './docx.js';
import { csvParser } from './csv.js';
import { imageOcrParser } from './image-ocr.js';
import { audioParser } from './audio.js';

export function parserForMime(mime: string): Parser {
  if (mime === 'application/pdf') return pdfParser;
  if (
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-excel'
  )
    return xlsxParser;
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    return docxParser;
  if (mime === 'text/csv') return csvParser;
  if (mime.startsWith('image/')) return imageOcrParser;
  if (mime.startsWith('audio/')) return audioParser;
  throw new Error(`No parser for MIME: ${mime}`);
}

export function parserForExtension(filename: string): Parser {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'pdf':
      return pdfParser;
    case 'xlsx':
    case 'xls':
      return xlsxParser;
    case 'docx':
      return docxParser;
    case 'csv':
      return csvParser;
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'webp':
    case 'tiff':
      return imageOcrParser;
    case 'mp3':
    case 'wav':
    case 'm4a':
      return audioParser;
    default:
      throw new Error(`No parser for extension: ${ext}`);
  }
}
