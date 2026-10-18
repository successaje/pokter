import assert from 'node:assert/strict';
import test from 'node:test';

import { feedbackMessage, normaliseFeedback, validFeedbackContent } from '../src/lib/feedback/model';

test('a contact is kept only when a follow-up was agreed to', () => {
  assert.equal(normaliseFeedback({ answered: 'partly', reason: ' missing the grid count ', followUp: false, contact: 'me@example.com' }).contact, '');
  const agreed = normaliseFeedback({ answered: 'no', reason: '', followUp: true, contact: ' @handle ' });
  assert.equal(agreed.contact, '@handle');
  assert.equal(normaliseFeedback({ answered: 'yes', reason: '  ok  ', followUp: false, contact: '' }).reason, 'ok');
});

test('the signed message names the job and the answer, and leaves out an unagreed contact', () => {
  const message = feedbackMessage({ chainId: 56, jobId: '57016', content: { answered: 'partly', reason: 'used defaults', followUp: false, contact: 'me@example.com' } });
  assert.match(message, /ERC-8183 job: 57016/);
  assert.match(message, /Answered the question: partly/);
  assert.match(message, /Contact: \(none\)/);
  assert.doesNotMatch(message, /me@example\.com/);
});

test('only the three answers are accepted', () => {
  assert.equal(validFeedbackContent({ answered: 'yes', reason: '', followUp: false, contact: '' }), true);
  assert.equal(validFeedbackContent({ answered: 'maybe', reason: '', followUp: false, contact: '' }), false);
  assert.equal(validFeedbackContent({ answered: 'yes', reason: 1, followUp: false, contact: '' }), false);
});
