import { at, check, close, isObj, num, plural, said, str, type Obj, type PlanCheck } from './plan-check-kit';

/**
 * A concentrated-liquidity review and its re-centre plan, checked against
 * its own numbers.
 *
 * Every figure a re-centre turns on can be held to arithmetic that does not
 * depend on the tokens: a v3 price is 1.0001 to the power of the tick, so a
 * range's upper price over its lower is 1.0001 to the power of its width in
 * ticks whatever the decimals, and a tick a pool can use is a multiple of
 * the spacing its fee tier fixes. A plan that names ticks off that grid,
 * or prices its ticks do not produce, could not be placed as written.
 *
 * Whether a position exists, is the wallet's and is in range at the block
 * named is a reading of the chain, which the paid position check makes
 * (`assay/v3-grade.ts`); these checks read the plan only.
 */

export const RANGE_METHOD = 'range-plan@1';

/**
 * PancakeSwap v3's fee tiers and the tick spacing each fixes, as its
 * factory sets them (`feeAmountTickSpacing`). Written out here rather than
 * imported from Centreline's own maths, so the check does not mark an
 * agent's work with that agent's code.
 */
const SPACING_BY_FEE_PCT: Record<string, number> = { '0.01': 1, '0.05': 10, '0.25': 50, '1': 200 };
const MAX_TICK = 887272;
const LN_TICK = Math.log(1.0001);

interface Position {
  label: string;
  status: string | null;
  lower: number | null;
  upper: number | null;
  price: number | null;
  feePct: string | null;
  recentre: {
    lower: number | null;
    upper: number | null;
    tickLower: number | null;
    tickUpper: number | null;
    sameWidth: boolean | null;
  } | null;
}

function readPositions(o: Obj): Position[] | null {
  const list = at(o, 'positions');
  if (!Array.isArray(list) || !list.length) return null;
  const positions = list.filter(isObj).map((p): Position => {
    const label = str(p.position) ?? str(p.id) ?? str(p.pair) ?? 'A position';
    const fee = num(p.fee_pct) ?? num(label.match(/(\d+(?:\.\d+)?)%/)?.[1]);
    const r = isObj(p.recentre) ? p.recentre : isObj(p.rebalance) ? p.rebalance : null;
    const range = isObj(p.range) ? p.range : {};
    const next = r && isObj(r.new_range) ? r.new_range : r && isObj(r.range) ? r.range : {};
    const ticks = r && isObj(r.ticks) ? r.ticks : r ?? {};
    return {
      label,
      status: str(p.status)?.toLowerCase() ?? null,
      lower: num(range.lower),
      upper: num(range.upper),
      price: num(p.price_now ?? p.current_price),
      feePct: fee === null ? null : String(fee),
      recentre: r
        ? {
            lower: num(next.lower),
            upper: num(next.upper),
            tickLower: num((ticks as Obj).tickLower ?? (ticks as Obj).tick_lower),
            tickUpper: num((ticks as Obj).tickUpper ?? (ticks as Obj).tick_upper),
            sameWidth: typeof r.same_width === 'boolean' ? r.same_width : null,
          }
        : null,
    };
  });
  return positions.some((p) => p.lower !== null && p.upper !== null) ? positions : null;
}

export function isRangePlan(o: Obj): boolean {
  return readPositions(o) !== null;
}

/** "3 of 20 positions: #1, #2, #3", trimmed to a readable length. */
function which(list: Position[], total: number): string {
  const names = list.slice(0, 3).map((p) => p.label.split(' ')[0]);
  return `${list.length} of ${plural(total, 'position')}${names.length ? ` (${names.join(', ')}${list.length > 3 ? '…' : ''})` : ''}`;
}

export function rangeChecks(o: Obj): PlanCheck[] {
  const positions = readPositions(o);
  if (!positions) return [];
  const checks: PlanCheck[] = [];
  const n = positions.length;

  // In or out of range, from the plan's own price and range.
  const placed = positions.filter((p) => p.status && p.lower !== null && p.upper !== null && p.price !== null && /^(in|out)/.test(p.status));
  const wrongStatus = placed.filter((p) => (p.price! >= p.lower! && p.price! <= p.upper!) !== p.status!.startsWith('in'));
  checks.push(
    check(
      'range.status',
      'In or out of range follows from the price',
      'Each position’s stated status against its own range and the price it states.',
      !placed.length ? 'not-verified' : wrongStatus.length ? 'failed' : 'passed',
      !placed.length ? 'No position states a status, a range and a price together.' : wrongStatus.length ? `The stated status contradicts the range and price for ${which(wrongStatus, n)}.` : `${plural(placed.length, 'position')}: every stated status follows from its range and price.`,
    ),
  );

  const plans = positions.filter((p) => p.recentre);
  if (!plans.length) {
    checks.push(check('range.ticks', 'New ticks sit on the pool’s tick grid', 'Each re-centre’s ticks against the spacing its pool’s fee tier fixes, and the bounds every v3 pool has.', 'not-applicable', 'The answer proposes no re-centre.'));
    return checks;
  }

  // Ticks on the pool's grid.
  const ticked = plans.filter((p) => p.recentre!.tickLower !== null && p.recentre!.tickUpper !== null);
  const known = ticked.filter((p) => p.feePct !== null && SPACING_BY_FEE_PCT[p.feePct] !== undefined);
  const offGrid = known.filter((p) => {
    const s = SPACING_BY_FEE_PCT[p.feePct!];
    const { tickLower: lo, tickUpper: hi } = p.recentre!;
    return lo! % s !== 0 || hi! % s !== 0 || lo! >= hi! || lo! < -MAX_TICK || hi! > MAX_TICK;
  });
  checks.push(
    check(
      'range.ticks',
      'New ticks sit on the pool’s tick grid',
      'Each re-centre’s ticks against the spacing its pool’s fee tier fixes (1, 10, 50 or 200 for 0.01%, 0.05%, 0.25% and 1%), and the bounds every v3 pool has.',
      !known.length ? 'not-verified' : offGrid.length ? 'failed' : known.length < plans.length ? 'not-verified' : 'passed',
      !ticked.length
        ? 'The re-centre plans do not name their ticks, so they cannot be placed as written.'
        : !known.length
          ? 'The positions do not name a fee tier Pokter knows, so their tick spacing is unknown.'
          : offGrid.length
            ? `Ticks off the pool’s grid or out of bounds for ${which(offGrid, n)}: the pool would reject them.`
            : known.length < plans.length
              ? `${plural(known.length, 'plan')} on the grid; ${plans.length - known.length} could not be checked.`
              : `All ${plural(known.length, 're-centre')} use ticks the pool accepts.`,
    ),
  );

  // Prices the ticks produce: the ratio is 1.0001 to the width, whatever the decimals.
  const priced = ticked.filter((p) => p.recentre!.lower !== null && p.recentre!.upper !== null && p.recentre!.lower! > 0);
  const mispriced = priced.filter((p) => {
    const r = p.recentre!;
    const widthFromPrices = Math.log(r.upper! / r.lower!) / LN_TICK;
    return !close(widthFromPrices, r.tickUpper! - r.tickLower!, 2, 0.0005);
  });
  checks.push(
    check(
      'range.prices',
      'The new range’s prices match its ticks',
      'Each new range’s upper price over its lower against 1.0001 to the power of its width in ticks, which holds whatever the tokens’ decimals.',
      !priced.length ? 'not-verified' : mispriced.length ? 'failed' : 'passed',
      !priced.length ? 'The plans do not state both prices and ticks for a new range.' : mispriced.length ? `The prices do not match the ticks for ${which(mispriced, n)}.` : `${plural(priced.length, 'new range')}: prices and ticks agree.`,
    ),
  );

  // The new range has to contain today's price to earn on day one.
  const bracketable = plans.filter((p) => p.price !== null && p.recentre!.lower !== null && p.recentre!.upper !== null);
  const outside = bracketable.filter((p) => p.price! < p.recentre!.lower! || p.price! > p.recentre!.upper!);
  checks.push(
    check(
      'range.brackets',
      'The new range contains today’s price',
      'Each new range against the price the answer states, since a range that misses it earns nothing once placed.',
      !bracketable.length ? 'not-verified' : outside.length ? 'failed' : 'passed',
      !bracketable.length ? 'The plans do not state a new range beside a current price.' : outside.length ? `The new range misses the current price for ${which(outside, n)}.` : `Every new range contains the current price.`,
    ),
  );

  // "Same width" is a claim the old and new ranges can be held to.
  const claimed = plans.filter((p) => p.recentre!.sameWidth === true && p.lower !== null && p.upper !== null && p.lower > 0 && p.recentre!.lower !== null && p.recentre!.upper !== null && p.recentre!.lower > 0);
  if (claimed.length) {
    const changed = claimed.filter((p) => {
      const spacing = p.feePct ? SPACING_BY_FEE_PCT[p.feePct] ?? 1 : 1;
      const before = Math.log(p.upper! / p.lower!) / LN_TICK;
      const after = Math.log(p.recentre!.upper! / p.recentre!.lower!) / LN_TICK;
      return !close(before, after, 2 * spacing, 0.0005);
    });
    checks.push(
      check(
        'range.width',
        'Keeps the width it says it keeps',
        'Where a plan says the new range is the same width, the old and new ranges’ widths in ticks, within two tick spacings.',
        changed.length ? 'failed' : 'passed',
        changed.length ? `The width changes for ${which(changed, n)}.` : `${plural(claimed.length, 're-centre')} keep the width they claim.`,
      ),
    );
  }

  // A re-centre usually swaps to its new split; the price that swap moves is an assumption.
  const text = said(o);
  checks.push(
    check(
      'range.slippage',
      'States its swap price assumption',
      'Whether a plan that swaps to a new split says what price impact or slippage it assumes.',
      /slippage|price impact|max(imum)? impact/.test(text) ? 'passed' : /\bswap\b/.test(text) ? 'not-verified' : 'not-applicable',
      /slippage|price impact|max(imum)? impact/.test(text) ? 'It states the slippage or price impact it assumes.' : /\bswap\b/.test(text) ? 'The plan sizes a swap without saying what price impact it assumes; a large swap in a thin pool fills worse than its quote.' : 'The plan needs no swap.',
    ),
  );

  return checks;
}

export const RANGE_NOT_COVERED = [
  'Whether each position exists, belongs to the wallet and sits where the answer says at the block it names. Pokter’s paid position check reads that from the chain; these checks read the answer.',
  'Uncollected fees and position values, and whether re-centring is worth its cost.',
];
