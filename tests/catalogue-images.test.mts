import assert from 'node:assert/strict';
import test from 'node:test';

import { CATALOGUE_IMAGE_FRESH_MS, catalogueImagesFor, catalogueImagesSettled, imageFromAgentUri, resetCatalogueImages } from '../src/lib/registry/image';

const agents = [
  { chainId: 56, tokenId: '374107' },
  { chainId: 97, tokenId: '2618' },
  { chainId: 56, tokenId: '1' },
];
const brinkwatch = 'https://pokter.xyz/agents/brinkwatch.svg';

function reader(answers: Record<string, string | null>, calls: string[] = []) {
  return async (chainId: number, ids: readonly string[]) => {
    calls.push(`${chainId}:${ids.join(',')}`);
    return new Map(ids.filter((id) => `${chainId}:${id}` in answers).map((id) => [id, answers[`${chainId}:${id}`]]));
  };
}

test('a card never waits: the first build has nothing yet, and the read lands for the next one', async () => {
  resetCatalogueImages();
  const read = reader({ '56:374107': brinkwatch, '97:2618': brinkwatch, '56:1': null });
  assert.equal(catalogueImagesFor(agents, { read }).size, 0, 'the indexer image is used until the read lands');
  await catalogueImagesSettled();
  const known = catalogueImagesFor(agents, { read });
  assert.equal(known.get('56:374107'), brinkwatch);
  assert.equal(known.get('97:2618'), brinkwatch);
  assert.equal(known.get('56:1'), null, 'an agent that registered no image is known to have none');
});

test('one read per chain, one at a time, and none while fresh', async () => {
  resetCatalogueImages();
  const calls: string[] = [];
  const read = reader({ '56:374107': brinkwatch }, calls);
  catalogueImagesFor(agents, { read });
  catalogueImagesFor(agents, { read });
  await catalogueImagesSettled();
  assert.deepEqual(calls, ['56:374107,1', '97:2618'], 'grouped by chain, and the second call joined the first');
  catalogueImagesFor(agents, { read });
  await catalogueImagesSettled();
  assert.equal(calls.length, 2, 'fresh, so not read again');
  catalogueImagesFor(agents, { read, now: Date.now() + CATALOGUE_IMAGE_FRESH_MS + 1 });
  await catalogueImagesSettled();
  assert.equal(calls.length, 4, 'stale, so read again');
});

test('a read that fails keeps what was known', async () => {
  resetCatalogueImages();
  catalogueImagesFor(agents, { read: reader({ '56:374107': brinkwatch }) });
  await catalogueImagesSettled();
  const failing = async () => {
    throw new Error('rpc down');
  };
  catalogueImagesFor(agents, { read: failing, now: Date.now() + CATALOGUE_IMAGE_FRESH_MS + 1 });
  await catalogueImagesSettled();
  assert.equal(catalogueImagesFor(agents, { read: failing }).get('56:374107'), brinkwatch);
});

test('the image is read from an on-chain registration, https only', () => {
  const uri = (file: object) => `data:application/json;base64,${Buffer.from(JSON.stringify(file)).toString('base64')}`;
  assert.equal(imageFromAgentUri(uri({ name: 'Brinkwatch by Pokter', image: brinkwatch })), brinkwatch);
  assert.equal(imageFromAgentUri(uri({ image: 'http://example.com/a.png' })), null);
  assert.equal(imageFromAgentUri(uri({ name: 'no image' })), null);
});

test('images Pokter publishes for other sites may be embedded by them; pages may not', async () => {
  const { default: config } = await import('../next.config');
  const rules = await config.headers!();
  const corp = (source: string) =>
    rules
      .filter((rule) => rule.source === source)
      .flatMap((rule) => rule.headers)
      .filter((header) => header.key === 'Cross-Origin-Resource-Policy')
      .map((header) => header.value);
  assert.deepEqual(corp('/:path*'), ['same-origin']);
  for (const source of ['/agents/:file([a-z0-9-]+\\.svg)', '/api/avatars/:seed*', '/apple-icon.png']) {
    assert.deepEqual(corp(source), ['cross-origin'], source);
  }
  /* Declared after the site-wide rule, because the later one wins. */
  const order = rules.map((rule) => rule.source);
  assert.ok(order.indexOf('/:path*') < order.indexOf('/apple-icon.png'));
});
