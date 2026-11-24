import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { getAddress, verifyTypedData, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import type { Bid, Brief } from '../../src/lib/briefs/model';

/*
 * A request's poster deciding on it from a wallet that signs only EIP-712
 * typed data, as an Agentic Wallet does: choose a proposal, take the choice
 * back, withdraw. The same routes the browser uses take the typed
 * signature, rebuilt from the halves the wallet returns. Then the chosen
 * proposal is hired through prepare_hire with the arguments the request
 * gives, and nothing a caller sends beside them can widen it.
 */

const dir = mkdtempSync(join(tmpdir(), 'pokter-agentic-choice-'));
process.env.BRIEF_DB_PATH = join(dir, 'briefs.db');
process.env.JOB_DB_PATH = join(dir, 'jobs.db');
process.env.RATE_LIMIT_DB_PATH = join(dir, 'rate-limit.db');

const { getBriefStore } = await import('../../src/lib/briefs/store');
const { chooseTypedData, withdrawTypedData, walletTypedData, walletSignRequest, shellWord, DECISION_ACTIONS } = await import('../../src/lib/briefs/decision-typed');
const { joinSignature, readDecisionSignature } = await import('../../src/lib/briefs/decision-signature');
const { decisionToSign } = await import('../../src/lib/briefs/decision-request');
const { chosenHireArguments } = await import('../../src/lib/briefs/public-view');
const { chosenProposalForHire, proposalHireProblem } = await import('../../src/lib/briefs/proposal-hire');
const { awardMessage, hireTaskFromRequest } = await import('../../src/lib/briefs/model');

const poster = privateKeyToAccount(`0x${'11'.repeat(32)}`);
const stranger = privateKeyToAccount(`0x${'22'.repeat(32)}`);
const USDT = getAddress('0x55d398326f99059fF775485246999027B3197955');
const NOW = Date.now();

const request = (id: string, over: Partial<Brief> = {}): Brief => ({
  id,
  poster: poster.address,
  signature: '0x',
  proof: 'board',
  state: 'open',
  postedAt: new Date(NOW - 3_600_000).toISOString(),
  awardedBidId: null,
  title: 'Check a token before I buy it',
  brief: 'Tell me whether CAKE is safe to buy, with the sources you read.',
  acceptance: ['Names every owner power it found'],
  failSignals: ['A verdict without sources'],
  budgetU: 1,
  paymentToken: USDT,
  budgetRaw: '1000000000000000000',
  chainId: 56,
  deliverDays: 3,
  closesAt: null,
  category: 'token-safety',
  targetBuilder: null,
  board: { requestId: '4', tx: `0x${'aa'.repeat(32)}`, expiresAt: new Date(NOW + 86_400_000).toISOString(), closedTx: null },
  ...over,
});
const bid = (id: string, briefId: string, over: Partial<Bid> = {}): Bid => ({
  id,
  briefId,
  agentChainId: 56,
  agentTokenId: '374115',
  priceU: 0.8,
  paymentToken: USDT,
  priceRaw: '800000000000000000',
  deliverDays: 7,
  note: 'How.',
  bidder: stranger.address,
  signature: '0x01',
  placedAt: new Date(NOW - 1_800_000).toISOString(),
  ...over,
});

/** Sign as the wallet does, from the JSON-RPC request it is handed, and split the answer as it returns it. */
async function walletSigns(account: typeof poster, message: string) {
  const [, json] = JSON.parse(message).params as [string, string];
  const signed = await account.signTypedData(JSON.parse(json));
  const hex = signed.slice(2);
  return { signature: hex.slice(0, 128), signatureRecovery: (Number.parseInt(hex.slice(128), 16) - 27).toString(16).padStart(2, '0'), whole: signed as Hex };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (path: string, body: unknown) => new Request(`https://pokter.xyz${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('the wallet’s signature halves are joined into the signature they make, and anything else is refused', async () => {
  const typed = withdrawTypedData('r-1', poster.address);
  const { signature, signatureRecovery, whole } = await walletSigns(poster, walletSignRequest(poster.address, typed));
  assert.equal(joinSignature(signature, signatureRecovery), whole);
  assert.equal(joinSignature(whole), whole, 'a whole signature is taken as it is');
  assert.equal(joinSignature(whole.slice(2)), whole);
  assert.equal(joinSignature(signature, Number.parseInt(whole.slice(-2), 16)), whole, 'v as 27 or 28 too');
  assert.equal(joinSignature(signature, '02'), null);
  assert.equal(joinSignature(signature), null, 'half a signature with no recovery id');
  assert.equal(joinSignature('0x1234', '00'), null);
  assert.deepEqual(readDecisionSignature({ signature, signatureRecovery, format: 'eip712' }), { format: 'eip712', signature: whole });
  assert.deepEqual(readDecisionSignature({ signature: whole }), { format: 'text', signature: whole });
  assert.equal(readDecisionSignature({ signature: whole, format: 'something' }), null);
  assert.equal(readDecisionSignature({}), null);
});

test('the typed data a wallet signs is the decision Pokter checks, and says in words what it agrees to', async () => {
  const typed = chooseTypedData('r-1', 'b-1', poster.address.toLowerCase(), '2 USDT');
  assert.equal(typed.message.action, DECISION_ACTIONS.ChooseProposal);
  assert.match(typed.message.action, /moves no money/);
  assert.equal(typed.message.poster, poster.address);
  assert.equal(typed.message.aboveMyBudgetIWillFund, '2 USDT');
  assert.equal(chooseTypedData('r-1', 'b-1', poster.address).message.aboveMyBudgetIWillFund, '');
  const sent = walletSignRequest(poster.address, typed);
  const parsed = JSON.parse(sent) as { method: string; params: [string, string] };
  assert.equal(parsed.method, 'eth_signTypedData_v4');
  assert.equal(parsed.params[0], poster.address);
  assert.deepEqual(JSON.parse(parsed.params[1]), JSON.parse(JSON.stringify(walletTypedData(typed))));
  /* Signed from the wallet's form, with its domain type written out; verified from Pokter's, without. */
  const { whole } = await walletSigns(poster, sent);
  assert.equal(await verifyTypedData({ ...typed, address: poster.address, signature: whole } as never), true);
  assert.equal(await verifyTypedData({ ...chooseTypedData('r-1', 'b-2', poster.address, '2 USDT'), address: poster.address, signature: whole } as never), false, 'another proposal');
  assert.equal(shellWord(`it's`), `'it'\\''s'`);
});

test('a decision is handed out only to the poster, and only when its route would take it', () => {
  const brief = request('r-2');
  const bids = [bid('b-1', 'r-2')];
  const never = () => assert.fail('not asked');
  const refused = (result: ReturnType<typeof decisionToSign>) => (result.ok ? assert.fail('handed out') : result);
  assert.equal(refused(decisionToSign(brief, bids, { action: 'choose', wallet: stranger.address, bidId: 'b-1' }, { hired: never })).status, 403);
  assert.equal(refused(decisionToSign(brief, bids, { action: 'pick', wallet: poster.address }, { hired: never })).status, 400);
  assert.equal(refused(decisionToSign(brief, bids, { action: 'choose', wallet: poster.address, bidId: 'b-9' }, { hired: never })).status, 400);
  assert.equal(refused(decisionToSign(brief, bids, { action: 'change', wallet: poster.address }, { hired: never })).status, 409, 'nothing chosen');
  assert.equal(refused(decisionToSign(request('r-2', { state: 'awarded', awardedBidId: 'b-1' }), bids, { action: 'change', wallet: poster.address }, { hired: () => true })).status, 409, 'hired');
  assert.equal(refused(decisionToSign(request('r-2', { state: 'cancelled' }), bids, { action: 'withdraw', wallet: poster.address }, { hired: never })).status, 409);

  const choose = decisionToSign(brief, bids, { action: 'choose', wallet: poster.address.toLowerCase(), bidId: 'b-1' }, { hired: never });
  assert.ok(choose.ok);
  assert.deepEqual(choose.submit, { path: '/api/briefs/r-2/award', body: { bidId: 'b-1', format: 'eip712' } });
  assert.equal(choose.signBy, null);
  const change = decisionToSign(request('r-2', { state: 'awarded', awardedBidId: 'b-1' }), bids, { action: 'change', wallet: poster.address }, { hired: () => false, now: NOW });
  assert.ok(change.ok);
  assert.equal(change.submit.body.decidedAt, new Date(NOW).toISOString());
  assert.equal(change.signBy, new Date(NOW + 10 * 60_000).toISOString());
  assert.equal(change.typed.message.proposalNoLongerChosen, 'b-1');
});

test('the browser’s routes take the decision signed as typed data: choose, take back, choose again, then withdraw after taking back', async () => {
  const store = getBriefStore();
  const id = '33333333-3333-4333-8333-333333333333';
  store.add(request(id));
  store.placeBid(bid('44444444-4444-4444-8444-444444444444', id));
  const bidId = '44444444-4444-4444-8444-444444444444';
  const award = (await import('../../src/app/api/briefs/[id]/award/route')).POST;
  const reopen = (await import('../../src/app/api/briefs/[id]/reopen/route')).POST;
  const withdraw = (await import('../../src/app/api/briefs/[id]/withdraw/route')).POST;

  const decide = async (action: 'choose' | 'change' | 'withdraw') => {
    const brief = store.get(id)!;
    const decision = decisionToSign(brief, store.bidsFor(id), { action, wallet: poster.address, bidId }, { hired: () => false });
    assert.ok(decision.ok, JSON.stringify(decision));
    const signed = await walletSigns(poster, walletSignRequest(poster.address, decision.typed));
    return { decision, body: { ...decision.submit.body, signature: signed.signature, signatureRecovery: signed.signatureRecovery } };
  };

  const choose = await decide('choose');
  const chosen = await award(post(choose.decision.submit.path, choose.body), params(id));
  assert.equal(chosen.status, 200, await chosen.clone().text());
  assert.equal(store.get(id)?.state, 'awarded');
  assert.equal(store.get(id)?.awardedBidId, bidId);

  const change = await decide('change');
  const changed = await reopen(post(change.decision.submit.path, change.body), params(id));
  assert.equal(changed.status, 200, await changed.clone().text());
  assert.equal(store.get(id)?.state, 'open');

  const again = await decide('choose');
  assert.equal((await award(post(again.decision.submit.path, again.body), params(id))).status, 200);
  const back = await decide('change');
  assert.equal((await reopen(post(back.decision.submit.path, back.body), params(id))).status, 200);

  const off = await decide('withdraw');
  const withdrawn = await withdraw(post(off.decision.submit.path, off.body), params(id));
  assert.equal(withdrawn.status, 200, await withdrawn.clone().text());
  assert.equal(store.get(id)?.state, 'cancelled');

  /* The plain message a browser wallet signs still counts on the same route. */
  const id2 = '55555555-5555-4555-8555-555555555555';
  store.add(request(id2));
  store.placeBid(bid('66666666-6666-4666-8666-666666666666', id2));
  const text = await poster.signMessage({ message: awardMessage(id2, '66666666-6666-4666-8666-666666666666', poster.address) });
  assert.equal((await award(post(`/api/briefs/${id2}/award`, { bidId: '66666666-6666-4666-8666-666666666666', signature: text }), params(id2))).status, 200);
});

test('a chosen proposal comes with the arguments that hire exactly it, and the hire is held to them', () => {
  const store = getBriefStore();
  const id = '77777777-7777-4777-8777-777777777777';
  const bidId = '88888888-8888-4888-8888-888888888888';
  store.add(request(id));
  store.placeBid(bid(bidId, id));
  assert.equal(chosenHireArguments(store.get(id)!, store.bidsFor(id)), null, 'nothing chosen yet');
  assert.equal(chosenProposalForHire(bidId, 56, '374115'), null);
  store.award(id, bidId);

  const brief = store.get(id)!;
  const args = chosenHireArguments(brief, store.bidsFor(id));
  assert.deepEqual(args, { chain_id: 56, token_id: '374115', proposal_id: bidId, task: hireTaskFromRequest(brief), escrow_chain_id: 56, max_budget: 0.8, payment_token: USDT });

  const chosen = chosenProposalForHire(bidId, 56, '374115');
  assert.ok(chosen);
  assert.equal(chosen.poster.toLowerCase(), poster.address.toLowerCase());
  assert.equal(chosen.proposal.deliverDays, 7);
  assert.equal(chosenProposalForHire(bidId, 56, '999'), null, 'another agent');

  const owner = { task: args!.task, escrowChain: 56, maxBudget: 0.8, ownerToken: USDT as string | null };
  assert.equal(proposalHireProblem(chosen, owner), null);
  assert.equal(proposalHireProblem(chosen, { ...owner, maxBudget: 0.5 }), null, 'a lower ceiling only narrows it');
  assert.match(proposalHireProblem(chosen, { ...owner, maxBudget: 0.9 }) ?? '', /no more than that/);
  assert.match(proposalHireProblem(chosen, { ...owner, escrowChain: 97 }) ?? '', /chain 56/);
  assert.match(proposalHireProblem(chosen, { ...owner, ownerToken: null }) ?? '', /payment_token/, 'no token named is $U, not the proposal’s USDT');
  assert.match(proposalHireProblem(chosen, { ...owner, task: 'Something else' }) ?? '', /its task is the request’s/);
});
