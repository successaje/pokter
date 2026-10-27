import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { jobNextStep } from '../src/features/workspace/phase';
import { readDeliveredAnswer, toneOf } from '../src/lib/delivery/answer';
import type { HiredJob } from '../src/lib/erc8183/types';

/*
 * The flows a reviewer found awkward: an answer that opened on "no
 * summary" with its verdict fourth, a jobs list that did not say what to
 * do next, a passkey wallet offered for hires it cannot fund, and
 * verifying a builder wallet by way of another page.
 */

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

/** Touchstone's token check, as it delivers it. */
const tokenCheck = JSON.stringify({
  response: {
    content: JSON.stringify({
      token: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
      name: 'PancakeSwap Token',
      symbol: 'Cake',
      verdict: 'Caution',
      reasons: [
        { level: 'ok', finding: 'Buys and sells freely in simulation.' },
        { level: 'caution', finding: 'An active owner can call: mint.' },
      ],
      measured: { buy_tax_pct: 0, sell_tax_pct: 0 },
      as_of: { time: '2026-10-26T22:21:54Z', block: 129976630 },
      sources: ['Token contract read at block 129976630'],
      not_checked: ['The full holder list.'],
    }),
  },
  metadata: { producer: 'Touchstone by Pokter' },
});

test('a verdict, its reasons and what was not checked lead the answer; the data follows', () => {
  const a = readDeliveredAnswer(tokenCheck);
  assert.deepEqual(a.verdict, { text: 'Caution', tone: 'watch' });
  assert.deepEqual(a.reasons, [
    { text: 'Buys and sells freely in simulation.', tone: 'ok' },
    { text: 'An active owner can call: mint.', tone: 'watch' },
  ]);
  assert.deepEqual(a.limitations, ['The full holder list.']);
  assert.deepEqual(a.fields.map((f) => f.label), ['token', 'name', 'symbol', 'measured'], 'verdict, reasons and not_checked are not repeated as data');
});

test('only words Pokter recognises colour a verdict; a paragraph is not a verdict', () => {
  assert.equal(toneOf('Safe'), 'ok');
  assert.equal(toneOf('AVOID'), 'bad');
  assert.equal(toneOf('Moderate'), 'watch');
  assert.equal(toneOf('Interesting'), null);
  const long = readDeliveredAnswer(JSON.stringify({ response: { content: { verdict: 'This token looks fine overall but the owner can still mint new supply at will.' } } }));
  assert.equal(long.verdict, null);
  assert.deepEqual(long.fields.map((f) => f.label), ['verdict'], 'kept as data rather than dropped');
});

test('the answer view leads with the verdict and keeps colour from being the only signal', () => {
  const view = code('features/delivery/AnswerView.tsx');
  const at = (s: string) => view.indexOf(s);
  assert.ok(at('answer.verdict &&') < at('answer.reasons.length > 0 &&'));
  assert.ok(at('answer.reasons.length > 0 &&') < at('{led ? \'The data behind it\''));
  assert.match(view, /<span className="sr-only">\{TONE\[r\.tone\]\.said\}: <\/span>/);
});

const now = Date.parse('2026-10-27T12:00:00Z');
const job = (over: Partial<HiredJob>) => ({ status: 'FUNDED', expiredAt: '2026-10-27T15:30:00Z', reclaimTxHash: null, disputeTxHash: null, ...over }) as HiredJob;

test('each row in My jobs says the next deadline or action, never an unlabelled date', () => {
  assert.deepEqual(jobNextStep(job({}), now), { text: 'Delivery due in 3h 30m', act: false });
  assert.deepEqual(jobNextStep(job({ status: 'SUBMITTED' }), now), { text: 'Answer delivered: check it', act: true });
  assert.deepEqual(jobNextStep(job({ expiredAt: '2026-10-27T11:00:00Z' }), now), { text: 'Reclaim your escrow', act: true });
  assert.deepEqual(jobNextStep(job({ status: 'SUBMITTED', disputeTxHash: '0xd15' }), now), { text: 'Voters deciding', act: false });
  assert.deepEqual(jobNextStep(job({ status: 'COMPLETED' }), now), { text: 'Nothing to do', act: false });
  assert.doesNotMatch(code('features/workspace/parts.tsx'), /toLocaleDateString\(\)/);
});

test('the job page puts the review date beside the status, and says "Your move" only to the funding wallet', () => {
  const page = code('features/workspace/JobDetail.tsx');
  assert.match(page, /`Delivered · review by \$\{review\.closes\}`/);
  assert.match(page, /meta\.needsYou && owned \? 'Your move' : 'Status'/);
  assert.match(code('features/workspace/JobAnswer.tsx'), /utcWhen\(value\) \?\? value/);
});

test('a passkey wallet is offered only where it can fund the hire, and says which network it works on', () => {
  const sheet = code('shell/wallet/ConnectProvider.tsx');
  assert.match(sheet, /tag=\{PASSKEY_NETWORK_ONLY \? `\$\{chainLabel\(WALLET_NETWORK\.chainId\)\} only` : undefined\}/);
  assert.match(sheet, /Needed for hires on \$\{chainLabel/);
  assert.doesNotMatch(sheet, /Pokter covers the fee for hires/);
  assert.match(sheet, /\$\{sponsored \? ', and Pokter tops up its network fee when it runs short' : ''\}/);
  const hire = code('features/hire/HireFlow.tsx');
  assert.match(hire, /escrowChainId !== WALLET_NETWORK\.chainId\s*\?\s*`This hire is paid with real funds on/);
  assert.equal((hire.match(/passkeyBlocked \? \{ passkeyUnavailable: passkeyBlocked \} : undefined/g) ?? []).length, 2, 'both connect buttons on the hire close the passkey option');
  assert.doesNotMatch(code('app/(site)/agents/[chainId]/[tokenId]/page.tsx'), /Covered by Pokter for passkey wallets where available/);
});

test('a builder verifies in place and stays on the page they asked for', () => {
  const verify = code('features/studio/VerifyOwner.tsx');
  assert.match(verify, /router\.refresh\(\)/);
  assert.doesNotMatch(verify, /router\.push/);
  assert.match(code('features/studio/SignedOut.tsx'), /action=\{<VerifyOwner \/>\}/);
  assert.doesNotMatch(code('features/studio/SignedOut.tsx'), /href="\/build\/import"/);
  const overview = code('app/(site)/build/(section)/page.tsx');
  const start = overview.slice(overview.indexOf('function Start()'), overview.indexOf('function Choice('));
  assert.doesNotMatch(start, /StatStrip/, 'no empty figures before the choices');
  assert.match(start, /title="Import one by its ID"/);
  assert.match(start, /title="Create a new agent"/);
  assert.doesNotMatch(code('app/(site)/build/(section)/new/page.tsx'), /title: 'Import an existing agent'/);
});

test('the workspace sidebar opens with its labels on a wide screen', () => {
  const frame = code('shell/WorkspaceFrame.tsx');
  assert.match(frame, /useState\(true\)/);
  assert.match(frame, /stored === '0' \|\| \(stored === null && window\.innerWidth < WIDE\)/);
});
