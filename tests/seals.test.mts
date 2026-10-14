import assert from 'node:assert/strict';
import test from 'node:test';

import { NonCanonical, canonicalJson, sealHash } from '../src/lib/seals/canonical';
import { buildSealDocument, diffSeals, sealMatches, sealOf, type SealedClaim } from '../src/lib/seals/document';
import { sealAction } from '../src/lib/seals/cadence';

const sealActionOf = (latest: { hash: string; sealedAt: string; anchored: boolean }) =>
  sealAction(latest, new Date('2026-10-15T12:00:00Z'));

/**
 * A seal's whole value is that the same claims hash the same way for
 * someone else, later, on another machine. These pin that, because a
 * change here does not break a test anywhere else — it silently makes
 * every seal published before it unverifiable.
 */

function claim(overrides: Partial<SealedClaim> = {}): SealedClaim {
  return {
    chainId: 56,
    tokenId: '372022',
    verdict: 'measured',
    category: 'evidence',
    probes: { total: 262, answered: 262 },
    observedDays: 29,
    priceRaw: '10000000000000000',
    priceCurrency: '0xcE24439F2D9C6a2289F741120FE202248B666666',
    attestations: 0,
    ...overrides,
  };
}

test('key order never changes the bytes', () => {
  const a = canonicalJson({ b: 1, a: 2, c: { z: 1, y: 2 } });
  const b = canonicalJson({ c: { y: 2, z: 1 }, a: 2, b: 1 });
  assert.equal(a, b);
  assert.equal(a, '{"a":2,"b":1,"c":{"y":2,"z":1}}');
});

test('an absent key and an undefined one seal identically', () => {
  assert.equal(canonicalJson({ a: 1, b: undefined }), canonicalJson({ a: 1 }));
});

test('null is a value and is kept', () => {
  assert.equal(canonicalJson({ a: null }), '{"a":null}');
});

test('a float is refused rather than sealed', () => {
  // 0.993 cannot be recomputed to the same bits by a reader elsewhere, and
  // a price that round-trips through a float can seal one number and
  // serve another.
  assert.throws(() => canonicalJson({ availability: 0.993 }), NonCanonical);
  assert.throws(() => canonicalJson({ n: Number.NaN }), NonCanonical);
  assert.throws(() => canonicalJson({ n: Infinity }), NonCanonical);
  assert.throws(() => canonicalJson({ n: Number.MAX_SAFE_INTEGER + 2 }), NonCanonical);
});

test('money is sealed as its integer string, so it survives exactly', () => {
  const raw = '12345678901234567890';
  assert.equal(canonicalJson({ priceRaw: raw }), `{"priceRaw":"${raw}"}`);
});

test('the same claims in any order produce one hash', () => {
  const one = buildSealDocument({
    sealedAt: new Date('2026-10-14T18:00:00.000Z'),
    origin: 'https://pokter.xyz',
    claims: [claim({ tokenId: '9' }), claim({ tokenId: '100' }), claim({ chainId: 97, tokenId: '5' })],
  });
  const two = buildSealDocument({
    sealedAt: new Date('2026-10-14T18:00:00.000Z'),
    origin: 'https://pokter.xyz',
    claims: [claim({ chainId: 97, tokenId: '5' }), claim({ tokenId: '100' }), claim({ tokenId: '9' })],
  });
  assert.equal(sealOf(one).hash, sealOf(two).hash);
  // Token ids sort numerically: "9" belongs after "100", not before it.
  assert.deepEqual(one.claims.map((c) => `${c.chainId}:${c.tokenId}`), ['56:9', '56:100', '97:5']);
});

test('milliseconds are dropped so a regenerated document still matches', () => {
  const at = (iso: string) =>
    buildSealDocument({ sealedAt: new Date(iso), origin: 'https://pokter.xyz', claims: [claim()] });
  assert.equal(at('2026-10-14T18:00:00.123Z').sealedAt, '2026-10-14T18:00:00Z');
  assert.equal(sealOf(at('2026-10-14T18:00:00.123Z')).hash, sealOf(at('2026-10-14T18:00:00.999Z')).hash);
});

test('changing any sealed claim changes the hash', () => {
  const base = buildSealDocument({
    sealedAt: new Date('2026-10-14T18:00:00Z'),
    origin: 'https://pokter.xyz',
    claims: [claim()],
  });
  const raised = buildSealDocument({
    sealedAt: new Date('2026-10-14T18:00:00Z'),
    origin: 'https://pokter.xyz',
    claims: [claim({ verdict: 'proven' })],
  });
  assert.notEqual(sealOf(base).hash, sealOf(raised).hash);
  assert.ok(sealMatches(base, sealOf(base).hash));
  assert.ok(!sealMatches(base, sealOf(raised).hash));
});

test('a seal verifies case-insensitively, the way a reader pastes a hash', () => {
  const doc = buildSealDocument({
    sealedAt: new Date('2026-10-14T18:00:00Z'),
    origin: 'https://pokter.xyz',
    claims: [claim()],
  });
  assert.ok(sealMatches(doc, sealOf(doc).hash.toUpperCase().replace('0X', '0x')));
});

test('the diff names what a revision actually changed', () => {
  const at = (claims: SealedClaim[]) =>
    buildSealDocument({ sealedAt: new Date('2026-10-14T18:00:00Z'), origin: 'https://pokter.xyz', claims });
  const earlier = at([claim(), claim({ tokenId: '2' })]);
  const later = at([claim({ verdict: 'proven', attestations: 2 }), claim({ tokenId: '3' })]);
  const d = diffSeals(earlier, later);

  assert.deepEqual(
    d.changed.map((c) => `${c.key}:${c.field}`).sort(),
    ['56:372022:attestations', '56:372022:verdict'],
  );
  assert.deepEqual(d.added, ['56:3']);
  assert.deepEqual(d.removed, ['56:2']);
});

test('a known document has a stable hash', () => {
  // Pinned so a refactor of the serialiser cannot quietly invalidate every
  // seal already published and anchored on chain.
  const doc = buildSealDocument({
    sealedAt: new Date('2026-10-14T18:00:00Z'),
    origin: 'https://pokter.xyz',
    claims: [claim()],
  });
  assert.equal(
    sealOf(doc).text,
    '{"claims":[{"attestations":0,"category":"evidence","chainId":56,"observedDays":29,'
      + '"priceCurrency":"0xcE24439F2D9C6a2289F741120FE202248B666666","priceRaw":"10000000000000000",'
      + '"probes":{"answered":262,"total":262},"tokenId":"372022","verdict":"measured"}],'
      + '"origin":"https://pokter.xyz","sealedAt":"2026-10-14T18:00:00Z","version":1}',
  );
  assert.equal(sealHash(doc), sealOf(doc).hash);
});

test('the shipped verifier computes real keccak256', async () => {
  /*
   * The verifier carries its own keccak256 because Node ships SHA3-256,
   * which is a different digest, and because a reader checking whether
   * Pokter can be trusted should not have to trust an npm tarball first.
   * That makes this implementation load-bearing: if it drifts, every seal
   * Pokter ever published reads as forged to anyone running the script.
   *
   * 135/136/137 bytes straddle the 136-byte rate, where padding bugs live.
   */
  const { keccak256: viemKeccak, toHex } = await import('viem');
  const { SEAL_VERIFIER_SOURCE } = await import('../src/lib/seals/verifier');
  const { writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const impl = SEAL_VERIFIER_SOURCE.split('/* ---- the check ---- */')[0]
    .replace(/^#!.*\n/, '')
    .replace(/const DEFAULT_BASE_URL[\s\S]*?Exit code 1 means a seal failed\.\\`;/, '');
  const file = join(tmpdir(), `pokter-seal-keccak-${process.pid}.mjs`);
  writeFileSync(file, `${impl}\nexport { keccak256 as k };\n`);

  try {
    const { k } = (await import(file)) as { k: (b: Uint8Array) => string };
    for (const sample of ['', 'a', 'abc', 'y'.repeat(135), 'z'.repeat(136), 'w'.repeat(137), 'q'.repeat(5000)]) {
      assert.equal(
        k(new TextEncoder().encode(sample)).toLowerCase(),
        viemKeccak(toHex(sample)).toLowerCase(),
        `keccak256 diverged at ${sample.length} bytes`,
      );
    }
  } finally {
    rmSync(file, { force: true });
  }
});

test('a seal is published once a day, not once a sweep', async () => {
  const { sealAction, SEAL_INTERVAL_MS } = await import('../src/lib/seals/cadence');
  const now = new Date('2026-10-15T12:00:00Z');
  const anchored = (sealedAt: string) => ({ hash: '0xaa', sealedAt, anchored: true });

  assert.equal(sealAction(null, now).kind, 'create', 'the first run has nothing to skip');
  assert.equal(
    sealAction(anchored('2026-10-15T11:00:00Z'), now).kind,
    'skip',
    'the sweep runs far more often than daily and must not anchor every time',
  );
  assert.equal(sealAction(anchored('2026-10-14T11:59:59Z'), now).kind, 'create');

  const skipped = sealAction(anchored('2026-10-15T11:00:00Z'), now);
  assert.equal(
    skipped.kind === 'skip' ? skipped.nextDueAt : null,
    new Date(Date.parse('2026-10-15T11:00:00Z') + SEAL_INTERVAL_MS).toISOString(),
  );
});

test('a seal that never reached the chain is anchored, not replaced', () => {
  // Replacing it would strand the earlier document with no proof of its
  // time and re-date today's claims to the retry, so a run of failed
  // anchors would quietly erase a day from the record.
  const unanchored = { hash: '0xbb', sealedAt: '2026-10-15T11:00:00Z', anchored: false };
  assert.deepEqual(sealActionOf(unanchored), { kind: 'anchor', hash: '0xbb' });
});

test('an unreadable timestamp seals again rather than stopping forever', () => {
  assert.equal(sealActionOf({ hash: '0xcc', sealedAt: 'not a date', anchored: true }).kind, 'create');
});
