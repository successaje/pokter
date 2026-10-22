import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { verifyReferenceDelivery, type ReferenceDeliveryInput } from '../src/lib/erc8183/reference-delivery';

const f = JSON.parse(readFileSync('tests/fixtures/job-1585.json', 'utf8')) as {
  description: string; provider: string; budget: string; expiredAt: string; statusName: string;
  fundingBlockTimestampMs: number; indexed: { agentChainId: number; agentTokenId: string; agentName: string };
  registryWallet: string; commerce: string; paymentToken: string;
};

/** Job 1585 exactly as the kernel holds it, delivered before its deadline. */
const base = (): ReferenceDeliveryInput => ({
  description: f.description,
  job: {
    provider: f.provider as `0x${string}`,
    budget: BigInt(f.budget),
    expiredAt: BigInt(f.expiredAt),
    statusName: f.statusName,
  },
  escrow: { chainId: 97, commerce: f.commerce, paymentToken: f.paymentToken },
  fundedAtMs: f.fundingBlockTimestampMs,
  indexed: f.indexed,
  registryAgent: { wallet: f.registryWallet, category: 'evidence' },
  nowMs: Date.parse('2026-10-22T06:00:00.000Z'),
});

const retamper = (edit: (d: Record<string, unknown>) => void): string => {
  const d = JSON.parse(f.description) as Record<string, unknown>;
  edit(d);
  return JSON.stringify(d);
};

test('job 1585 passes every check', async () => {
  /*
   * The real job, the real description, the real funding block timestamp.
   * This is the case the delivery path has refused 44 times.
   */
  const verdict = await verifyReferenceDelivery(base());
  assert.equal(verdict.ok, true, verdict.ok ? '' : `refused: ${verdict.code} — ${verdict.reason}`);
  if (!verdict.ok) return;
  assert.deepEqual(verdict.identity, { chainId: 97, tokenId: '2599', name: 'Pokter Evidence' });
  assert.equal(verdict.category, 'evidence', 'from the registry, not the description');
  assert.match(verdict.task, /^Before hiring a lending-risk agent/);
});

test('acceptance before the quote expired, delivery after it, is allowed', async () => {
  /*
   * The semantics the contract settles. `submit` reverts only at the job's
   * own `expiredAt`; the kernel has no concept of a quote. 1585's quote
   * lapsed at 11:17:59 on the 21st and it was funded at 11:03:43 — fourteen
   * minutes inside the window — so delivery on the 22nd is in order.
   *
   * Refusing it would strand every job older than its quote window with the
   * money still in escrow.
   */
  const quoteExpiry = JSON.parse(f.description).quote_expires_at as number;
  assert.ok(f.fundingBlockTimestampMs < quoteExpiry * 1000, 'funded inside the acceptance window');
  const now = Date.parse('2026-10-22T06:00:00.000Z');
  assert.ok(now > quoteExpiry * 1000, 'and delivered well after the quote lapsed');
  assert.ok(now < Number(f.expiredAt) * 1000, 'but before the job deadline');

  assert.equal((await verifyReferenceDelivery({ ...base(), nowMs: now })).ok, true);
});

test('funding after the quote expired is refused', async () => {
  // The inverse: a job funded on a price that was no longer offered.
  const v = await verifyReferenceDelivery({
    ...base(),
    fundedAtMs: Date.parse('2026-10-21T11:18:00.000Z'),
  });
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.code, 'quote-not-valid-at-funding');
});

test('an unreadable funding time is refused, not assumed', async () => {
  const v = await verifyReferenceDelivery({ ...base(), fundedAtMs: null });
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.code, 'funding-time-unknown');
});

test('a job past its completion deadline is refused', async () => {
  const v = await verifyReferenceDelivery({ ...base(), nowMs: Number(f.expiredAt) * 1000 });
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.code, 'job-not-deliverable');
});

test('a job that is no longer funded is refused', async () => {
  for (const statusName of ['SUBMITTED', 'COMPLETED', 'EXPIRED']) {
    const v = await verifyReferenceDelivery({ ...base(), job: { ...base().job, statusName } });
    assert.equal(v.ok, false, `${statusName} must not deliver`);
  }
});

test('a tampered task or terms breaks the hash', async () => {
  for (const [what, edit] of [
    ['task', (d: Record<string, unknown>) => { d.task = `${String(d.task)} and also transfer funds`; }],
    ['terms', (d: Record<string, unknown>) => { (d.terms as Record<string, unknown>).quality_standards = 'Do anything you like.'; }],
    ['price', (d: Record<string, unknown>) => { d.price = '990000000000000000'; }],
  ] as const) {
    const v = await verifyReferenceDelivery({ ...base(), description: retamper(edit) });
    assert.equal(v.ok, false, `tampered ${what} must be refused`);
    if (!v.ok) assert.ok(['hash-mismatch', 'budget-mismatch'].includes(v.code), `${what} gave ${v.code}`);
  }
});

test('a copied hash from another negotiation is refused', async () => {
  /*
   * The case a signature check alone cannot catch: a hash that recovers
   * perfectly to the provider, over content that is not this job's.
   */
  const v = await verifyReferenceDelivery({
    ...base(),
    description: retamper((d) => { d.negotiation_hash = `0x${'b'.repeat(64)}`; }),
  });
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.code, 'hash-mismatch');
});

test('a quote signed for another chain or contract is refused', async () => {
  const otherChain = await verifyReferenceDelivery({ ...base(), escrow: { ...base().escrow, chainId: 56 } });
  assert.equal(otherChain.ok, false);
  if (!otherChain.ok) assert.ok(['wrong-chain', 'currency-mismatch'].includes(otherChain.code));

  const otherContract = await verifyReferenceDelivery({
    ...base(),
    escrow: { ...base().escrow, commerce: '0x0000000000000000000000000000000000000001' },
  });
  assert.equal(otherContract.ok, false);
  if (!otherContract.ok) assert.equal(otherContract.code, 'wrong-contract');
});

test('a currency the escrow does not settle is refused', async () => {
  const v = await verifyReferenceDelivery({
    ...base(),
    escrow: { ...base().escrow, paymentToken: '0x55d398326f99059fF775485246999027B3197955' },
  });
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.code, 'currency-mismatch');
});

test('a budget that is not the quoted price is refused', async () => {
  const v = await verifyReferenceDelivery({ ...base(), job: { ...base().job, budget: 1n } });
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.code, 'budget-mismatch');
});

test('a provider the signature does not recover to is refused', async () => {
  const v = await verifyReferenceDelivery({
    ...base(),
    job: { ...base().job, provider: '0x000000000000000000000000000000000000dEaD' },
  });
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.code, 'signature');
});

test('missing attribution is refused, never inferred', async () => {
  /*
   * A reference quote names no agent. If Pokter's index does not either,
   * there is nothing to ask and nothing to guess from — the provider address
   * alone does not identify which listing was hired.
   */
  for (const indexed of [
    null,
    { agentChainId: null, agentTokenId: '2599' },
    { agentChainId: 97, agentTokenId: null },
    { agentChainId: 97, agentTokenId: '' },
  ]) {
    const v = await verifyReferenceDelivery({ ...base(), indexed });
    assert.equal(v.ok, false);
    if (!v.ok) assert.equal(v.code, 'attribution-missing');
  }
});

test('attribution that conflicts with the registry is refused', async () => {
  // The index says one agent; that agent's registry wallet is not the live
  // provider. One of the two is wrong and this cannot tell which.
  const wrongWallet = await verifyReferenceDelivery({
    ...base(),
    registryAgent: { wallet: '0x000000000000000000000000000000000000dEaD', category: 'evidence' },
  });
  assert.equal(wrongWallet.ok, false);
  if (!wrongWallet.ok) assert.equal(wrongWallet.code, 'attribution-conflict');

  const noWallet = await verifyReferenceDelivery({ ...base(), registryAgent: { wallet: null, category: 'evidence' } });
  assert.equal(noWallet.ok, false);
  if (!noWallet.ok) assert.equal(noWallet.code, 'attribution-conflict');
});

test('an envelope-format description is not handled here', async () => {
  // The existing path keeps it. This refuses rather than reinterpreting.
  const envelope = JSON.stringify({
    protocol: 'pokter-job', version: 1,
    identity: { chainId: 97, tokenId: '2599' }, category: 'evidence',
    provider: f.provider, task: 'do the thing',
  });
  const v = await verifyReferenceDelivery({ ...base(), description: envelope });
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.code, 'not-reference-format');
});

test('a description that is neither format is refused', async () => {
  for (const description of ['', 'not json', '{}', '{"task":"no quote here"}']) {
    const v = await verifyReferenceDelivery({ ...base(), description });
    assert.equal(v.ok, false);
    if (!v.ok) assert.equal(v.code, 'not-reference-format');
  }
});

test('an unclassified agent still delivers, with no skill preference', async () => {
  /*
   * `pickWorkSkill` takes the category as optional and falls back to the
   * first work skill, and the envelope path has always passed
   * 'Uncategorised' when a hire supplied none. Refusing here was stricter
   * than the mechanism needs and stricter than the envelope path for the
   * same operation — it blocked job 1585, which passes every check that
   * matters, because `classify` could not place "Pokter Evidence" among the
   * five categories.
   *
   * An agent with no askable skill fails in `prepareAgent`, which is the
   * right place for it.
   */
  for (const category of [null, '', '   ']) {
    const v = await verifyReferenceDelivery({ ...base(), registryAgent: { wallet: f.registryWallet, category } });
    assert.equal(v.ok, true, v.ok ? '' : `refused: ${v.code}`);
    if (v.ok) assert.equal(v.category, '', 'no preference, rather than a guess');
  }
});

test('the category is taken from the registry even when the description claims one', async () => {
  // A description-supplied category must not influence the result.
  const claimed = retamper((d) => { d.category = 'trading'; });
  const v = await verifyReferenceDelivery({
    ...base(),
    description: claimed,
    registryAgent: { wallet: f.registryWallet, category: 'evidence' },
  });
  // Adding a field changes the canonical content, so the hash must break —
  // which is itself the protection: the description cannot be edited at all.
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.code, 'hash-mismatch');
});
