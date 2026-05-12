import type { ParseResult, ParsedBlock } from './parsers/types.js';

export type Chunk = {
  content: string;
  tokenCount: number;
  metadata: {
    pageNumber?: number;
    sectionPath?: string;
    blockTypes: string[];
    chunkIndex: number;
  };
};

export type ChunkerOptions = {
  chunkSizeTokens?: number; // default 700
  overlapTokens?: number; // default 80
  bookAware?: boolean; // si true, respeta page/section boundaries
};

// Heurística simple: 1 token ≈ 4 chars
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function chunkParseResult(
  parsed: ParseResult,
  opts: ChunkerOptions = {},
): Chunk[] {
  const chunkSize = opts.chunkSizeTokens ?? 700;
  const overlap = opts.overlapTokens ?? 80;
  const bookAware = opts.bookAware ?? false;

  if (bookAware) {
    return chunkBookAware(parsed.blocks, chunkSize, overlap);
  }

  return chunkSimple(parsed.text, chunkSize, overlap);
}

function chunkSimple(text: string, chunkSize: number, overlap: number): Chunk[] {
  const chunkChars = chunkSize * 4;
  const overlapChars = overlap * 4;
  const chunks: Chunk[] = [];
  let cursor = 0;
  let idx = 0;

  while (cursor < text.length) {
    const end = Math.min(cursor + chunkChars, text.length);
    const content = text.slice(cursor, end).trim();
    if (content.length > 0) {
      chunks.push({
        content,
        tokenCount: estimateTokens(content),
        metadata: { chunkIndex: idx++, blockTypes: ['paragraph'] },
      });
    }
    if (end >= text.length) break;
    cursor = end - overlapChars;
  }

  return chunks;
}

function chunkBookAware(
  blocks: ParsedBlock[],
  chunkSize: number,
  overlap: number,
): Chunk[] {
  const chunks: Chunk[] = [];
  let buffer: ParsedBlock[] = [];
  let bufferTokens = 0;
  let idx = 0;
  let currentPage: number | undefined;
  let currentSection: string | undefined;

  function flush() {
    if (buffer.length === 0) return;
    const content = buffer.map((b) => b.text).join('\n\n');
    const metadata: Chunk['metadata'] = {
      chunkIndex: idx++,
      blockTypes: Array.from(new Set(buffer.map((b) => b.type))),
    };
    if (currentPage !== undefined) metadata.pageNumber = currentPage;
    if (currentSection !== undefined) metadata.sectionPath = currentSection;
    chunks.push({
      content,
      tokenCount: estimateTokens(content),
      metadata,
    });
    // overlap: keep last block(s) up to overlap tokens
    const overlapBlocks: ParsedBlock[] = [];
    let overlapAcc = 0;
    for (let i = buffer.length - 1; i >= 0 && overlapAcc < overlap; i--) {
      overlapBlocks.unshift(buffer[i]!);
      overlapAcc += estimateTokens(buffer[i]!.text);
    }
    buffer = overlapBlocks;
    bufferTokens = overlapAcc;
  }

  for (const block of blocks) {
    const tokens = estimateTokens(block.text);

    // Page or section boundary → flush
    if (
      (block.pageNumber !== undefined && block.pageNumber !== currentPage) ||
      (block.sectionPath !== undefined && block.sectionPath !== currentSection)
    ) {
      flush();
      currentPage = block.pageNumber ?? currentPage;
      currentSection = block.sectionPath ?? currentSection;
    }

    if (bufferTokens + tokens > chunkSize && buffer.length > 0) {
      flush();
    }

    buffer.push(block);
    bufferTokens += tokens;
  }

  flush();
  return chunks;
}
