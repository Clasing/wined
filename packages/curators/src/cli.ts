#!/usr/bin/env node
import { runCurator } from './curator.js';
import type { CuratorImpl } from './curator.js';
import { regulationCurator } from './regulation-curator.js';
import { doCurator } from './do-curator.js';
import { bookCurator } from './book-curator.js';
import { catalogCurator } from './catalog-curator.js';
import { corpusReviewer } from './corpus-reviewer.js';

const name = process.argv[2];
const map: Record<string, CuratorImpl> = {
  regulation: regulationCurator,
  do: doCurator,
  book: bookCurator,
  catalog: catalogCurator,
  reviewer: corpusReviewer,
  'corpus-reviewer': corpusReviewer,
};

const impl = name ? map[name] : undefined;
if (!impl) {
  console.error(
    'Usage: curators <regulation|do|book|catalog|reviewer|corpus-reviewer>',
  );
  process.exit(1);
}

const dbUrl = process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const result = await runCurator(impl, { trigger: 'cron' }, dbUrl);
console.log(JSON.stringify(result, null, 2));
process.exit(result.status === 'completed' ? 0 : 1);
