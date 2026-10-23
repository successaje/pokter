import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  attachDeliverySubmission,
  attachProposalBid,
  ensureProviderWork,
  readStagedDelivery,
  readStagedProposal,
  stageDelivery,
  stageProposal,
  stagedDeliveriesFor,
  stagedDeliveryForJob,
  stagedProposalsFor,
} from '../src/lib/assistant/provider-store';
import {
  contentDigest,
  deliveryKey,
  deliveryRetry,
  proposalKey,
  proposalRetry,
} from '../src/lib/assistant/provider-work';

/*
 * Against a real file, because what has to be proven is a property of the
 * SQL: that two calls for one proposal leave one row, that two calls for
 * one delivery leave one row, and that a job already delivered can never be
 * staged again.
 *
 * The last of those is the one the product cannot afford to get wrong. A
 * second delivery is gas spent on a transaction the escrow refuses, and a
 * restarted assistant that does not discover the work is done redoes it
 * first and finds out after.
 */
function fresh() {
  const dir = mkdtempSync(join(tmpdir(), 'pokter-provider-'));
  const db = new DatabaseSync(join(dir, 'provider.db'));
  db.exec('PRAGMA journal_mode = WAL;');
  ensureProviderWork(db);
  return { db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true }); } };
}

const OWNER = '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01';
const OTHER = '0x2222222222222222222222222222222222222222';
const PROPOSAL = { owner: OWNER, requestId: 'req-1', agentChainId: 97, agentTokenId: '4' };
const DELIVERY = { owner: OWNER, chainId: 97, jobId: '1502' };
const KEY = proposalKey(PROPOSAL);
const DKEY = deliveryKey(DELIVERY);

const countProposals = (db: DatabaseSync) => Number((db.prepare('SELECT COUNT(*) AS n FROM staged_proposals').get() as { n: number }).n);
const countDeliveries = (db: DatabaseSync) => Number((db.prepare('SELECT COUNT(*) AS n FROM staged_deliveries').get() as { n: number }).n);

const write = (over: Partial<{ priceU: number; deliverDays: number; note: string; at: string }> = {}) => ({
  key: KEY,
  ...PROPOSAL,
  priceU: over.priceU ?? 10,
  deliverDays: over.deliverDays ?? 3,
  note: over.note ?? 'Daily Venus health factor report.',
  at: over.at ?? '2026-06-01T10:00:00.000Z',
});

const dwrite = (content: string, at = '2026-06-01T10:00:00.000Z') => ({
  key: DKEY,
  ...DELIVERY,
  content,
  contentSha256: contentDigest(content),
  at,
});

test('ensureProviderWork is safe to run again on an existing database', () => {
  const { db, cleanup } = fresh();
  try {
    stageProposal(db, write());
    stageDelivery(db, dwrite('a report'));
    ensureProviderWork(db);
    ensureProviderWork(db);
    assert.ok(readStagedProposal(db, KEY));
    assert.ok(readStagedDelivery(db, DKEY));
  } finally {
    cleanup();
  }
});

test('two calls for one proposal leave one row', () => {
  const { db, cleanup } = fresh();
  try {
    assert.equal(stageProposal(db, write()), 'recorded');
    assert.equal(stageProposal(db, write({ at: '2026-06-01T10:05:00.000Z' })), 'revised');
    assert.equal(countProposals(db), 1, 'a retry must not become a second offer');
    const row = readStagedProposal(db, KEY);
    assert.equal(row!.state, 'awaiting-owner-signature');
    assert.equal(row!.priceU, 10);
    assert.equal(row!.lastSeenAt, '2026-06-01T10:05:00.000Z', 'the retry is noted');
    assert.equal(row!.preparedAt, '2026-06-01T10:00:00.000Z', 'the first preparation stands');
    assert.equal(row!.owner, OWNER.toLowerCase(), 'stored lower-cased, so one wallet is one wallet');
  } finally {
    cleanup();
  }
});

test('revising a proposal moves its terms and still leaves one row', () => {
  const { db, cleanup } = fresh();
  try {
    stageProposal(db, write({ priceU: 10 }));
    assert.equal(stageProposal(db, write({ priceU: 8, note: 'Cheaper.' })), 'revised');
    assert.equal(countProposals(db), 1);
    const row = readStagedProposal(db, KEY);
    assert.equal(row!.priceU, 8);
    assert.equal(row!.note, 'Cheaper.');
  } finally {
    cleanup();
  }
});

/*
 * INVERT THE GUARD TO CHECK THIS TEST: drop `AND bid_id IS NULL` from the
 * `UPDATE` in `stageProposal` and this fails. Once the owner has signed,
 * the terms they signed are the record: an assistant must not be able to
 * revise them out from under a proposal already on the request.
 */
test('a signed proposal’s terms cannot be revised underneath it', () => {
  const { db, cleanup } = fresh();
  try {
    stageProposal(db, write({ priceU: 10 }));
    assert.equal(attachProposalBid(db, KEY, 'bid-1'), 'attached');
    assert.equal(stageProposal(db, write({ priceU: 1 })), 'already-placed');
    const row = readStagedProposal(db, KEY);
    assert.equal(row!.priceU, 10, 'the signed price stands');
    assert.equal(row!.state, 'placed');
    assert.equal(row!.bidId, 'bid-1');
    assert.equal(countProposals(db), 1);
  } finally {
    cleanup();
  }
});

/*
 * INVERT THE GUARD TO CHECK THIS TEST: drop `AND bid_id IS NULL` from
 * `attachProposalBid`'s `UPDATE` and the re-attach below stops being
 * refused. A late or duplicated report must not move a staged proposal
 * from the bid it became to another one.
 */
test('a staged proposal names one bid, and keeps naming it', () => {
  const { db, cleanup } = fresh();
  try {
    stageProposal(db, write());
    assert.equal(attachProposalBid(db, KEY, 'bid-1'), 'attached');
    assert.equal(attachProposalBid(db, KEY, 'bid-1'), 'already-attached', 'a duplicated report is not an error');
    assert.equal(attachProposalBid(db, KEY, 'bid-2'), 'claimed-by-another-proposal');
    assert.equal(readStagedProposal(db, KEY)!.bidId, 'bid-1');
    assert.equal(attachProposalBid(db, 'ppr_nothing', 'bid-3'), 'no-such-proposal');
  } finally {
    cleanup();
  }
});

/*
 * The unique index, which is the same rule the bids table enforces: one
 * standing offer per agent per request. Without it, an assistant that lost
 * its key could stage a second proposal for work it had already offered.
 */
test('one request and agent hold one proposal, whatever key is used', () => {
  const { db, cleanup } = fresh();
  try {
    stageProposal(db, write());
    /* Reported as a conflict and not as this caller's own retry. Both
       produce zero inserted rows, and telling the second caller its
       proposal was "already placed" would be a claim about somebody
       else's row. */
    assert.equal(stageProposal(db, { ...write(), key: 'ppr_a_different_key_entirely' }), 'conflict');
    assert.equal(countProposals(db), 1, 'the database refuses a second row for one request and agent');
    assert.equal(readStagedProposal(db, 'ppr_a_different_key_entirely'), null);
  } finally {
    cleanup();
  }
});

test('a listing is one wallet’s, newest first', () => {
  const { db, cleanup } = fresh();
  try {
    stageProposal(db, write({ at: '2026-06-01T10:00:00.000Z' }));
    stageProposal(db, {
      ...write({ at: '2026-06-02T10:00:00.000Z' }),
      key: proposalKey({ ...PROPOSAL, requestId: 'req-2' }),
      requestId: 'req-2',
    });
    stageProposal(db, { ...write(), key: proposalKey({ ...PROPOSAL, owner: OTHER }), owner: OTHER });
    assert.deepEqual(stagedProposalsFor(db, OWNER).map((p) => p.requestId), ['req-2', 'req-1']);
    assert.equal(stagedProposalsFor(db, OTHER).length, 1);
    assert.equal(stagedProposalsFor(db, OWNER.toLowerCase()).length, 2, 'spelling of the wallet is not identity');
  } finally {
    cleanup();
  }
});

test('two calls for one delivery leave one row', () => {
  const { db, cleanup } = fresh();
  try {
    assert.equal(stageDelivery(db, dwrite('the finished report')), 'recorded');
    assert.equal(stageDelivery(db, dwrite('the finished report', '2026-06-01T10:05:00.000Z')), 'restaged');
    assert.equal(countDeliveries(db), 1);
    const row = readStagedDelivery(db, DKEY);
    assert.equal(row!.state, 'awaiting-wallet-signature');
    assert.equal(row!.content, 'the finished report');
    assert.equal(row!.contentSha256, contentDigest('the finished report'));
    assert.equal(row!.submitTxHash, null, 'nothing is submitted by staging it');
  } finally {
    cleanup();
  }
});

test('restaging replaces an unsigned draft rather than adding to it', () => {
  const { db, cleanup } = fresh();
  try {
    stageDelivery(db, dwrite('first attempt'));
    assert.equal(stageDelivery(db, dwrite('second attempt')), 'restaged');
    assert.equal(countDeliveries(db), 1, 'one job has one delivery');
    assert.equal(readStagedDelivery(db, DKEY)!.content, 'second attempt');
  } finally {
    cleanup();
  }
});

/*
 * The guard that matters most.
 *
 * INVERT IT TO CHECK THIS TEST: drop `AND submit_tx_hash IS NULL` from the
 * `UPDATE` in `stageDelivery` and this fails. The hosted manifest has to
 * keep matching the hash committed on chain, so bytes that have been
 * submitted can never be replaced — and an assistant must be told the work
 * is done rather than offered a way to overwrite it.
 */
test('a delivered job cannot be staged again, and its bytes cannot be replaced', () => {
  const { db, cleanup } = fresh();
  try {
    stageDelivery(db, dwrite('the delivered report'));
    assert.equal(attachDeliverySubmission(db, DKEY, '0xabc'), 'attached');
    assert.equal(stageDelivery(db, dwrite('a rewrite after the fact')), 'already-submitted');
    const row = readStagedDelivery(db, DKEY);
    assert.equal(row!.content, 'the delivered report', 'the committed bytes stand');
    assert.equal(row!.contentSha256, contentDigest('the delivered report'));
    assert.equal(row!.state, 'submitted');
    assert.equal(row!.submitTxHash, '0xabc');
    assert.equal(countDeliveries(db), 1);
  } finally {
    cleanup();
  }
});

test('a submission is recorded once and never moved', () => {
  const { db, cleanup } = fresh();
  try {
    stageDelivery(db, dwrite('a report'));
    assert.equal(attachDeliverySubmission(db, DKEY, '0xabc'), 'attached');
    assert.equal(attachDeliverySubmission(db, DKEY, '0xabc'), 'already-attached');
    assert.equal(attachDeliverySubmission(db, DKEY, '0xdef'), 'already-attached');
    assert.equal(readStagedDelivery(db, DKEY)!.submitTxHash, '0xabc');
    assert.equal(attachDeliverySubmission(db, 'pdl_nothing', '0xabc'), 'no-such-delivery');
  } finally {
    cleanup();
  }
});

test('one job holds one delivery, whoever staged it', () => {
  const { db, cleanup } = fresh();
  try {
    stageDelivery(db, dwrite('mine'));
    /* Two wallets' automation on one job is reachable: the index is on the
       job alone where the key carries the owner too. The second is told
       one job has one delivery, not that its own was submitted. */
    assert.equal(
      stageDelivery(db, { ...dwrite('theirs'), key: deliveryKey({ ...DELIVERY, owner: OTHER }), owner: OTHER }),
      'conflict',
    );
    assert.equal(countDeliveries(db), 1);
    assert.equal(readStagedDelivery(db, deliveryKey({ ...DELIVERY, owner: OTHER })), null);
    // And the row is findable by the job, which is how that is reported rather than retried.
    const found = stagedDeliveryForJob(db, 97, '1502');
    assert.equal(found!.owner, OWNER.toLowerCase());
    assert.equal(stagedDeliveryForJob(db, 56, '1502'), null, 'the other escrow’s job 1502 is a different job');
    assert.equal(stagedDeliveriesFor(db, OTHER).length, 0);
  } finally {
    cleanup();
  }
});

/*
 * The scenario the whole design is for, run end to end against the real
 * statements: an assistant prepares work, loses everything it knew, and
 * comes back.
 */
test('a crashed and restarted assistant does not redo work or re-ask for a signature', () => {
  const { db, cleanup } = fresh();
  try {
    // --- first run ---
    stageProposal(db, write({ priceU: 10 }));
    stageDelivery(db, dwrite('the finished report'));
    // The owner signs the proposal and the provider wallet delivers, both
    // somewhere this process never sees.
    attachProposalBid(db, KEY, 'bid-77');
    attachDeliverySubmission(db, DKEY, '0xfeed');

    // --- the assistant restarts, knowing only what it can re-derive ---
    const proposalAgain = proposalKey(PROPOSAL);
    const deliveryAgain = deliveryKey(DELIVERY);
    assert.equal(proposalAgain, KEY, 'the key is re-derivable from the work itself');
    assert.equal(deliveryAgain, DKEY);

    const proposalDecision = proposalRetry(readStagedProposal(db, proposalAgain), { priceU: 10, deliverDays: 3, note: 'Daily Venus health factor report.' });
    assert.equal(proposalDecision.action, 'placed', 'it must not ask for a second signature');
    assert.equal(proposalDecision.action === 'placed' && proposalDecision.bidId, 'bid-77');

    const row = readStagedDelivery(db, deliveryAgain);
    const deliveryDecision = deliveryRetry(row, contentDigest('a fresh attempt at the same work'));
    assert.equal(deliveryDecision.action, 'submitted', 'it must not redo the work');
    assert.equal(deliveryDecision.action === 'submitted' && deliveryDecision.transactionHash, '0xfeed');

    // And nothing it does next can add a row.
    assert.equal(stageProposal(db, write({ priceU: 10 })), 'already-placed');
    assert.equal(stageDelivery(db, dwrite('a fresh attempt at the same work')), 'already-submitted');
    assert.equal(countProposals(db), 1);
    assert.equal(countDeliveries(db), 1);
    assert.equal(readStagedDelivery(db, DKEY)!.content, 'the finished report');
  } finally {
    cleanup();
  }
});
