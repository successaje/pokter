import assert from 'node:assert/strict';
import test from 'node:test';

import { getAddress, keccak256, toBytes, type LocalAccount } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { canonicalJson, negotiationTermsBound, verifyNegotiationSignature } from '../src/lib/erc8183/negotiation';
import { decodePokterJobEnvelope } from '../src/lib/erc8183/job-envelope';
import { CHECKLIST, SIGNING_SNIPPET, readingAJob, workedExample } from '../src/lib/integration/guide';

const ESCROW = { chainId: 56, commerce: '0xEa4DAa3100A767e86FDed867729ae7446476EBA6', paymentToken: '0xcE24439F2D9C6a2289F741120FE202248B666666' };
// A throwaway key: never funded, used only to prove the published code signs what Pokter verifies.
const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');

/*
 * The published snippet, statement for statement. If the page's code and
 * this drift apart, the snippet test below fails on the text.
 */
const sortKeys = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]))
    : v;
const snippetCanonical = (v: unknown) =>
  JSON.stringify(sortKeys(v)).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const clean = (s: string) => [...s.replaceAll('[', '(').replaceAll(']', ')')].filter((c) => c >= ' ' || c === '\t' || c === '\n').join('');

async function quote(signer: LocalAccount, input: { task: string; deliverables: string; quality_standards: string; priceWei: bigint; currency: string; chainId: number; commerce: string }) {
  const negotiated_at = Math.floor(Date.now() / 1000);
  const quote_expires_at = negotiated_at + 15 * 60;
  const terms = { deliverables: clean(input.deliverables), quality_standards: clean(input.quality_standards) };
  const price = input.priceWei.toString();
  const verifying_contract = getAddress(input.commerce);
  const content = { version: 1, negotiated_at, task: clean(input.task), terms, price, currency: input.currency, quote_expires_at, chain_id: input.chainId, verifying_contract };
  const negotiation_hash = keccak256(toBytes(snippetCanonical(content)));
  const provider_sig = await signer.signMessage({ message: { raw: negotiation_hash } });
  return {
    request: { task_description: input.task },
    response: { accepted: true, terms: { price, currency: input.currency, ...terms } },
    negotiated_at, quote_expires_at, chain_id: input.chainId, verifying_contract, negotiation_hash, provider_sig,
  };
}

test('a quote made by the published snippet passes Pokter’s own verifier', async () => {
  // Brackets, a non-ASCII character and a control character: the cases the canonical rules exist for.
  const task = 'Check [CAKE] 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82 — is it safe?\u0007';
  const signed = await quote(account, { task, deliverables: 'A JSON verdict', quality_standards: 'Read-only', priceWei: 50_000_000_000_000_000n, currency: ESCROW.paymentToken, chainId: 56, commerce: ESCROW.commerce });
  assert.equal(negotiationTermsBound(signed as unknown as Record<string, unknown>, task), true, 'the hash covers the terms');
  assert.equal(await verifyNegotiationSignature({ negotiationHash: signed.negotiation_hash, providerSignature: signed.provider_sig, expectedProvider: account.address }), account.address);
});

test('the snippet’s canonical JSON is Pokter’s', () => {
  const value = { b: [{ z: 1, a: 'é' }], a: 'x' };
  assert.equal(snippetCanonical(value), canonicalJson(value));
});

test('the page shows the code this test runs', () => {
  for (const line of ['Object.keys(v).sort()', "replaceAll('[', '(')", 'signMessage({ message: { raw: negotiation_hash } })', 'quote_expires_at = negotiated_at + 15 * 60', 'getAddress(input.commerce)']) {
    assert.ok(SIGNING_SNIPPET.includes(line), `snippet should contain: ${line}`);
  }
});

test('the worked example’s hash is of its own content, and its reply carries it', () => {
  const ex = workedExample(ESCROW);
  assert.equal(ex.negotiationHash, keccak256(toBytes(canonicalJson(ex.content))));
  assert.equal(ex.reply.negotiation_hash, ex.negotiationHash);
  // With the placeholder signature swapped for a real one, the reply verifies.
  assert.equal(negotiationTermsBound(ex.reply as unknown as Record<string, unknown>), true);
});

test('the example job envelope is one Pokter decodes, with the brief and quote in place', () => {
  const { envelope } = readingAJob(ESCROW);
  const decoded = decodePokterJobEnvelope(JSON.stringify(JSON.parse(envelope)));
  assert.ok(decoded);
  assert.match(decoded.task, /^Check the BNB Chain token 0x0E09/);
  assert.equal(decoded.quote?.priceRaw, '50000000000000000');
});

test('every checklist step points at a section the kit page has', () => {
  const sections = new Set(['identity', 'transports', 'skills', 'worked-example', 'reading-a-job', 'delivery']);
  for (const step of CHECKLIST) assert.ok(sections.has(step.anchor), step.anchor);
});
