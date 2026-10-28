import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { approxTotalView, approxUsdTotal, formatUsd, type MoneyLine } from '../src/lib/money/approx-total';
import { totalLines } from '../src/features/workspace/totals';
import { earnedByToken, earnedMoneyLines, earningsNote } from '../src/lib/builder/earnings';
import { knownTokens } from '../src/lib/network/tokens';

/*
 * A total over several tokens as one figure: dollar stablecoins on BNB Chain
 * counted at $1 each and labelled approximate, every exact amount behind it,
 * and test money, unread currencies and unpegged tokens never added in.
 */

const U56 = '0xcE24439F2D9C6a2289F741120FE202248B666666';
const U97 = '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565';
const USDT56 = '0x55d398326f99059fF775485246999027B3197955';
const USDC56 = '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d';
const USD156 = '0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d';
const E16 = 10n ** 16n;
const line = (chainId: number, token: string | null, raw: bigint, text: string, decimals: number | null = 18): MoneyLine => ({ key: `${chainId}:${token}`, text, chainId, token, raw, decimals });
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('several dollar stablecoins are one approximate figure, with every exact amount kept', () => {
  const total = approxUsdTotal([
    line(56, U56, 35n * E16, '0.35 $U'),
    line(56, USDT56, 10n * E16, '0.1 USDT'),
    line(56, USDC56, 10n * E16, '0.1 USDC'),
    line(56, USD156, 10n * E16, '0.1 USD1'),
    line(97, U97, 20n * E16, '0.2 test $U'),
  ]);
  assert.equal(total.headline, '≈ $0.65');
  assert.equal(total.approximate, true);
  assert.equal(total.caption, 'stablecoins at $1 each');
  assert.deepEqual(total.counted.map((l) => l.text), ['0.35 $U', '0.1 USDT', '0.1 USDC', '0.1 USD1'], 'largest first, ties in their given order');
  assert.deepEqual(total.notCounted.map((l) => [l.text, l.why]), [['0.2 test $U', 'test tokens, no value']]);
});

test('a single real amount is shown exactly, never approximated', () => {
  const total = approxUsdTotal([line(56, USDT56, 5n * E16, '0.05 USDT'), line(97, U97, E16 * 10n, '0.1 test $U')]);
  assert.equal(total.headline, '0.05 USDT');
  assert.equal(total.approximate, false);
  assert.equal(total.caption, null);
  assert.equal(total.notCounted.length, 1, 'the test amount is still in the breakdown');
});

test('test money, unread currencies and unpegged tokens are never added in', () => {
  const unknownToken = '0x000000000000000000000000000000000000dEaD';
  const total = approxUsdTotal([
    line(56, U56, 10n * E16, '0.1 $U'),
    line(56, USDT56, 10n * E16, '0.1 USDT'),
    line(56, null, 30n * E16, '1 job, currency not yet read', null),
    line(56, unknownToken, 99n * E16, '0.99 XYZ'),
    line(97, U97, 50n * E16, '0.5 test $U'),
  ]);
  assert.equal(total.headline, '≈ $0.20');
  assert.deepEqual(total.notCounted.map((l) => l.why).sort(), ['currency not yet read', 'not a dollar stablecoin', 'test tokens, no value']);
});

test('with no real money: one amount as it is, several named, nothing added', () => {
  assert.equal(approxUsdTotal([]).headline, '0');
  assert.equal(approxUsdTotal([line(97, U97, 20n * E16, '0.2 test $U')]).headline, '0.2 test $U');
  assert.equal(approxUsdTotal([line(97, U97, 20n * E16, '0.2 test $U'), line(97, '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd', E16, '0.01 test USDT')]).headline, 'Test tokens only');
});

test('dollars are rounded to the cent, half up, and a dust total is said to be dust', () => {
  assert.equal(formatUsd(0n), '$0');
  assert.equal(formatUsd(645n * 10n ** 15n), '$0.65');
  assert.equal(formatUsd(644n * 10n ** 15n), '$0.64');
  assert.equal(formatUsd(10n ** 15n), '< $0.01');
  assert.equal(formatUsd(123450n * E16), '$1,234.50');
});

test('only the four mainnet dollar stablecoins are pegged; test tokens are not', () => {
  const pegged = [...knownTokens(56), ...knownTokens(97)].filter((t) => t.pegged === 'USD').map((t) => `${t.chainId}:${t.symbol}`);
  assert.deepEqual(pegged.sort(), ['56:U', '56:USD1', '56:USDC', '56:USDT']);
});

test('workspace and builder totals feed the same figure', () => {
  const jobs = [
    { chainId: 56, paymentToken: U56, budgetRaw: (5n * E16).toString(), status: 'COMPLETED' },
    { chainId: 56, paymentToken: USDC56, budgetRaw: (5n * E16).toString(), status: 'COMPLETED' },
    { chainId: 97, paymentToken: U97, budgetRaw: (10n * E16).toString(), status: 'COMPLETED' },
  ];
  assert.equal(approxTotalView(totalLines(jobs)).headline, '≈ $0.10');
  const earned = approxTotalView(earnedMoneyLines(earnedByToken(jobs)));
  assert.equal(earned.headline, '≈ $0.10');
  assert.deepEqual(earned.notCounted.map((l) => [l.text, l.where]), [['0.1 test $U', 'Testnet']]);
});

test('the note under a builder\'s earnings says where they were paid and what was left out', () => {
  const paid = (chainId: number, paymentToken: string | null, cents: bigint) => ({ chainId, paymentToken, budgetRaw: (cents * E16).toString(), status: 'COMPLETED' });
  const note = (jobs: ReturnType<typeof paid>[]) => earningsNote(earnedMoneyLines(earnedByToken(jobs)));
  /* Paid only in test tokens: the testnet, not "released on BNB Chain". */
  assert.equal(note([paid(97, U97, 22n)]), 'test tokens on BNB Testnet, no value');
  assert.equal(note([paid(56, U56, 5n)]), 'released on BNB Chain');
  assert.equal(note([]), 'released on BNB Chain');
  /* Only what was actually left out is named. */
  assert.equal(note([paid(56, U56, 5n), paid(97, U97, 10n)]), 'test tokens not counted');
  assert.equal(note([paid(56, U56, 5n), paid(56, null, 10n)]), 'unread currencies not counted');
  assert.equal(note([paid(56, U56, 5n), paid(56, null, 10n), paid(97, U97, 1n)]), 'test tokens and unread currencies not counted');
  assert.equal(note([paid(56, null, 10n), paid(97, U97, 1n)]), 'test tokens and unread currencies not counted');
  /* Several stablecoins added at $1 each say so first. */
  assert.equal(note([paid(56, U56, 5n), paid(56, USDC56, 5n)]), 'stablecoins at $1 each');
  assert.match(source('src/app/(site)/build/(section)/page.tsx'), /note: earningsNote\(earnedLines\),/);
});

test('every total shows one figure with its breakdown, and no breakdown sits inside a link', () => {
  const overview = source('src/features/workspace/Overview.tsx');
  assert.match(overview, /value: <MoneyTotal total=\{heldTotal\} \/>/);
  const escrowTile = overview.slice(overview.indexOf("label: 'In escrow'"), overview.indexOf("label: 'In escrow'") + 700);
  assert.doesNotMatch(escrowTile, /href: '/, 'the tile is not a link, so the figure inside can open');
  assert.match(source('src/features/workspace/Pages.tsx'), /<MoneyTotal total=\{total\} \/>/);
  assert.match(source('src/app/(site)/build/(section)/page.tsx'), /value: <MoneyTotal total=\{earned\} \/>/);
  assert.match(source('src/app/(site)/build/(section)/agents/[chainId]/[tokenId]/page.tsx'), /value=\{moneyTotal\(ops\.money\.released\)\}/);
  const component = source('src/ui/MoneyTotal.tsx');
  assert.match(component, /aria-expanded=\{open\}/);
  assert.match(component, /onClick=\{\(\) => \(open \? setOpen\(false\) : show\(\)\)\}/, 'opens on tap, not only on hover');
  assert.match(component, /e\.key === 'Escape'/);
  /* The stat strips round their corners by clipping, so the breakdown opens in the top layer rather than inside the tile. */
  assert.match(component, /popover="manual"/);
  assert.match(component, /el\.showPopover\?\.\(\)/);
  assert.doesNotMatch(component, /absolute top-full/);
});
