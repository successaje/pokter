import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { PAYMENT_TERMS } from '../src/lib/erc8183/payment-terms';

/*
 * The escrow moves money only when someone sends a transaction, and from a
 * job's deadline anyone may send its refund. Pages said the payment
 * "releases when the window closes", and the risk disclosure said
 * reclaiming is "an action you take; nobody does it for you".
 */

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
/** What a page says, without the comments that record what it used to say. */
const said = (path: string) => code(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

test('the buyer’s step and the panel line say someone settles, and that an unsettled job can be refunded', () => {
  for (const line of [PAYMENT_TERMS.review, PAYMENT_TERMS.held]) {
    assert.doesNotMatch(line, /payment releases|until it delivers and the review window passes/);
    assert.match(line, /anyone can settle the job and the agent is paid/);
  }
  /* The home rail's step is a sentence, and says the same. */
  assert.match(PAYMENT_TERMS.reviewBrief, /After the window, anyone can settle the job and pay the agent\.$/);
  assert.match(readFileSync(new URL('../src/features/home/StepRail.tsx', import.meta.url), 'utf8'), /body: PAYMENT_TERMS\.reviewBrief,/);
  assert.match(PAYMENT_TERMS.review, /Past the deadline, anyone can refund a job still unsettled, always to you\./);
});

test('the guides say who settles: the buyer’s guide by the shared terms, the seller’s with its deadline', () => {
  const hire = said('app/(site)/guides/hire-an-agent/page.tsx');
  assert.doesNotMatch(hire, /otherwise payment releases/);
  assert.match(hire, /to dispute\. \{PAYMENT_TERMS\.silence\} \{PAYMENT_TERMS\.undelivered\}/);

  const list = said('app/(site)/guides/list-your-agent/page.tsx');
  assert.doesNotMatch(list, /released after you deliver/);
  assert.match(list, /you or anyone else can settle the job and you are paid\. Settle it before the job&rsquo;s deadline: after that, anyone can refund the buyer instead\./);
});

test('the risk disclosure says anyone may send the refund, and only to the funding wallet', () => {
  const risk = said('app/(site)/(legal)/risk/page.tsx');
  assert.doesNotMatch(risk, /nobody does it for you/);
  assert.doesNotMatch(risk, /you can reclaim\s+the escrow/);
  assert.match(risk, /From then anyone may\s+send the refund, you included, and it always goes to the wallet that\s+funded the job\./);
  assert.match(risk, /anyone can send\s+the refund to you, and whichever transaction lands first decides/);

  const terms = said('app/(site)/(legal)/terms/page.tsx');
  assert.doesNotMatch(terms, /freeze, refund or recover/);
  assert.match(terms, /the escrow lets anyone send its refund,\s+and pays it only to the wallet that funded the job\./);
});
