import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/*
 * A paid wallet that the sweep's wallet table has not seen is matched by
 * the price it signed, when that names exactly one agent on the job's
 * chain; and the sweep reads the wallets of the whole catalogue.
 */
const dir = mkdtempSync(join(tmpdir(), 'pokter-quest-'));
process.env.PROBE_DB_PATH = join(dir, 'probes.db');

const { getProbeStore } = (await import('../../src/lib/history/store')) as typeof import('../../src/lib/history/store');

const AGENT_WALLET = '0x00000000000000000000000000000000000000c7';
const SHARED = '0x0000000000000000000000000000000000000abc';
const quote = (chainId: number, tokenId: string, signer: string) => ({
  chainId, tokenId, priceRaw: '100000000000000000', priceU: 0.1, currency: '0xcE24439F2D9C6a2289F741120FE202248B666666', signer,
  quotedAt: '2026-10-13T00:00:00.000Z', expiresAt: null, domain: null,
});

test('the price store names the agents a wallet signed for, whatever case the wallet is written in', () => {
  const store = getProbeStore();
  store.recordQuotes([quote(56, '101', AGENT_WALLET), quote(56, '1', SHARED), quote(56, '2', SHARED), quote(97, '3', SHARED)]);
  assert.deepEqual(store.agentsBySigner(AGENT_WALLET.toLowerCase()), [{ chainId: 56, tokenId: '101' }]);
  assert.deepEqual(store.agentsBySigner(AGENT_WALLET.toUpperCase().replace('0X', '0x')), [{ chainId: 56, tokenId: '101' }]);
  assert.equal(store.agentsBySigner(SHARED).length, 3);
  assert.deepEqual(store.agentsBySigner('0x0000000000000000000000000000000000000def'), []);
});

test('lookup matches by signed price only when one agent on the job’s chain fits; the sweep reads the whole catalogue', () => {
  const lookup = readFileSync(new URL('../../src/lib/quest/lookup.ts', import.meta.url), 'utf8');
  assert.match(lookup, /store\.agentByWallet\(job\.provider\) \?\? agentBySignedPrice\(job\.chainId, job\.provider\)/);
  assert.match(lookup, /\.filter\(\(agent\) => agent\.chainId === chainId\);\n\s*return agents\.length === 1 \?/);
  assert.match(lookup, /marketplace: envelope \|\| ours \? POKTER_MARKETPLACE : marketplaceFromRecord\(job\.description\)/);
  const sweep = readFileSync(new URL('../../src/app/api/sweep/route.ts', import.meta.url), 'utf8');
  const step = sweep.slice(sweep.indexOf("budget.step('agentWallets'"), sweep.indexOf("budget.step('agentWallets'") + 900);
  assert.match(step, /listSearchableWithStatus\(\{ limit: 400 \}\)/, 'the catalogue Discover lists, unclassified included');
  assert.match(step, /\.\.\.listings\.map\(\(l\) => l\.agent\), \.\.\.catalogue/);
});
