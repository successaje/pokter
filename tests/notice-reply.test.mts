import assert from 'node:assert/strict';
import test from 'node:test';

import { readNoticeReply } from '../src/lib/erc8183/notice-reply';

test('the reference answer is read as given', () => {
  assert.deepEqual(readNoticeReply({ status: 'accepted', job_id: 1 }), { status: 'accepted', reason: null, deliverableUrl: null });
  assert.deepEqual(readNoticeReply({ status: 'rejected', reason: 'Needs a token address.' }), { status: 'rejected', reason: 'Needs a token address.', deliverableUrl: null });
});

test('a seller that already delivered has accepted, and its URL is kept', () => {
  // Brain on BNB's answer for job 57016, trimmed: delivered before it replied.
  const reply = { already_delivered: true, job_id: '57016', status: 'SUBMITTED', deliverable_url: 'https://agent.brainonbnb.com/job/57016/result', result: { service: 'grid_plan' } };
  assert.deepEqual(readNoticeReply(reply), { status: 'accepted', reason: null, deliverableUrl: 'https://agent.brainonbnb.com/job/57016/result' });
  // The on-chain status alone says the same.
  assert.equal(readNoticeReply({ status: 'Completed' })?.status, 'accepted');
});

test('an answer naming no outcome is still unreadable', () => {
  assert.equal(readNoticeReply({ status: 'working' }), null);
  assert.equal(readNoticeReply({ job_id: 1 }), null);
  assert.equal(readNoticeReply(null), null);
});
