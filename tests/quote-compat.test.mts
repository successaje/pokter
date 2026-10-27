import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { a2aUserMessage } from '../src/lib/a2a/message';
import { readA2AReply } from '../src/lib/a2a/reply';
import { quoteRefusal, responseData } from '../src/lib/erc8183/quote-reply';

/*
 * Replies sellers actually send to a quote request, read as what they say.
 * The envelopes follow BNB's agent SDK (`NegotiationResult.toDict`): the
 * seller's answer is under `response`, with `accepted`, `terms`, and on a
 * refusal `reason` and `reason_code`. None of this loosens a check: a quote
 * found in any part still has to recover to the registered wallet and bind
 * its terms before Pokter keeps it.
 */

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const message = (parts: unknown[]) => ({ jsonrpc: '2.0', id: '1', result: { kind: 'message', role: 'agent', messageId: 'm', parts } });
const task = (state: string, statusParts: unknown[] = [], artifacts: unknown[] = []) => ({
  jsonrpc: '2.0',
  id: '1',
  result: { kind: 'task', id: 't1', status: { state, message: { kind: 'message', role: 'agent', messageId: 's', parts: statusParts } }, artifacts },
});
const data = (value: Record<string, unknown>) => ({ kind: 'data', data: value });

const refusal = { request: { task_description: 'check a token' }, request_hash: '0x01', response: { accepted: false, reason: 'I need the token contract address to check it.', reason_code: 'missing_token_address' }, response_hash: '0x02' };
const accepted = {
  request: { task_description: 'check a token' },
  request_hash: '0x01',
  response: { accepted: true, terms: { price: '50000000000000000', currency: '0x55d398326f99059fF775485246999027B3197955' }, quote_expires_at: 1793000000 },
  response_hash: '0x02',
  negotiation_hash: `0x${'ab'.repeat(32)}`,
  provider_sig: `0x${'cd'.repeat(65)}`,
};

test('a request carries the message-level kind the A2A schema requires, from every sender', () => {
  const built = a2aUserMessage([data({ skill: 'negotiate' })], 'id-1');
  assert.deepEqual(built, { kind: 'message', role: 'user', messageId: 'id-1', parts: [data({ skill: 'negotiate' })] });
  for (const path of ['lib/erc8183/quote.ts', 'lib/erc8183/courier.ts', 'lib/erc8183/seller-notice.ts', 'app/api/hire/preview/route.ts', 'app/api/builders/trial/route.ts']) {
    const source = code(path);
    assert.match(source, /message: a2aUserMessage\(/, path);
    assert.doesNotMatch(source, /message: \{\s*role: 'user'/, `${path} builds no message by hand`);
  }
  assert.match(code('lib/integration/guide.ts'), /kind: 'message',\s*role: 'user',/, 'and the documented call shows it');
});

test('a refusal inside the SDK envelope is read, with its words, and counts as a stated refusal', () => {
  const payload = message([data(refusal)]);
  const found = responseData(payload);
  assert.equal(found, refusal);
  assert.deepEqual(quoteRefusal(payload, found), { declined: true, stated: 'I need the token contract address to check it.' });
  /* A code without words is still the seller's own statement. */
  const coded = { ...refusal, response: { accepted: false, reason_code: 'unsupported_chain' } };
  assert.deepEqual(quoteRefusal(message([data(coded)]), coded), { declined: true, stated: 'unsupported_chain' });
  /* The older outer shape still reads the same. */
  const outer = { accepted: false, reason: 'Out of scope.' };
  assert.deepEqual(quoteRefusal(message([data(outer)]), outer), { declined: true, stated: 'Out of scope.' });
});

test('the signed quote is found in whichever part carries it', () => {
  const payload = message([data({ summary: 'Here is my quote.' }), { kind: 'text', text: 'Quote attached.' }, data(accepted)]);
  assert.equal(readA2AReply(payload).data?.summary, 'Here is my quote.', 'the first part is still the first');
  assert.equal(responseData(payload), accepted, 'but the quote is the part with the negotiation hash');
  assert.deepEqual(quoteRefusal(payload, accepted), { declined: false, stated: null });
  /* In a completed task, from its artifacts. */
  const done = task('completed', [], [{ artifactId: 'a', parts: [data({ note: 'n' }), data(accepted)] }]);
  assert.equal(responseData(done), accepted);
});

test('an input-required task says what it needs, which is read as declining the question as asked', () => {
  const asked = task('input-required', [{ kind: 'text', text: 'Which token? Send its contract address.' }]);
  assert.equal(responseData(asked), null);
  assert.deepEqual(quoteRefusal(asked, null), { declined: true, stated: 'Which token? Send its contract address.' });
  /* With the SDK envelope in its status message, the envelope's own words. */
  const enveloped = task('input-required', [data(refusal)]);
  assert.equal(readA2AReply(enveloped).statusData[0], refusal);
  assert.equal(responseData(enveloped), refusal);
  assert.equal(quoteRefusal(enveloped, refusal).stated, 'I need the token contract address to check it.');
});

test('a task still working is not a refusal, and a rejected one is, with or without words', () => {
  const working = task('working', [{ kind: 'text', text: 'Pricing…' }]);
  assert.equal(responseData(working), null);
  assert.deepEqual(quoteRefusal(working, null), { declined: false, stated: null });
  assert.deepEqual(quoteRefusal(task('rejected'), null), { declined: true, stated: null });
  assert.deepEqual(quoteRefusal(task('rejected', [{ kind: 'text', text: 'Not for testnet.' }]), null), { declined: true, stated: 'Not for testnet.' });
});

test('the quote flow uses these readers, and still checks the signature before keeping a price', () => {
  const quote = code('lib/erc8183/quote.ts');
  assert.match(quote, /const data = responseData\(payload\);/);
  assert.match(quote, /const \{ declined, stated \} = quoteRefusal\(payload, data\);/);
  assert.match(quote, /if \(stated\) onRefused\?\.\(stated\);/, 'a stated refusal still reaches the sweep’s concrete-brief retry');
  assert.ok(quote.indexOf('verifyNegotiationSignature({') > quote.indexOf('quoteRefusal(payload, data)'));
  assert.match(quote, /if \(!negotiationTermsBound\(data, enquiry\.task_description\)\) return fail\(quoteFailure\('terms-mismatch'\)\);/);
});

test('preflight passes exactly the skills the requester asks, and names one that is misnamed', async () => {
  const { isNegotiationSkill, negotiationSkillOf, priceLikeSkill } = await import('../src/lib/erc8183/courier-parse');
  for (const id of ['negotiate', 'negotiate-token-safety', 'negotiate_v2']) assert.equal(isNegotiationSkill(id), true, id);
  for (const id of ['get_quote', 'price', 'quote', 'renegotiate', 'Negotiator']) assert.equal(isNegotiationSkill(id), false, id);
  assert.equal(negotiationSkillOf([{ id: 'get_quote' }, { id: 'negotiate-x' }, { id: 'negotiate' }]), 'negotiate', 'the plain id first, as before');
  assert.equal(priceLikeSkill(['check_token', 'get_quote']), 'get_quote');
  assert.equal(priceLikeSkill(['get_quote', 'negotiate']), null, 'nothing to warn about when negotiate is there');
  assert.match(code('app/api/builders/preflight/route.ts'), /const quoteCapability = capabilities\.some\(isNegotiationSkill\);/);
  const { builderChecklist } = await import('../src/lib/builder/checklist');
  const stages = builderChecklist({ identity: { done: true, missing: [] }, endpoint: { checked: true, ok: true, detail: null, status: 200 }, capabilities: ['check_token', 'get_quote'], quoteCapability: false, priceLikeSkill: 'get_quote', trial: { ran: false, ok: false, summary: null, error: null } });
  const price = stages.find((s) => s.id === 'price')!;
  assert.equal(price.status, 'failed');
  assert.match(price.detail, /It declares “get_quote”, but Pokter asks for a price only through a skill with the id negotiate/);
});

test('a missing endpoint or wallet is read from the registration itself, and only a missing one', async () => {
  const { registeredServiceEndpoint, x402EndpointFromRegistration } = await import('../src/lib/x402/endpoint');
  const file = { services: [{ name: 'A2A', endpoint: 'https://agent.example/.well-known/agent-card.json' }, { name: 'x402', endpoint: 'https://agent.example/pay' }, { name: 'web', endpoint: 'http://insecure.example' }] };
  assert.equal(registeredServiceEndpoint(file, 'a2a'), 'https://agent.example/.well-known/agent-card.json');
  assert.equal(x402EndpointFromRegistration(file), 'https://agent.example/pay');
  assert.equal(registeredServiceEndpoint({ endpoints: [{ name: 'a2a', endpoint: 'https://old.example/card' }] }, 'a2a'), 'https://old.example/card', 'the older field name');
  assert.equal(registeredServiceEndpoint({ services: [{ name: 'A2A', endpoint: 'https://user:pw@x.example/' }] }, 'a2a'), null, 'never one carrying credentials');
  const quote = code('lib/erc8183/quote.ts');
  assert.match(quote, /if \(!endpoint \|\| !agentWallet\) \{\s*const live = await liveAgentFields\(agent\.chain_id, agent\.token_id\);\s*endpoint \?\?= live\.a2aEndpoint/);
  assert.match(quote, /agentWallet \?\?= live\.agentWallet;/, 'filled only when the index has none, so the quote and the job it funds name one wallet');
  assert.match(quote, /expectedProvider: agentWallet,/);
  const live = code('lib/registry/live-agent.ts');
  assert.match(live, /functionName: 'getAgentWallet'/, 'the registry’s own agent wallet');
  assert.doesNotMatch(live, /ownerOf|owner_address/, 'never the NFT owner');
});

test('a smart-account agent wallet can sign a quote through ERC-1271, and only for itself', async () => {
  const { privateKeyToAccount, generatePrivateKey } = await import('viem/accounts');
  const { hashMessage } = await import('viem');
  const { verifyNegotiationSignature, PROVIDER_SIGNATURE } = await import('../src/lib/erc8183/negotiation');
  const hash = `0x${'ab'.repeat(32)}` as const;
  /* A key-signed quote is checked as before, with no chain call. */
  const key = privateKeyToAccount(generatePrivateKey());
  const signed = await key.signMessage({ message: { raw: hash } });
  let asked = 0;
  const never = async () => {
    asked += 1;
    return false;
  };
  assert.equal(await verifyNegotiationSignature({ negotiationHash: hash, providerSignature: signed, expectedProvider: key.address, contractSignature: never }), key.address);
  assert.equal(asked, 0, 'a recovering key signature never asks the chain');
  /* A contract wallet: asked with both EIP-191 digests, and only its own yes counts. */
  const wallet = '0x75A0000000000000000000000000000000006B19';
  const longSignature = `0x${'11'.repeat(97)}`;
  assert.ok(PROVIDER_SIGNATURE.test(longSignature));
  let seen: { wallet: string; digests: string[] } | null = null;
  const vouch = async (input: { wallet: string; digests: string[]; signature: string }) => {
    seen = input;
    return input.digests.includes(hashMessage({ raw: hash }));
  };
  assert.equal(await verifyNegotiationSignature({ negotiationHash: hash, providerSignature: longSignature, expectedProvider: wallet, contractSignature: vouch }), wallet);
  assert.equal(seen!.wallet, wallet, 'only the registered wallet is asked');
  await assert.rejects(verifyNegotiationSignature({ negotiationHash: hash, providerSignature: longSignature, expectedProvider: wallet, contractSignature: never }), /does not recover to the selected ERC-8004 provider wallet/);
  await assert.rejects(verifyNegotiationSignature({ negotiationHash: hash, providerSignature: longSignature, expectedProvider: wallet }), /does not recover/, 'without a chain check, only keys');
  await assert.rejects(verifyNegotiationSignature({ negotiationHash: hash, providerSignature: '0x1234', expectedProvider: wallet, contractSignature: vouch }), /invalid provider signature/);
  /* The job's description keeps such a quote, so the seller can re-derive its hash from it. */
  assert.match(code('lib/erc8183/job-envelope.ts'), /const SIGNATURE = PROVIDER_SIGNATURE;/);
  assert.match(code('lib/erc8183/contract-signature.ts'), /if \(String\(result\)\.toLowerCase\(\) === ERC1271_MAGIC_VALUE\) return true;/);
  assert.match(code('lib/erc8183/quote.ts'), /contractSignature: contractSignatureCheck\(/);
});
