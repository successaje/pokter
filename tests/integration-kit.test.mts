import assert from 'node:assert/strict';
import test from 'node:test';

import { QUOTE_FAILURE_CODES } from '../src/lib/hire/failure';
import { buildIntegrationKit } from '../src/lib/integration/kit';

const ESCROW = { chainId: 56, network: 'BNB Chain', commerce: '0xEa4DAa3100A767e86FDed867729ae7446476EBA6', router: '0x51895229E12F9876011789B04f8698af06cCD6DA', policy: '0x9C01845705b3078Aa2e8cfF7520a6376FD766dE5', paymentToken: '0xcE24439F2D9C6a2289F741120FE202248B666666' };
const integrationKit = (origin: string) => buildIntegrationKit(origin, [ESCROW]);

test('the kit lists every refusal code Pokter can return, with its layer and status', () => {
  const kit = integrationKit('https://pokter.xyz');
  assert.deepEqual(kit.refusals.map((r) => r.code), [...QUOTE_FAILURE_CODES]);
  for (const r of kit.refusals) {
    assert.ok(r.status >= 400 && r.status < 600, r.code);
    assert.doesNotMatch(r.meaning, /undefined/, r.code);
  }
});

test('the kit names an escrow with all its contracts, and the required skills', () => {
  const kit = integrationKit('https://pokter.xyz');
  assert.ok(kit.escrows.length > 0);
  for (const e of kit.escrows) for (const k of ['commerce', 'router', 'policy', 'paymentToken'] as const) assert.match(e[k], /^0x[0-9a-fA-F]{40}$/);
  assert.deepEqual(kit.skills.filter((s) => s.required).map((s) => s.id), ['negotiate', 'notify_funded']);
  assert.ok(kit.preflight.every((p) => p.url.includes('https://pokter.xyz')));
});

/*
 * The kit used to tell builders "the escrow will not let it hire itself".
 * It does: `production-proof.ts` counts self-hires that reached COMPLETED
 * and states that such a job "settles like any other". Nothing blocks it,
 * so the claim was false in the costly direction — it asserted a guard
 * that does not exist, and implied without saying that testing a hire
 * needs a second wallet.
 */
test('the kit does not claim the escrow blocks a self-hire', () => {
  const identity = integrationKit('https://pokter.xyz').identity.join('\n');
  /* Both directions. The escrow does settle such a job — testnet 1444
     reached COMPLETED — and Pokter's hire page still refuses to offer it. */
  assert.doesNotMatch(identity, /will not let it hire itself/);
  assert.doesNotMatch(identity, /Nothing stops an agent being hired by its own wallet/);
  assert.match(identity, /hire page refuses it/i);
  // And it names the wallet a builder needs to test a hire from.
  assert.match(identity, /second, separate wallet to hire from/);
  assert.match(identity, /excludes a hire whose buyer is its seller/);
});

/*
 * Categories come from `CATEGORIES`, not a second hand-kept list. Every
 * copy of this list had drifted to four while the form offered five plus
 * "none of these fits".
 */
test('the kit publishes every category the listing form offers', async () => {
  const { CATEGORIES, NO_CATEGORY } = await import('../src/lib/agents/categories');
  const kit = integrationKit('https://pokter.xyz');
  assert.deepEqual(
    kit.categories.map((c) => c.id),
    [...CATEGORIES.map((c) => c.id as string), NO_CATEGORY],
  );
  for (const category of kit.categories) assert.ok(category.blurb.length > 20, category.id);
});

/*
 * `success_criteria` is inside the signed hash. It appeared nowhere in the
 * kit, which is why no agent had ever been told to echo it and every
 * ProofRun artifact recorded `pokter-asserted`.
 */
test('the kit documents success_criteria wherever a builder reads the terms', () => {
  const kit = integrationKit('https://pokter.xyz');

  const negotiate = kit.skills.find((s) => s.id === 'negotiate');
  assert.ok(negotiate);
  /*
   * Inside the `terms` shape, not merely somewhere in the sentence: the
   * field's whole point is that it travels in terms and is therefore
   * hashed, and a prose mention after a shape that omits it tells a
   * builder the wrong thing about what to send.
   */
  assert.match(negotiate!.input, /terms: \{[^}]*success_criteria/, 'the terms shape must carry it');
  assert.match(negotiate!.input, /echo it back/, 'and say what echoing it does');

  const field = kit.quote.fields.find((f) => f.field.includes('success_criteria'));
  assert.ok(field, 'the quote fields must document it');
  assert.match(field!.rule, /echo the array back unchanged/);
  assert.match(field!.rule, /Omitting it is allowed/);

  assert.match(kit.quote.hash, /success_criteria/, 'the hash recipe must show it inside terms');
});
