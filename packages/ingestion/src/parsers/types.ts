export type ParsedBlock = {
  type: 'paragraph' | 'heading' | 'list' | 'table' | 'image_caption';
  text: string;
  pageNumber?: number;
  sectionPath?: string; // e.g. "Chapter 2 > Section 2.1"
  metadata?: Record<string, unknown>;
};

export type ParseResult = {
  text: string; // full text concatenated
  blocks: ParsedBlock[];
  language?: 'es' | 'en' | string;
  confidence?: number; // 0..1 (OCR confidence; undefined if no OCR involved)
  pages?: number;
  metadata?: Record<string, unknown>;
};

export interface Parser {
  readonly name: string;
  parse(input: Buffer | Uint8Array, opts?: { fileName?: string }): Promise<ParseResult>;
}
