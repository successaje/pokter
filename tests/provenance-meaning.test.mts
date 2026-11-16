import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { PROVENANCE } from '../src/lib/api/provenance';

/*
 * llms.txt and /methodology defined `attested` two different ways, and
 * llms.txt left out `calculated`. Both now read one list, which /api/v1
 * also lists its enum from.
 */

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('every provenance value the API reports is defined once, in the order the API has always listed them', () => {
  assert.deepEqual(PROVENANCE.map((p) => p.id), ['onchain', 'attested', 'pokter-measured', 'calculated', 'declared']);
  const attested = PROVENANCE.find((p) => p.id === 'attested')!.meaning;
  /* Both things the API labels attested: an agent's signed price, and an outside measurer. */
  assert.match(attested, /agent’s registered wallet/);
  assert.match(attested, /ERC-8004 reputation registry/);
  for (const p of PROVENANCE) assert.doesNotMatch(p.meaning, /`/, 'meanings are shown on a page as well as in llms.txt');
});

test('llms.txt, /methodology and the API index all read that list', () => {
  const llms = code('app/llms.txt/route.ts');
  assert.match(llms, /\$\{PROVENANCE\.map\(\(p\) => `- \\`\$\{p\.id\}\\`: \$\{p\.meaning\}`\)\.join\('\\n'\)\}/);
  assert.doesNotMatch(llms, /is signed by the agent's registered wallet/);

  const methodology = code('app/(site)/methodology/page.tsx');
  assert.match(methodology, /\{PROVENANCE\.map\(\(p\) => \(\s*<li key=\{p\.id\}><strong>\{p\.label\}<\/strong> \(<code>\{p\.id\}<\/code>\): \{p\.meaning\}<\/li>/);
  assert.doesNotMatch(methodology, /four kinds of fact/);

  assert.match(code('app/api/v1/route.ts'), /provenance: PROVENANCE\.map\(\(p\) => p\.id\),/);
});
