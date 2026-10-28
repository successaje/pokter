import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { hashDomain, recoverTypedDataAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { authorizationMismatch, authorizationTypedData, changedTerms, chooseX402Option, paymentHeader, readPaymentHeader, X402_ASSET, X402_DOMAIN } from '../src/lib/x402/exact';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/x402/${name}-challenge-2026-10-24.json`, import.meta.url), 'utf8'));
const BRAIN = 'https://agent.brainonbnb.com/answer?service=health_factor';
const USD1_SELLER = 'https://seller.example/api/x402/guard';
const buyer = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const NOW = 1_761_300_000;
const NONCE = ('0x' + 'ab'.repeat(32)) as `0x${string}`;

test('from Brain on BNB’s real challenge, the U by EIP-3009 option is chosen, not the USD1, USDC or direct-transfer ones', () => {
  const choice = chooseX402Option(BRAIN, fixture('brainonbnb'));
  assert.ok(choice.ok);
  assert.equal(choice.terms.asset, X402_ASSET);
  assert.equal(choice.terms.amountRaw, '100000000000000000');
  assert.equal(choice.terms.payTo, '0x690E950214980BC329823A2DB2fD90C06Bd54dE4');
  assert.equal(choice.terms.version, 2);
});

test('a real challenge offering only USD1, which Pokter does not pay: said, with what was offered', () => {
  const choice = chooseX402Option(USD1_SELLER, fixture('usd1-only'));
  assert.equal(choice.ok, false);
  assert.match(!choice.ok ? choice.reason : '', /exact scheme, paid in U on BNB Chain by EIP-3009/);
  assert.deepEqual(!choice.ok ? choice.offered.map((o) => o.method) : [], ['eip3009']);
});

test('a seller naming another signing domain for U is refused, not signed for', () => {
  const challenge = fixture('brainonbnb');
  const u = challenge.accepts.find((a: { asset: string }) => a.asset.toLowerCase() === X402_ASSET.toLowerCase());
  u.extra.name = 'United Stables v2';
  assert.equal(chooseX402Option(BRAIN, challenge).ok, false);
});

test('the pinned domain is U’s on chain', () => {
  const onchain = '0x358738403e5a61fdc30a8be78a60f289cbe4d2545b735a344b6229c70c1679b6';
  const types = { EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }] } as const;
  assert.equal(hashDomain({ domain: { ...X402_DOMAIN, chainId: BigInt(X402_DOMAIN.chainId) }, types }), onchain, 'read from DOMAIN_SEPARATOR() on 24 Oct 2026');
});

test('a changed recipient or price is never paid unseen', () => {
  const agreed = (chooseX402Option(BRAIN, fixture('brainonbnb')) as { ok: true; terms: import('../src/lib/x402/exact').X402Terms }).terms;
  assert.equal(changedTerms(agreed, { ...agreed }), null);
  assert.match(changedTerms(agreed, { ...agreed, payTo: '0x000000000000000000000000000000000000dEaD' }) ?? '', /recipient changed/);
  assert.match(changedTerms(agreed, { ...agreed, amountRaw: '200000000000000000' }) ?? '', /price changed/);
});

test('the signed authorization recovers to the buyer, travels in the header, and is checked against the terms', async () => {
  const terms = (chooseX402Option(BRAIN, fixture('brainonbnb')) as { ok: true; terms: import('../src/lib/x402/exact').X402Terms }).terms;
  const { typedData, authorization } = authorizationTypedData(terms, buyer.address, NOW, NONCE);
  assert.equal(Number(authorization.validBefore) - NOW, 300, 'capped at five minutes');
  const signature = await buyer.signTypedData(typedData);
  assert.equal(await recoverTypedDataAddress({ ...typedData, signature }), buyer.address);

  const header = paymentHeader(terms, signature, authorization);
  assert.equal(header.name, 'PAYMENT-SIGNATURE');
  const read = readPaymentHeader(header.value);
  assert.deepEqual(read?.authorization, authorization);
  assert.equal(authorizationMismatch(terms, read!.authorization, NOW), null);
  assert.match(authorizationMismatch(terms, { ...read!.authorization, to: '0x000000000000000000000000000000000000dEaD' }, NOW) ?? '', /someone other/);
  assert.match(authorizationMismatch(terms, read!.authorization, NOW + 301) ?? '', /expired/);
  assert.equal(readPaymentHeader('not base64 json'), null);

  const v1 = paymentHeader({ ...terms, version: 1 }, signature, authorization);
  assert.equal(v1.name, 'X-PAYMENT');
});

test('only the buyer’s own signature over these terms, in the seller’s envelope, is forwarded', async () => {
  const { paymentHeaderProblem } = await import('../src/lib/x402/exact');
  const terms = (chooseX402Option(BRAIN, fixture('brainonbnb')) as { ok: true; terms: import('../src/lib/x402/exact').X402Terms }).terms;
  const { typedData, authorization } = authorizationTypedData(terms, buyer.address, NOW, NONCE);
  const good = readPaymentHeader(paymentHeader(terms, await buyer.signTypedData(typedData), authorization).value)!;
  assert.equal(await paymentHeaderProblem(terms, good, NOW), null);

  const other = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');
  const forged = readPaymentHeader(paymentHeader(terms, await other.signTypedData(typedData), authorization).value)!;
  assert.match((await paymentHeaderProblem(terms, forged, NOW)) ?? '', /not signed by the wallet it names/);

  const v1Envelope = readPaymentHeader(paymentHeader({ ...terms, version: 1 }, good.signature, authorization).value)!;
  assert.match((await paymentHeaderProblem(terms, v1Envelope, NOW)) ?? '', /different x402 version/);

  const nan = JSON.parse(Buffer.from(paymentHeader(terms, good.signature, authorization).value, 'base64').toString());
  nan.payload.authorization.validBefore = 'soon';
  assert.equal(readPaymentHeader(Buffer.from(JSON.stringify(nan)).toString('base64')), null, 'a non-number never reaches the expiry check');
});

test('the header base64 is the same in the browser shape and on the server', () => {
  const terms = (chooseX402Option(BRAIN, fixture('brainonbnb')) as { ok: true; terms: import('../src/lib/x402/exact').X402Terms }).terms;
  const header = paymentHeader(terms, ('0x' + '11'.repeat(65)) as `0x${string}`, { from: buyer.address, to: terms.payTo, value: '1', validAfter: '0', validBefore: '2', nonce: NONCE });
  const decoded = JSON.parse(Buffer.from(header.value, 'base64').toString('utf8'));
  assert.equal(decoded.accepted.extra.name, 'United Stables', 'no Buffer needed to build it, and it decodes with one');
});
