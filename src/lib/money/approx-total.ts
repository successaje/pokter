import { paymentTokenAt } from '@/lib/network/tokens';

/**
 * One figure for money held in several tokens, with every exact amount
 * behind it.
 *
 * Totals used to be a list ("0.35 $U · 0.1 USDT · 0.1 USDC · 0.1 USD1 ·
 * 0.2 test $U"), which is exact but hard to read at a glance. Adding the
 * tokens together needs a rate between them, so the single figure is an
 * approximation, labelled as one: real-money tokens pegged 1:1 to the US
 * dollar, counted at $1 each. Nothing else is ever added in:
 * - test tokens have no value;
 * - a job whose token has not been read could be in anything;
 * - a token with no dollar peg has no $1 to count it at.
 * Those stay in the breakdown, each saying why it was not counted.
 *
 * With a single real-money amount there is nothing to approximate, so that
 * amount is shown exactly. The breakdown always carries the exact amounts,
 * in their own tokens: the approximation is a summary, never a replacement.
 */
export interface MoneyLine {
  key: string;
  /** The amount in words, in its own token ("0.1 USDT", "0.2 test $U", "2 jobs, currency not yet read"). */
  text: string;
  chainId: number;
  /** Null when the token was not read. */
  token: string | null;
  raw: bigint;
  /** Null when the token or its scale is unknown. */
  decimals: number | null;
}

export interface ApproxTotal {
  /** The one figure: "≈ $0.65", an exact single amount, or "0". */
  headline: string;
  /** True when several dollar stablecoins were added at $1 each. */
  approximate: boolean;
  /** Said beside an approximate figure. */
  caption: string | null;
  /** Every amount, exact: those counted in the figure first, then the rest with why. */
  counted: MoneyLine[];
  notCounted: Array<MoneyLine & { why: string }>;
}

const REAL = 56;
const WAD = 18;

function whyNotCounted(line: MoneyLine): string | null {
  if (line.chainId !== REAL) return 'test tokens, no value';
  if (line.token === null || line.decimals === null) return 'currency not yet read';
  if (paymentTokenAt(line.chainId, line.token)?.pegged !== 'USD') return 'not a dollar stablecoin';
  return null;
}

/** A dollar figure from an 18-decimal sum, to the cent. */
export function formatUsd(wad: bigint): string {
  if (wad === 0n) return '$0';
  const cents = (wad + 5n * 10n ** BigInt(WAD - 3)) / 10n ** BigInt(WAD - 2);
  if (cents === 0n) return '< $0.01';
  const dollars = cents / 100n;
  const rest = (cents % 100n).toString().padStart(2, '0');
  return `$${dollars.toLocaleString('en-US')}.${rest}`;
}

export function approxUsdTotal(lines: readonly MoneyLine[]): ApproxTotal {
  const counted: MoneyLine[] = [];
  const notCounted: Array<MoneyLine & { why: string }> = [];
  for (const line of lines) {
    const why = whyNotCounted(line);
    if (why) notCounted.push({ ...line, why });
    else if (line.raw > 0n) counted.push(line);
  }
  if (counted.length > 1) {
    const toWad = (line: MoneyLine) => (line.decimals! <= WAD ? line.raw * 10n ** BigInt(WAD - line.decimals!) : line.raw / 10n ** BigInt(line.decimals! - WAD));
    /* Largest first, so the breakdown reads from what matters most. */
    counted.sort((a, b) => (toWad(b) > toWad(a) ? 1 : toWad(b) < toWad(a) ? -1 : 0));
    const wad = counted.reduce((sum, line) => sum + toWad(line), 0n);
    return { headline: `≈ ${formatUsd(wad)}`, approximate: true, caption: 'stablecoins at $1 each', counted, notCounted };
  }
  if (counted.length === 1) return { headline: counted[0].text, approximate: false, caption: null, counted, notCounted };
  /* No real money: one amount is shown as it is; several are named for what they are, not added. */
  const headline = notCounted.length === 0 ? '0' : notCounted.length === 1 ? notCounted[0].text : notCounted.every((l) => l.chainId !== REAL) ? 'Test tokens only' : 'Not counted';
  return { headline, approximate: false, caption: null, counted, notCounted };
}

/** What a page shows: strings only, so a server page can hand it to the client component. */
export interface ApproxTotalView {
  headline: string;
  approximate: boolean;
  caption: string | null;
  counted: Array<{ key: string; text: string; where: string }>;
  notCounted: Array<{ key: string; text: string; where: string; why: string }>;
}

const where = (chainId: number) => (chainId === 56 ? 'BNB Chain' : chainId === 97 ? 'Testnet' : `Chain ${chainId}`);

export function approxTotalView(lines: readonly MoneyLine[]): ApproxTotalView {
  const total = approxUsdTotal(lines);
  return {
    headline: total.headline,
    approximate: total.approximate,
    caption: total.caption,
    counted: total.counted.map((l) => ({ key: l.key, text: l.text, where: where(l.chainId) })),
    notCounted: total.notCounted.map((l) => ({ key: l.key, text: l.text, where: where(l.chainId), why: l.why })),
  };
}
