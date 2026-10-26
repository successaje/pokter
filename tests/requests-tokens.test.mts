import assert from 'node:assert/strict';
import test from 'node:test';
import { privateKeyToAccount } from 'viem/accounts';
import { verifyMessage } from 'viem';

import { hireForChosenProposal, hireForProposal } from '../src/lib/briefs/hired';
import {
  amountToRaw,
  bidMessage,
  briefMessage,
  parseBidContent,
  parseBriefContent,
  readBidContent,
  readBriefContent,
  requestAmountLabel,
  requestTokenOf,
  requestUnit,
  withinBudget,
} from '../src/lib/briefs/model';
import { alertCopy } from '../src/lib/briefs/request-alerts';
import { enabledHireTokens } from '../src/lib/network/tokens';

/*
 * Requests and proposals in more than one token.
 *
 * Two things must hold together. Every $U request and proposal signed
 * before tokens existed must still verify, so their signed text cannot
 * change by a byte. And a request in any other token must say which, by
 * address, in what its poster signs — a symbol alone is a label anyone can
 * deploy — with every proposal on it held to that same token.
 */

const U56 = '0xcE24439F2D9C6a2289F741120FE202248B666666';
const U97 = '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565';
const USDT56 = '0x55d398326f99059fF775485246999027B3197955';
const USD1_56 = '0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d';
const POSTER = '0x60eF148485c2a5119fa52ca13c52E9Fd98f28E87';
const AT = '2026-10-26T10:00:00.000Z';
const NOW = Date.parse(AT);

/* USDT turned on for hiring on mainnet, as `NEXT_PUBLIC_HIRE_TOKENS` would. */
const USDT_ON = enabledHireTokens(`56:${USDT56}`);
const NOTHING_ON = enabledHireTokens('');

const CONTENT = {
  title: 'Route planner',
  brief: 'Plan crew routes and find schedule gaps.',
  acceptance: ['Every job assigned or explained'],
  failSignals: ['A message is sent instead of drafted'],
  budgetU: 2.5,
  chainId: 56,
  deliverDays: 7,
};

/* The exact text a $U request signed before this change. */
const LEGACY_BRIEF_TEXT = [
  'Pokter posted brief',
  `Posted by: ${POSTER.toLowerCase()}`,
  `At: ${AT}`,
  'Title: Route planner',
  'Budget: 2.5 $U on chain 56',
  'Deliver within: 7 days',
  'Brief: Plan crew routes and find schedule gaps.',
  'Acceptance: Every job assigned or explained',
  'Fail signals: A message is sent instead of drafted',
].join('\n');

const BID = { agentChainId: 56, agentTokenId: '2554', priceU: 2, deliverDays: 5, note: 'n' };
const LEGACY_BID_TEXT = [
  'Pokter bid on a brief',
  'Brief: b1',
  `Bidder: ${POSTER.toLowerCase()}`,
  `At: ${AT}`,
  'Agent: 56:2554',
  'Price: 2 $U',
  'Deliver within: 5 days',
  'Note: n',
].join('\n');

test('a $U request signs byte for byte what it signed before tokens, named or not', () => {
  assert.equal(briefMessage({ ...CONTENT, poster: POSTER, postedAt: AT }), LEGACY_BRIEF_TEXT);
  assert.equal(briefMessage({ ...CONTENT, paymentToken: null, poster: POSTER, postedAt: AT }), LEGACY_BRIEF_TEXT);
  assert.equal(briefMessage({ ...CONTENT, paymentToken: U56, poster: POSTER, postedAt: AT }), LEGACY_BRIEF_TEXT);
  // What the server stores for it signs the same text too, so the route verifies the poster's signature.
  const stored = readBriefContent(CONTENT, NOW, USDT_ON);
  assert.ok(stored);
  assert.equal(stored.paymentToken, U56, 'the token is written out on a new row');
  assert.equal(stored.budgetRaw, '2500000000000000000');
  assert.equal(briefMessage({ ...stored, poster: POSTER, postedAt: AT }), LEGACY_BRIEF_TEXT);
});

test('a $U proposal signs byte for byte what it signed before tokens', () => {
  const base = { ...BID, briefId: 'b1', bidder: POSTER, placedAt: AT };
  assert.equal(bidMessage(base), LEGACY_BID_TEXT);
  assert.equal(bidMessage({ ...base, paymentToken: U56, chainId: 56 }), LEGACY_BID_TEXT);
  assert.equal(bidMessage({ ...base, paymentToken: U97, chainId: 97 }), LEGACY_BID_TEXT, 'testnet $U too');
});

test('a signature over a legacy $U request still verifies', async () => {
  const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
  const before = LEGACY_BRIEF_TEXT.replace(POSTER.toLowerCase(), account.address.toLowerCase());
  const signature = await account.signMessage({ message: before });
  const stored = readBriefContent(CONTENT, NOW, USDT_ON)!;
  const now = briefMessage({ ...stored, poster: account.address, postedAt: AT });
  assert.equal(await verifyMessage({ address: account.address, message: now, signature }), true);
});

test('a USDT request names the token by address and chain in what its poster signs', () => {
  const read = parseBriefContent({ ...CONTENT, budgetU: 5, paymentToken: USDT56 }, NOW, USDT_ON);
  assert.ok(read.ok);
  const message = briefMessage({ ...read.content, poster: POSTER, postedAt: AT });
  assert.match(message, new RegExp(`^Budget: 5 USDT \\(${USDT56}\\) on chain 56$`, 'm'));
  assert.doesNotMatch(message, /\$U/);
  assert.notEqual(message, briefMessage({ ...read.content, paymentToken: U56, poster: POSTER, postedAt: AT }), 'a USDT request and a $U one are different signatures');

  const bid = bidMessage({ ...BID, paymentToken: USDT56, chainId: 56, briefId: 'b1', bidder: POSTER, placedAt: AT });
  assert.match(bid, new RegExp(`^Price: 2 USDT \\(${USDT56}\\) on chain 56$`, 'm'));
});

test('a request in a token not offered for hiring on its chain is refused, by name', () => {
  // Off: USDT is eligible but not turned on.
  const off = parseBriefContent({ ...CONTENT, paymentToken: USDT56 }, NOW, NOTHING_ON);
  assert.equal(off.ok, false);
  assert.match(!off.ok ? off.error : '', /USDT \(0x55d398326f99059fF775485246999027B3197955\) is not offered for hiring on chain 56/);
  // Another token that is not turned on.
  const usd1 = parseBriefContent({ ...CONTENT, paymentToken: USD1_56 }, NOW, USDT_ON);
  assert.match(!usd1.ok ? usd1.error : '', /USD1/);
  // A token on the other network.
  const wrongChain = parseBriefContent({ ...CONTENT, chainId: 97, paymentToken: USDT56 }, NOW, USDT_ON);
  assert.match(!wrongChain.ok ? wrongChain.error : '', /on chain 56\) is not offered for hiring on chain 97/);
  // Something that is not a token at all.
  assert.equal(readBriefContent({ ...CONTENT, paymentToken: '0x0000000000000000000000000000000000000001' }, NOW, USDT_ON), null);
  // The signer refuses an amount in an unverified token rather than writing it as $U.
  assert.throws(() => briefMessage({ ...CONTENT, paymentToken: '0x0000000000000000000000000000000000000001', poster: POSTER, postedAt: AT }));
});

test('limits apply in the request’s own token', () => {
  const usdt = (budgetU: number) => parseBriefContent({ ...CONTENT, budgetU, paymentToken: USDT56 }, NOW, USDT_ON);
  assert.ok(usdt(5).ok);
  assert.ok(usdt(0.01).ok);
  const over = usdt(5.01);
  assert.match(!over.ok ? over.error : '', /at most 5 USDT/);
  const under = usdt(0.001);
  assert.match(!under.ok ? under.error : '', /at least 0\.01 USDT/);

  const request = { chainId: 56, paymentToken: USDT56 };
  const bid = (priceU: number) => parseBidContent({ ...BID, priceU, paymentToken: USDT56 }, request);
  assert.ok(bid(5).ok);
  const above = bid(6);
  assert.match(!above.ok ? above.error : '', /at most 5 USDT/);

  // Raw amounts at the token's own decimals, never an assumed 18.
  assert.equal(amountToRaw(1.5, 6), 1_500_000n);
  assert.equal(amountToRaw(1.5, 18), 1_500_000_000_000_000_000n);
  assert.equal(amountToRaw(0.1234567, 6), null, 'more places than the token holds is refused, not rounded');
});

test('a proposal in another token than its request is refused, with the request’s token named', () => {
  const usdtRequest = { chainId: 56, paymentToken: USDT56 };
  const inU = parseBidContent({ ...BID, paymentToken: U56 }, usdtRequest);
  assert.equal(inU.ok, false);
  assert.match(!inU.ok ? inU.error : '', /priced in USDT \(0x55d398326f99059fF775485246999027B3197955\) on chain 56.*not \$U/);
  // No token at all is the legacy $U client, which a USDT request refuses too.
  const unnamed = parseBidContent(BID, usdtRequest);
  assert.match(!unnamed.ok ? unnamed.error : '', /has to be in USDT too/);
  // And the other way: a USDT proposal on a $U request.
  assert.equal(readBidContent({ ...BID, paymentToken: USDT56 }, { chainId: 56, paymentToken: U56 }), null);
  // The same token is accepted, and stored with its raw amount.
  const ok = parseBidContent({ ...BID, paymentToken: USDT56 }, usdtRequest);
  assert.ok(ok.ok);
  assert.equal(ok.content.paymentToken, USDT56);
  assert.equal(ok.content.priceRaw, '2000000000000000000');
});

test('withinBudget compares one token in base units, and refuses a different token', () => {
  const request = { chainId: 56, paymentToken: USDT56, budgetRaw: '2500000000000000000' };
  assert.equal(withinBudget({ paymentToken: USDT56, priceRaw: '2500000000000000000' }, request), true);
  assert.equal(withinBudget({ paymentToken: USDT56, priceRaw: '2500000000000000001' }, request), false);
  assert.equal(withinBudget({ paymentToken: U56, priceRaw: '1' }, request), false, 'cheaper in another money is not within budget');
  assert.equal(withinBudget({ paymentToken: null, priceRaw: '1' }, request), false, 'a legacy $U price on a USDT request');
  // A legacy request and a legacy proposal are both $U.
  assert.equal(withinBudget({ paymentToken: null, priceRaw: '1' }, { chainId: 56, paymentToken: null, budgetRaw: '2' }), true);
});

test('a request from before tokens reads as its chain’s $U', () => {
  assert.equal(requestTokenOf({ chainId: 56, paymentToken: null })?.address, U56);
  assert.equal(requestTokenOf({ chainId: 97, paymentToken: null })?.address, U97);
  assert.equal(requestAmountLabel({ chainId: 56, paymentToken: null }, 2.5), '2.5 $U');
  assert.equal(requestUnit({ chainId: 97, paymentToken: null }), 'test $U');
  assert.equal(requestAmountLabel({ chainId: 56, paymentToken: USDT56 }, 2.5), '2.5 USDT');
  // A proposal with no token on it is $U, and is stored as $U by address.
  const legacy = parseBidContent(BID, { chainId: 56, paymentToken: null });
  assert.ok(legacy.ok);
  assert.equal(legacy.content.paymentToken, U56);
});

test('an alert names the request’s money', () => {
  const request = { id: 'r', title: 'T', poster: POSTER, state: 'open' as const, category: 'yield', budgetU: 2, chainId: 56, postedAt: AT };
  const agents = [{ chainId: 56, tokenId: '1', name: 'A', categoryId: 'yield' }];
  assert.match(alertCopy({ request: { ...request, paymentToken: USDT56 }, agents }).body, /up to 2\.00 USDT\./);
  assert.match(alertCopy({ request, agents }).body, /up to 2\.00 \$U\./);
});

/* The hire a chosen proposal became, held to the proposal's money. */
const PROPOSAL = {
  poster: POSTER,
  chainId: 56,
  agentChainId: 56,
  agentTokenId: '2554',
  placedAt: '2026-10-20T10:00:00Z',
  paymentToken: USDT56,
  priceRaw: '2000000000000000000',
};
const job = (over: Record<string, unknown> = {}) => ({
  jobId: '1600',
  chainId: 56,
  agentChainId: 56,
  agentTokenId: '2554',
  client: POSTER.toLowerCase(),
  hiredAt: '2026-10-21T09:00:00Z',
  status: 'FUNDED' as const,
  paymentToken: USDT56 as string | null,
  budgetRaw: '2000000000000000000',
  ...over,
});

test('a hire counts for a proposal only in its token and at or under its price', () => {
  assert.equal(hireForProposal([job()], PROPOSAL)?.jobId, '1600');
  assert.equal(hireForProposal([job({ budgetRaw: '1000000000000000000' })], PROPOSAL)?.jobId, '1600', 'under the price is still the hire');
  assert.equal(hireForProposal([job({ paymentToken: U56 })], PROPOSAL), null, 'a $U job is not the USDT proposal');
  assert.equal(hireForProposal([job({ paymentToken: USDT56.toLowerCase() })], PROPOSAL)?.jobId, '1600', 'addresses compare in one case');
  assert.equal(hireForProposal([job({ budgetRaw: '2000000000000000001' })], PROPOSAL), null, 'above the price is not this proposal');
  assert.equal(hireForProposal([job({ paymentToken: null })], PROPOSAL), null, 'a job whose token is not yet read is not claimed');
});

test('a legacy proposal resolves to $U when matched against jobs', () => {
  const request = { poster: POSTER, chainId: 56, paymentToken: null };
  const bid = { agentChainId: 56, agentTokenId: '2554', placedAt: PROPOSAL.placedAt, paymentToken: null, priceRaw: '2000000000000000000' };
  assert.equal(hireForChosenProposal([job({ paymentToken: U56 })], request, bid)?.jobId, '1600');
  assert.equal(hireForChosenProposal([job()], request, bid), null, 'a USDT job is not a $U proposal');
});

test('a staged proposal keeps the request’s token, and a table from before gains the column', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { ensureProviderWork, readStagedProposal, stageProposal } = await import('../src/lib/assistant/provider-store');
  const db = new DatabaseSync(':memory:');
  /* The table as it was: no payment_token, with a row staged in $U. */
  db.exec(`CREATE TABLE staged_proposals (key TEXT PRIMARY KEY, owner TEXT NOT NULL, request_id TEXT NOT NULL, agent_chain_id INTEGER NOT NULL, agent_token_id TEXT NOT NULL, price_u REAL NOT NULL, deliver_days INTEGER NOT NULL, note TEXT NOT NULL, bid_id TEXT, prepared_at TEXT NOT NULL, last_seen_at TEXT NOT NULL)`);
  db.prepare(`INSERT INTO staged_proposals VALUES ('old', '0xabc', 'r0', 56, '1', 1, 3, 'n', NULL, 'x', 'x')`).run();
  ensureProviderWork(db);
  assert.equal(readStagedProposal(db, 'old')?.paymentToken, null);
  const write = { key: 'k', owner: '0xABC', requestId: 'r1', agentChainId: 56, agentTokenId: '1', priceU: 2, paymentToken: USDT56, deliverDays: 3, note: 'n', at: AT };
  assert.equal(stageProposal(db, write), 'recorded');
  assert.equal(readStagedProposal(db, 'k')?.paymentToken, USDT56);
  assert.equal(stageProposal(db, { ...write, priceU: 3 }), 'revised');
  assert.equal(readStagedProposal(db, 'k')?.paymentToken, USDT56);
});
