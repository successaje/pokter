import assert from 'node:assert/strict';
import test from 'node:test';

import { checkFromFailure, checkFromPreflight, covers, fundingBlock, type BriefCheck, type HireBinding } from '../src/lib/hire/brief-check';

const confirmedFor: HireBinding = {
  agentChainId: 56,
  agentTokenId: '367904',
  provider: '0xAbC0000000000000000000000000000000000001',
  escrowChainId: 56,
  task: 'Report on account 0x1111111111111111111111111111111111111111',
};
const compiled = { ok: true, payload: confirmedFor.task, missing: [] };
const accepted: BriefCheck = { state: 'accepted', by: 'signed-quote' };
const ready = { compiled, confirmed: true, changed: [], check: accepted, overridden: false, agentName: 'Vitals' };

test('a confirmation, quote or check covers only the exact request it was given for', () => {
  assert.equal(covers(confirmedFor, { ...confirmedFor }), true);
  assert.equal(covers(confirmedFor, { ...confirmedFor, provider: confirmedFor.provider.toLowerCase() }), true, 'address case is not an edit');
  assert.equal(covers(null, confirmedFor), false);
});

test('editing the brief, the agent or the network invalidates the old confirmation and quote, and funding stops', () => {
  const edits: Array<[string, Partial<HireBinding>]> = [
    ['brief', { task: `${confirmedFor.task}, and its last 30 days` }],
    ['agent token', { agentTokenId: '367905' }],
    ['agent registry chain', { agentChainId: 97 }],
    ['provider', { provider: '0xAbC0000000000000000000000000000000000002' }],
    ['network', { escrowChainId: 97 }],
  ];
  for (const [what, edit] of edits) {
    const now = { ...confirmedFor, ...edit };
    /* The hook derives each of these from `covers`; none is cleared by hand. */
    const confirmation = covers(confirmedFor, now);
    const quote: BriefCheck | null = covers(confirmedFor, now) ? accepted : null;
    assert.equal(confirmation, false, `${what}: the confirmation still counted`);
    assert.equal(quote, null, `${what}: the quote still counted`);
    const block = fundingBlock({ ...ready, confirmed: confirmation, check: quote });
    assert.equal(block?.code, 'request-unconfirmed', `${what}: funding was not stopped`);
  }
});

test('an override is for one request: an edit after ticking it does not carry it over', () => {
  const unverified: BriefCheck = { state: 'unverified', message: 'Vitals could not be asked.', overridable: true };
  const overrideFor = confirmedFor;
  assert.equal(fundingBlock({ ...ready, check: unverified, overridden: covers(overrideFor, confirmedFor) }), null);
  const edited = { ...confirmedFor, escrowChainId: 97 };
  const block = fundingBlock({ ...ready, check: unverified, overridden: covers(overrideFor, edited) });
  assert.equal(block?.code, 'check-unverified');
});

test('accepted, declined and unverified are kept apart, from the preflight', () => {
  assert.deepEqual(checkFromPreflight({ brief: {}, accepted: { answered: true, failure: null } }, 'Vitals'), { state: 'accepted', by: 'agent-answered' });

  /* No card: the route passes it, and that is not an acceptance. */
  const noCard = checkFromPreflight({ brief: null, accepted: null }, 'Vitals');
  assert.equal(noCard.state, 'unverified');
  assert.match(noCard.state === 'unverified' ? noCard.message : '', /could not read Vitals's agent card/);

  /* Not asked: answered false is never read as a yes. */
  const notAsked = checkFromPreflight({ brief: {}, accepted: { answered: false, failure: 'no-price-skill' } }, 'Vitals');
  assert.deepEqual(notAsked.state === 'unverified' && notAsked.overridable, true);
  assert.match(notAsked.state === 'unverified' ? notAsked.message : '', /publishes no way to answer/);

  /* A response with no `accepted` at all is unverified too, never a pass by omission. */
  assert.equal(checkFromPreflight({ brief: {} }, 'Vitals').state, 'unverified');
});

test('a refusal is a decline when the agent said no, a question when an input is missing, and unverified otherwise', () => {
  assert.deepEqual(checkFromFailure({ message: 'Vitals declined this brief: “no account”', code: 'seller-declined' }), {
    state: 'declined',
    message: 'Vitals declined this brief: “no account”',
  });
  assert.equal(checkFromFailure({ message: 'x', code: 'brief-declined' })?.state, 'declined');
  for (const code of ['subject-missing', 'subject-ambiguous', 'brief-incomplete', 'invalid-task', 'brief-too-short']) {
    assert.equal(checkFromFailure({ message: 'x', code }), null, code);
  }
  /* Timeouts and outages: unverified, and never overridable — the check did not run, or no signed price came back. */
  for (const code of ['timeout', 'unreachable', 'no-quote', null]) {
    assert.deepEqual(checkFromFailure({ message: 'x', code }), { state: 'unverified', message: 'x', overridable: false }, String(code));
  }
});

test('funding refuses known missing inputs, unconfirmed requests, declines and unchecked briefs, in that order', () => {
  assert.equal(fundingBlock({ ...ready, compiled: null })?.code, 'request-unchecked');
  const missing = fundingBlock({ ...ready, compiled: { ok: false, payload: null, missing: [{ label: 'account to report on' }] } });
  assert.equal(missing?.code, 'inputs-missing');
  assert.match(missing?.message ?? '', /needs account to report on/);
  assert.equal(fundingBlock({ ...ready, compiled: { ok: false, payload: null, missing: [] } })?.code, 'inputs-invalid');
  assert.equal(fundingBlock({ ...ready, changed: ['account to report on'] })?.code, 'request-changed');
  assert.equal(fundingBlock({ ...ready, confirmed: false })?.code, 'request-unconfirmed');
  assert.equal(fundingBlock({ ...ready, check: null })?.code, 'not-checked');

  const declined = fundingBlock({ ...ready, check: { state: 'declined', message: 'Vitals declined this brief without saying why.' }, overridden: true });
  assert.equal(declined?.code, 'brief-declined', 'a decline cannot be overridden');

  const overridable: BriefCheck = { state: 'unverified', message: 'Vitals could not be asked.', overridable: true };
  assert.equal(fundingBlock({ ...ready, check: overridable })?.code, 'check-unverified', 'unverified is not acceptance');
  assert.equal(fundingBlock({ ...ready, check: overridable, overridden: true }), null, 'the buyer said, for this request');

  const fixed: BriefCheck = { state: 'unverified', message: 'No signed price came back.', overridable: false };
  assert.equal(fundingBlock({ ...ready, check: fixed, overridden: true })?.code, 'check-unverified', 'an override cannot stand in for a check that did not run');

  assert.equal(fundingBlock(ready), null);
  assert.equal(fundingBlock({ ...ready, check: { state: 'accepted', by: 'agent-answered' } }), null);
});
