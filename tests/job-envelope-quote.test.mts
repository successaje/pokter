import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decodePokterJobEnvelope,
  encodePokterJobEnvelope,
  POKTER_JOB_ENVELOPE_VERSION,
} from '../src/lib/erc8183/job-envelope';
import { quoteUsableForEscrow } from '../src/lib/erc8183/negotiation';

const HASH = `0x${'1'.repeat(64)}`;
const SIG = `0x${'2'.repeat(130)}`;
const PROVIDER = '0x20f1ca5d1e5a3ee94c29dbf95e6bf6cea6a8d64b';
const COMMERCE = '0xEa4DAa3100A767e86FDed867729ae7446476EBA6';

const base = {
  identityChainId: 56,
  agentTokenId: '265375',
  agentName: 'BNB LP Range Rebalancer',
  category: 'rebalancing',
  provider: PROVIDER as `0x${string}`,
  task: 'Report how far the position has drifted. Read-only.',
};

/*
 * The case this exists for: sellers that answer `negotiate` with a signed
 * quote refuse `notify_funded` for a job that does not carry it back. Pokter
 * negotiated these and dropped them before funding, so the seller saw a job
 * priced by nobody it had agreed with.
 */
test('a signed quote survives the round trip', () => {
  const encoded = encodePokterJobEnvelope({
    ...base,
    quote: { negotiationHash: HASH, providerSignature: SIG, priceRaw: '100000000000000000', expiresAt: 1791131243 },
  });
  const quote = decodePokterJobEnvelope(encoded)?.quote;
  assert.equal(quote?.negotiationHash, HASH);
  assert.equal(quote?.providerSignature, SIG);
  assert.equal(quote?.priceRaw, '100000000000000000');
  assert.equal(quote?.expiresAt, 1791131243);
});

test('the signing domain is kept, because a quote is bound to one', () => {
  const encoded = encodePokterJobEnvelope({
    ...base,
    quote: {
      negotiationHash: HASH,
      providerSignature: SIG,
      domain: { chainId: 56, verifyingContract: COMMERCE as `0x${string}` },
    },
  });
  const domain = decodePokterJobEnvelope(encoded)?.quote?.domain;
  assert.equal(domain?.chainId, 56);
  assert.equal(domain?.verifyingContract, COMMERCE);
});

/*
 * The version is deliberately not bumped. Production rejects any envelope
 * whose version is not 1, so raising it would make every new job read as
 * "not commissioned through Pokter" to the deployed recovery endpoint.
 */
test('an envelope with a quote is still version 1', () => {
  const decoded = decodePokterJobEnvelope(
    encodePokterJobEnvelope({ ...base, quote: { negotiationHash: HASH, providerSignature: SIG } }),
  );
  assert.equal(decoded?.version, POKTER_JOB_ENVELOPE_VERSION);
  assert.equal(POKTER_JOB_ENVELOPE_VERSION, 1);
});

test('envelopes written before quotes existed still decode', () => {
  const legacy = JSON.stringify({
    protocol: 'pokter-job',
    version: 1,
    identity: { chainId: 56, tokenId: '265375' },
    category: 'rebalancing',
    provider: PROVIDER,
    task: 'An older job, funded before quotes were carried.',
  });
  const decoded = decodePokterJobEnvelope(legacy);
  assert.equal(decoded?.identity.tokenId, '265375');
  assert.equal(decoded?.quote, undefined);
});

test('encoding refuses a malformed quote, because that is the caller’s bug', () => {
  for (const quote of [
    { negotiationHash: '0xdeadbeef', providerSignature: SIG },
    { negotiationHash: HASH, providerSignature: '0x1234' },
    { negotiationHash: HASH, providerSignature: HASH },
  ]) {
    assert.throws(() => encodePokterJobEnvelope({ ...base, quote }));
  }
});

/*
 * Decoding reads what is already immutable on chain, so it cannot refuse.
 * A job whose quote is unreadable is still a job, and still belongs to an
 * agent — losing the whole record over a bad signature would lose that too.
 */
test('decoding drops an unreadable quote but keeps the job', () => {
  const written = JSON.stringify({
    protocol: 'pokter-job',
    version: 1,
    identity: { chainId: 56, tokenId: '265375' },
    category: 'rebalancing',
    provider: PROVIDER,
    task: 'A job whose quote did not survive.',
    quote: { negotiationHash: 'not-a-hash', providerSignature: SIG },
  });
  const decoded = decodePokterJobEnvelope(written);
  assert.equal(decoded?.identity.tokenId, '265375');
  assert.equal(decoded?.quote, undefined);
});

test('a quote does not push the envelope past the on-chain size limit', () => {
  const encoded = encodePokterJobEnvelope({
    ...base,
    task: 'x'.repeat(3000),
    quote: {
      negotiationHash: HASH,
      providerSignature: SIG,
      priceRaw: '100000000000000000',
      expiresAt: 1791131243,
      domain: { chainId: 56, verifyingContract: COMMERCE as `0x${string}` },
    },
  });
  assert.ok(new TextEncoder().encode(encoded).byteLength <= 4096);
  assert.ok(decodePokterJobEnvelope(encoded)?.quote);
});

/*
 * Read off the wire from BNB LP Range Rebalancer on 4 Oct 2026: it quotes
 * against chain 56 and the mainnet ERC-8183 commerce contract, while Pokter's
 * escrow is chain 97. Six of its seven jobs never delivered.
 */
test('a mainnet-domain quote is refused for a testnet escrow, with the reason', () => {
  const verdict = quoteUsableForEscrow(
    { domain: { chainId: 56, verifyingContract: COMMERCE as `0x${string}` } },
    97,
  );
  assert.equal(verdict.usable, false);
  assert.match(verdict.usable === false ? verdict.reason : '', /chain 56.*chain 97/s);
});

test('a quote signed for the escrow chain is usable', () => {
  const verdict = quoteUsableForEscrow(
    { domain: { chainId: 97, verifyingContract: COMMERCE as `0x${string}` }, expiresAt: 4_000_000_000 },
    97,
  );
  assert.equal(verdict.usable, true);
});

test('an expired quote is refused even on the right chain', () => {
  const verdict = quoteUsableForEscrow(
    { domain: { chainId: 97, verifyingContract: COMMERCE as `0x${string}` }, expiresAt: 1_000 },
    97,
    new Date(2_000_000),
  );
  assert.equal(verdict.usable, false);
  assert.match(verdict.usable === false ? verdict.reason : '', /expired/i);
});

/* The observed validity window was 900 seconds; a quote is not a price list. */
test('a quote still inside its window is usable', () => {
  const now = new Date(1_791_130_343_000);
  const verdict = quoteUsableForEscrow({ expiresAt: 1_791_131_243 }, 97, now);
  assert.equal(verdict.usable, true);
});
