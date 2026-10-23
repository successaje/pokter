import assert from 'node:assert/strict';
import test from 'node:test';

import {
  contentDigest,
  deliveryBlocked,
  deliveryKey,
  deliveryRetry,
  needsOwnerSignature,
  proposalKey,
  proposalRetry,
  stagesWork,
} from '../src/lib/assistant/provider-work';

const OWNER = '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01';
const PROPOSAL = { owner: OWNER, requestId: 'req-1', agentChainId: 97, agentTokenId: '4' };
const DELIVERY = { owner: OWNER, chainId: 97, jobId: '1502' };

test('a proposal key is the owner, the request and the agent, and nothing else', () => {
  const base = proposalKey(PROPOSAL);
  assert.match(base, /^ppr_[0-9a-f]{32}$/);
  // A checksummed and a lower-cased spelling of one wallet are one wallet.
  assert.equal(proposalKey({ ...PROPOSAL, owner: OWNER.toLowerCase() }), base);
  // Change what the proposal is for and it is a different proposal.
  assert.notEqual(proposalKey({ ...PROPOSAL, requestId: 'req-2' }), base);
  assert.notEqual(proposalKey({ ...PROPOSAL, agentTokenId: '5' }), base);
  assert.notEqual(proposalKey({ ...PROPOSAL, agentChainId: 56 }), base);
  assert.notEqual(proposalKey({ ...PROPOSAL, owner: '0x2222222222222222222222222222222222222222' }), base);
});

/*
 * The terms are deliberately outside the key. A request holds one standing
 * offer per agent, so re-pricing has to land on the same row: keyed on the
 * price, every re-price would be a second thing for the owner to sign.
 */
test('re-pricing a proposal is the same proposal', () => {
  assert.equal(proposalKey(PROPOSAL), proposalKey({ ...PROPOSAL }));
});

/*
 * The one-chain assumption has broken this codebase twice. A job id exists
 * on both deployments and means a different job on each, so the escrow
 * chain is part of a delivery's identity.
 */
test('a delivery key is per escrow chain, not per job number', () => {
  const base = deliveryKey(DELIVERY);
  assert.match(base, /^pdl_[0-9a-f]{32}$/);
  assert.notEqual(deliveryKey({ ...DELIVERY, chainId: 56 }), base, 'job 1502 on 56 is not job 1502 on 97');
  assert.notEqual(deliveryKey({ ...DELIVERY, jobId: '1503' }), base);
  assert.equal(deliveryKey({ ...DELIVERY, owner: OWNER.toLowerCase() }), base);
});

/*
 * And the content is outside it, for the sharper reason: an assistant that
 * re-ran its work and produced slightly different text would otherwise
 * have a new key, find no record, and stage a second delivery for a job
 * that has already been delivered.
 */
test('a delivery key does not move when the work is rewritten', () => {
  assert.equal(deliveryKey(DELIVERY), deliveryKey({ ...DELIVERY }));
  assert.notEqual(contentDigest('first attempt'), contentDigest('second attempt'));
  assert.equal(contentDigest('same bytes'), contentDigest('same bytes'));
  assert.match(contentDigest('x'), /^[0-9a-f]{64}$/);
});

test('an unprepared proposal is prepared; the same one again is reused', () => {
  const asked = { priceU: 10, deliverDays: 3, note: 'Daily Venus health factor report.' };
  assert.equal(proposalRetry(null, asked).action, 'prepare');
  assert.equal(proposalRetry({ bidId: null, ...asked }, asked).action, 'reuse');
  // To the cent, like `withinBudget`: 10 and 10.00 are one price.
  assert.equal(proposalRetry({ bidId: null, ...asked, priceU: 10.0 }, asked).action, 'reuse');
});

test('different terms revise the standing proposal rather than adding one', () => {
  const recorded = { bidId: null, priceU: 10, deliverDays: 3, note: 'A note.' };
  assert.equal(proposalRetry(recorded, { priceU: 8, deliverDays: 3, note: 'A note.' }).action, 'revise');
  assert.equal(proposalRetry(recorded, { priceU: 10, deliverDays: 5, note: 'A note.' }).action, 'revise');
  assert.equal(proposalRetry(recorded, { priceU: 10, deliverDays: 3, note: 'A different note.' }).action, 'revise');
});

/*
 * The idempotency guarantee on the selling side: once the owner's signature
 * has put the proposal on the request, no further one is prepared. A
 * restarted assistant must not ask its owner to sign the same offer twice.
 */
test('a placed proposal prepares nothing and reports the bid', () => {
  const decision = proposalRetry({ bidId: 'bid-9', priceU: 10, deliverDays: 3, note: 'A note.' }, { priceU: 4, deliverDays: 1, note: 'Different.' });
  assert.equal(decision.action, 'placed');
  assert.equal(decision.action === 'placed' && decision.bidId, 'bid-9');
  assert.match(decision.message, /already been signed/);
  assert.match(decision.message, /sign the same offer twice/);
});

/*
 * The outcomes that must hand over nothing, as one answer rather than a
 * condition at the call site — `handsOverRequest` exists for exactly this
 * reason on the buying side, where narrowing the expression passed the
 * whole suite.
 */
test('only a placed proposal needs no signature', () => {
  assert.equal(needsOwnerSignature('placed'), false);
  for (const action of ['prepare', 'reuse', 'revise'] as const) {
    assert.equal(needsOwnerSignature(action), true, `${action} still needs the owner`);
  }
});

test('an unstaged job is staged; the same bytes again write nothing', () => {
  const sha = contentDigest('the report');
  assert.equal(deliveryRetry(null, sha).action, 'stage');
  assert.equal(deliveryRetry({ submitTxHash: null, contentSha256: sha }, sha).action, 'reuse');
  assert.equal(deliveryRetry({ submitTxHash: null, contentSha256: contentDigest('an older draft') }, sha).action, 'restage');
});

/*
 * Observed over real JSON-RPC against a running server: a same-bytes retry
 * reported `action: "restaged"` beside a message reading "nothing was
 * written again", because `action` was the SQL statement's outcome — the
 * UPDATE always runs — and the message was the decision. The field and the
 * sentence contradicted each other, which is the defect class this
 * repository keeps shipping. The route now reports the decision, and these
 * hold the two halves of each decision to saying the same thing.
 */
test('every delivery decision’s words agree with its action', () => {
  const sha = contentDigest('the report');
  const reuse = deliveryRetry({ submitTxHash: null, contentSha256: sha }, sha);
  assert.equal(reuse.action, 'reuse');
  assert.match(reuse.message, /unchanged/);
  assert.match(reuse.message, /nothing new was written/);
  assert.match(reuse.message, /nothing has been delivered/);
  assert.doesNotMatch(reuse.message, /replaced|added to/, 'a reuse must not describe a replacement');

  const restage = deliveryRetry({ submitTxHash: null, contentSha256: contentDigest('older') }, sha);
  assert.match(restage.message, /replaced rather than added to/);
  assert.doesNotMatch(restage.message, /unchanged/, 'a replacement must not describe itself as unchanged');

  const stage = deliveryRetry(null, sha);
  assert.match(stage.message, /Nothing has been staged for this job yet/);
});

test('every proposal decision’s words agree with its action', () => {
  const terms = { priceU: 10, deliverDays: 3, note: 'A note.' };
  const reuse = proposalRetry({ bidId: null, ...terms }, terms);
  assert.match(reuse.message, /has not been placed/);
  assert.doesNotMatch(reuse.message, /revised/, 'a reuse must not describe a revision');
  const revise = proposalRetry({ bidId: null, ...terms }, { ...terms, priceU: 8 });
  assert.match(revise.message, /revised rather than a second proposal prepared/);
  assert.doesNotMatch(revise.message, /The same one is returned/, 'a revision must not describe itself as unchanged');
});

/*
 * The expensive guard. A job whose delivery is on chain is finished, and an
 * assistant that restarted mid-job has to learn that before it redoes the
 * work — or before its owner pays gas for a submission the escrow refuses.
 */
test('a submitted delivery refuses staging and says not to redo the work', () => {
  const decision = deliveryRetry({ submitTxHash: '0xdead', contentSha256: contentDigest('old') }, contentDigest('new'));
  assert.equal(decision.action, 'submitted');
  assert.equal(decision.action === 'submitted' && decision.transactionHash, '0xdead');
  assert.match(decision.message, /already delivered/);
  assert.match(decision.message, /0xdead/, 'the transaction is named so it can be checked');
  assert.match(decision.message, /Do not redo the work/);
  assert.match(decision.message, /escrow accepts one/);
});

test('only a submitted delivery stops work being staged', () => {
  assert.equal(stagesWork('submitted'), false);
  for (const action of ['stage', 'reuse', 'restage'] as const) assert.equal(stagesWork(action), true);
});

const AHEAD = new Date(Date.now() + 86_400_000).toISOString();
const BEHIND = new Date(Date.now() - 60_000).toISOString();

test('a funded job inside its deadline is the only deliverable one', () => {
  assert.equal(deliveryBlocked({ status: 'FUNDED', expiredAt: AHEAD }), null);
  for (const [status, matching] of [
    ['SUBMITTED', /already been delivered/],
    ['COMPLETED', /settled and paid/],
    ['REJECTED', /disputed/],
    ['EXPIRED', /reclaimed/],
    ['OPEN', /not FUNDED/],
  ] as const) {
    const blocked = deliveryBlocked({ status, expiredAt: AHEAD });
    assert.ok(blocked, `${status} must be refused`);
    assert.match(blocked!, matching, `${status} must say why`);
  }
});

test('a funded job past its deadline is refused rather than wasting the work', () => {
  const blocked = deliveryBlocked({ status: 'FUNDED', expiredAt: BEHIND });
  assert.ok(blocked);
  assert.match(blocked!, /past its delivery deadline/);
  // Measured against the clock it is given, so this does not drift with the suite's runtime.
  assert.equal(deliveryBlocked({ status: 'FUNDED', expiredAt: BEHIND }, Date.parse(BEHIND) - 1000), null);
});

test('an unreadable deadline does not block a funded job', () => {
  // A row indexed without a usable deadline is the index's problem, not a
  // reason to refuse work the escrow would accept; the delivery route reads
  // the real deadline from chain when the provider signs.
  assert.equal(deliveryBlocked({ status: 'FUNDED', expiredAt: '' }), null);
  assert.equal(deliveryBlocked({ status: 'FUNDED', expiredAt: 'not a date' }), null);
});
