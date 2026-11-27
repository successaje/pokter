import assert from 'node:assert/strict';
import test from 'node:test';
import { keccak256, toBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { canonicalJson, verifyNegotiationSignature } from '../src/lib/erc8183/negotiation';
import { negotiationHashOf, prepareQuoteSignature } from '../src/lib/erc8183/quote-signing';

const WALLET = '0x564cbb1c360Af36681591F47AF469913B6364431';
const HASH = '0x9c1185a5c5e9fc54612808977ee8f548b2258d31a7c4b1e2d3f5a6b7c8d9e0f1';
const ok = (over: Record<string, unknown> = {}) => {
  const prepared = prepareQuoteSignature({ agentWallet: WALLET, chainId: 56, negotiationHash: HASH, ...over });
  assert.equal(prepared.ok, true, 'ok' in prepared && !prepared.ok ? prepared.error : '');
  return prepared as Extract<typeof prepared, { ok: true }>;
};

test('what a seller is told to sign is what Pokter accepts', async () => {
  const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
  const prepared = ok({ agentWallet: account.address });
  const signer = await verifyNegotiationSignature({
    negotiationHash: prepared.negotiationHash,
    providerSignature: await account.signTypedData(prepared.typedData),
    expectedProvider: account.address,
    typedDataChainId: prepared.chainId,
  });
  assert.equal(signer, account.address, 'prepare and verify must agree, or a seller signs something we refuse');
});

test('the hash can be derived from the content, the same way every verifier derives it', () => {
  const content = { request: { task_description: 'Check a token' }, response: { accepted: true } };
  const prepared = ok({ negotiationHash: undefined, content });
  assert.equal(prepared.negotiationHash, keccak256(toBytes(canonicalJson(content))));
  assert.equal(negotiationHashOf(content), prepared.negotiationHash);
});

test('the preview command carries the wallet and the struct in the wrapper the tool expects', () => {
  const prepared = ok();
  const message = prepared.preview.slice(prepared.preview.indexOf("--message '") + 11, prepared.preview.lastIndexOf("' --signType"));
  const wrapper = JSON.parse(message);
  assert.equal(wrapper.method, 'eth_signTypedData_v4');
  assert.equal(wrapper.params[0], WALLET, 'the signer address must be the agent wallet or the tool refuses it');
  assert.deepEqual(wrapper.params[1], prepared.typedData);
  assert.match(prepared.preview, /--binanceChainId 56\b/);
});

test('the struct is bound to the chain asked for, so one chain’s quote cannot be replayed on the other', () => {
  assert.equal(ok({ chainId: 56 }).typedData.domain.chainId, 56);
  assert.equal(ok({ chainId: 97 }).typedData.domain.chainId, 97);
});

test('it says how to assemble the signature, because the wallet returns it in two pieces', () => {
  const { then } = ok();
  assert.match(then, /64 bytes of r and s/);
  assert.match(then, /1b when the recovery is "00"/);
  assert.match(then, /1c when it is "01"/);
});

test('what it refuses, and why', () => {
  const cases: Array<[Parameters<typeof prepareQuoteSignature>[0], RegExp]> = [
    [{ agentWallet: WALLET, chainId: 1, negotiationHash: HASH }, /chainId must be 56 or 97/],
    [{ agentWallet: 'not-a-wallet', chainId: 56, negotiationHash: HASH }, /agentWallet is required/],
    [{ agentWallet: WALLET, chainId: 56, negotiationHash: '0xshort' }, /32 bytes as 0x-prefixed hex/],
    [{ agentWallet: WALLET, chainId: 56 }, /Pass negotiationHash, or content/],
  ];
  for (const [input, expected] of cases) {
    const refused = prepareQuoteSignature(input);
    assert.equal(refused.ok, false, JSON.stringify(input));
    assert.match(!refused.ok ? refused.error : '', expected);
  }
});
