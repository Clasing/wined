import type { Parser } from './types.js';

export const audioParser: Parser = {
  name: 'audio',
  async parse() {
    throw new Error('Audio ingestion is deferred to Phase 2. See PLAN.md §0.');
  },
};
