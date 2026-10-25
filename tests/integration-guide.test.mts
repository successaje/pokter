import assert from 'node:assert/strict';
import test from 'node:test';

import { getAddress, keccak256, toBytes, type LocalAccount } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { canonicalJson, criteriaInSignedTerms, negotiationContent, negotiationTermsBound, sanitizeForClaim, verifyNegotiationSignature } from '../src/lib/erc8183/negotiation';
import { decodePokterJobEnvelope } from '../src/lib/erc8183/job-envelope';
import { PROPOSAL_DELIVER_DAYS } from '../src/lib/erc8183/deadline';
import { bindingFor } from '../src/lib/proofrun/acceptance';
import { CANONICAL_RULES, CHECKLIST, SIGNING_SNIPPET, TIMING, readingAJob, workedExample } from '../src/lib/integration/guide';

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

/*
 * The criteria echo, run through the real binding rule.
 *
 * `success_criteria` appeared nowhere in the kit while sitting inside the
 * signed hash, so no third-party agent had ever been told to echo it and
 * every ProofRun artifact recorded `pokter-asserted`. Documenting it is
 * only worth anything if the documented shape is the one `bindingFor`
 * accepts, so this signs the kit's own example and asserts the binding it
 * promises — not that the text exists.
 */
test('the documented criteria echo really produces a signed-terms binding', async () => {
  const ex = workedExample(ESCROW);
  const echo = ex.criteriaEcho;

  // The published hash is of the published content.
  assert.equal(echo.negotiationHash, keccak256(toBytes(canonicalJson({ ...ex.content, terms: echo.signedTerms }))));

  const reply = {
    request: { task_description: ex.content.task },
    response: { accepted: true, terms: { price: ex.content.price, currency: ex.content.currency, ...echo.signedTerms } },
    negotiated_at: ex.content.negotiated_at,
    quote_expires_at: ex.content.quote_expires_at,
    chain_id: ex.content.chain_id,
    verifying_contract: ex.content.verifying_contract,
    negotiation_hash: echo.negotiationHash,
    provider_sig: await account.signMessage({ message: { raw: echo.negotiationHash } }),
  } as unknown as Record<string, unknown>;

  const termsBound = negotiationTermsBound(reply);
  assert.equal(termsBound, true, 'the hash must cover the echoed criteria');

  const specHash = `0x${'7d'.repeat(32)}`;
  const binding = bindingFor({
    specHash,
    termsBound,
    signedCriteria: (negotiationContent(reply)?.terms as { success_criteria?: string[] }).success_criteria,
    sentCriteria: echo.sent,
  });
  assert.equal(binding.kind, 'signed-terms', 'echoing the documented array must bind the agent to the criteria');

  // And the sent criteria are all inside what was signed.
  assert.equal(criteriaInSignedTerms(echo.sent, negotiationContent(reply)), true);
});

/*
 * The failure the documentation existed to prevent: an agent that does not
 * echo is not refused, it just loses the binding. If this ever starts
 * refusing, the kit's "omitting it is allowed" sentence is a lie.
 */
test('omitting the criteria refuses nothing and only costs the binding', async () => {
  const ex = workedExample(ESCROW);
  const reply = { ...ex.reply, provider_sig: await account.signMessage({ message: { raw: ex.negotiationHash } }) } as unknown as Record<string, unknown>;
  assert.equal(negotiationTermsBound(reply), true, 'a quote without criteria still verifies');
  assert.equal(
    bindingFor({ specHash: `0x${'7d'.repeat(32)}`, termsBound: true, signedCriteria: undefined, sentCriteria: ex.criteriaEcho.sent }).kind,
    'pokter-asserted',
  );
});

/*
 * `sanitizeForClaim` is applied to each element of success_criteria, and the
 * canonical rule used to name only task, deliverables and quality_standards.
 * A builder following the old rule hashed an unsanitised criterion and was
 * refused as terms-mismatch. Proven against the hash rather than the prose.
 */
test('a criterion carrying a bracket hashes only when sanitised, as the rules now say', () => {
  assert.ok(
    CANONICAL_RULES.some((rule) => /success_criteria/.test(rule) && /\[/.test(rule)),
    'a canonical rule must name success_criteria in the bracket substitution',
  );

  const base = workedExample(ESCROW).content;
  const raw = ['collateral: value within [1%]'];
  const sanitised = raw.map(sanitizeForClaim);
  assert.notDeepEqual(raw, sanitised, 'the fixture must actually exercise the substitution');

  const reply = {
    request: { task_description: base.task },
    response: { accepted: true, terms: { price: base.price, currency: base.currency, deliverables: (base.terms as Record<string, string>).deliverables, quality_standards: (base.terms as Record<string, string>).quality_standards, success_criteria: raw } },
    negotiated_at: base.negotiated_at,
    quote_expires_at: base.quote_expires_at,
    chain_id: base.chain_id,
    verifying_contract: base.verifying_contract,
    negotiation_hash: keccak256(toBytes(canonicalJson({ ...base, terms: { ...(base.terms as object), success_criteria: raw } }))),
  } as unknown as Record<string, unknown>;

  // Hashing the raw array is what the old rule produced, and Pokter refuses it.
  assert.equal(negotiationTermsBound(reply), false, 'an unsanitised criterion must not verify');

  reply.negotiation_hash = keccak256(toBytes(canonicalJson({ ...base, terms: { ...(base.terms as object), success_criteria: sanitised } })));
  assert.equal(negotiationTermsBound(reply), true, 'the sanitised array is what Pokter hashes');
});

/*
 * The 24-hour assumption. `deliverySecondsFor` allows 1–30 days, so a flat
 * "deliver within 24 hours" cost an agent any job funded from a longer
 * proposal — it stopped while the job was still payable.
 */
test('the timing rules send the agent to the job for its deadline, not to a fixed window', () => {
  assert.equal(TIMING.deadlineField, 'expiredAt');
  assert.equal(TIMING.proposalDeliverDays.max, PROPOSAL_DELIVER_DAYS.max);

  const rules = TIMING.rules.join('\n');
  assert.match(rules, /expiredAt/, 'the rules must name the field that carries the deadline');
  assert.match(rules, /disputeWindow\(\)/, 'and where the review window comes from');
  assert.match(rules, new RegExp(`${PROPOSAL_DELIVER_DAYS.min} to ${PROPOSAL_DELIVER_DAYS.max} days`));

  // No rule may state a flat deadline, which is the sentence that was wrong.
  for (const rule of TIMING.rules) {
    assert.doesNotMatch(rule, /deadline is 24 hours/, `a rule still asserts a fixed deadline: ${rule}`);
    assert.doesNotMatch(rule, /Deliver within 24 hours of funding/, `a rule still asserts a fixed window: ${rule}`);
  }
});

test('reading a funded job takes the deadline from the same response as the status', () => {
  const { steps } = readingAJob(ESCROW);
  const joined = steps.join('\n');
  assert.match(joined, /getJob\(job_id\)/);
  assert.match(joined, /expiredAt/, 'the deadline must be read from the job it already fetched');
  assert.doesNotMatch(joined, /submit within 24 hours/);

  const step = CHECKLIST[6];
  assert.match(step.step, /deadline/, 'the checklist step must send them to the deadline');
  assert.doesNotMatch(step.step, /within 24 hours/, 'the checklist must not restate the assumption');
});
