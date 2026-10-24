import assert from 'node:assert/strict';
import test from 'node:test';

import { noticeReplyData, readNoticeReply } from '../src/lib/erc8183/notice-reply';

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
  /* "working" was unreadable here until 24 October: a seller at work on the job has taken it (see below). */
  assert.equal(readNoticeReply({ status: 'working' })?.status, 'accepted');
  assert.equal(readNoticeReply({ job_id: 1 }), null);
  assert.equal(readNoticeReply(null), null);
});

test('a seller that answers with a bare JSON-RPC result is read, and its delivery accepted', async () => {
  const { noticeReplyData } = await import('../src/lib/erc8183/notice-reply');
  // Brain on BNB's actual reply to notify_funded for job 57016.
  const payload = { jsonrpc: '2.0', id: 'x', result: { already_delivered: true, job_id: '57016', status: 'SUBMITTED', deliverable_url: 'https://agent.brainonbnb.com/job/57016/result', result: { service: 'grid_plan' } } };
  const data = noticeReplyData(payload);
  assert.ok(data);
  assert.deepEqual(readNoticeReply(data), { status: 'accepted', reason: null, deliverableUrl: 'https://agent.brainonbnb.com/job/57016/result' });
  // The usual A2A message shape still goes through the A2A reader.
  const message = { jsonrpc: '2.0', id: 'y', result: { kind: 'message', parts: [{ kind: 'data', data: { status: 'accepted', job_id: 1 } }] } };
  assert.equal(readNoticeReply(noticeReplyData(message))?.status, 'accepted');
});

test('an acknowledgement is an acceptance, and keeps the deliverable URL it names', () => {
  /* Mandate Guard-1's answer to job 57071 on 24 October, verbatim. It delivered within the minute. */
  const mandate = {
    jsonrpc: '2.0',
    id: 'x',
    result: {
      kind: 'message',
      role: 'agent',
      messageId: 'm',
      parts: [{ kind: 'data', data: { received: true, job_id: 57071, deliverable_url: 'https://www.mandatemarkets.com/api/escrow/jobs/57071/deliverable', estimated_completion_seconds: 60 } }],
    },
  };
  assert.deepEqual(readNoticeReply(noticeReplyData(mandate)), {
    status: 'accepted',
    reason: null,
    deliverableUrl: 'https://www.mandatemarkets.com/api/escrow/jobs/57071/deliverable',
  });
  for (const status of ['received', 'processing', 'in_progress', 'FUNDED', 'queued']) {
    assert.equal(readNoticeReply({ job_id: 1, status })?.status, 'accepted', status);
  }
  assert.equal(readNoticeReply({ accepted: true })?.status, 'accepted');
});

test('only words of refusal are a refusal, and an answer that says neither stays unread', () => {
  for (const reply of [{ status: 'declined', reason: 'busy' }, { status: 'refused' }, { accepted: false, reason: 'no quote' }]) {
    assert.equal(readNoticeReply(reply)?.status, 'rejected');
  }
  assert.equal(readNoticeReply({ status: 'declined', reason: 'busy' })?.reason, 'busy');
  assert.equal(readNoticeReply({ job_id: 1, note: 'thanks' }), null);
  assert.equal(readNoticeReply({ status: 'unknown' }), null);
  assert.equal(readNoticeReply({ received: 'yes' }), null, 'a boolean, not any truthy word');
});
