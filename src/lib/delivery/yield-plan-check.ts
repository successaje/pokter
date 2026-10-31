import { at, briefData, check, close, fmt, isObj, num, numAt, pct, plural, said, str, strAt, type Obj, type PlanCheck } from './plan-check-kit';

/**
 * A yield comparison checked against its own numbers and the buyer's terms.
 *
 * What a buyer of a yield answer most needs to know is whether the net
 * figures were worked out on their amount and horizon, and whether the
 * decision follows from them. A rate is a reading at one block; a net rate
 * is that reading less the costs of moving there, spread over the time the
 * money stays. Both are quoted figures, not returns: what a deposit earns
 * over the holding period depends on rates that move every block, and no
 * check here measures it.
 */

export const YIELD_METHOD = 'yield-plan@1';

interface Venue {
  name: string;
  apy: number | null;
  costs: number | null;
  net: number | null;
}

interface YieldPlan {
  amount: number | null;
  asset: string | null;
  days: number | null;
  currentApr: number | null;
  threshold: number | null;
  venues: Venue[];
  /** True or false when the answer says whether to move, a venue name when it names one. */
  recommend: boolean | string | null;
}

function costOf(raw: unknown): number | null {
  if (isObj(raw)) {
    const parts = Object.values(raw).map(num);
    return parts.every((p) => p !== null) ? parts.reduce<number>((sum, p) => sum + p!, 0) : null;
  }
  return num(raw);
}

function readYield(o: Obj): YieldPlan | null {
  const list = at(o, 'venues', 'options', 'routes', 'candidates');
  if (!Array.isArray(list) || !list.length) return null;
  const venues = list
    .filter(isObj)
    .map((v) => ({
      name: str(v.venue) ?? str(v.name) ?? str(v.protocol) ?? 'A venue',
      apy: num(v.supply_apy_pct ?? v.apy_pct ?? v.apr_pct ?? v.rate_pct),
      costs: costOf(v.costs_usd ?? v.cost_usd ?? v.costs),
      net: num(v.net_apr_pct ?? v.net_apy_pct ?? v.net_pct),
    }));
  if (!venues.some((v) => v.apy !== null || v.net !== null)) return null;
  const recommend = at(o, 'recommend', 'recommendation', 'move');
  return {
    amount: numAt(o, 'question.amount', 'amount', 'request.amount'),
    asset: strAt(o, 'question.asset', 'asset', 'request.asset'),
    days: numAt(o, 'question.holding_days', 'holding_days', 'question.days', 'days'),
    currentApr: numAt(o, 'question.current_apr_pct', 'current_apr_pct'),
    threshold: numAt(o, 'question.threshold_pp', 'threshold_pp'),
    venues,
    recommend: typeof recommend === 'boolean' ? recommend : str(recommend) ?? (isObj(recommend) ? str(recommend.venue) : null),
  };
}

export function isYieldPlan(o: Obj): boolean {
  return readYield(o) !== null;
}

export function yieldChecks(o: Obj, brief: string | null): PlanCheck[] {
  const y = readYield(o);
  if (!y) return [];
  const checks: PlanCheck[] = [];

  // The buyer's terms, as the brief set them.
  const data = briefData(brief);
  if (!data) {
    checks.push(check('yield.terms', 'Keeps your terms', 'The amount, asset, holding period, current rate and threshold in the answer against the brief’s.', 'not-verified', 'The brief did not set its terms as data Pokter can compare, or is not shown.'));
  } else {
    const pairs: Array<[string, unknown, unknown]> = [
      ['amount', data.amount, y.amount],
      ['asset', data.asset, y.asset],
      ['holding period', data.holding_days, y.days],
      ['current rate', data.current_apr_pct, y.currentApr],
      ['threshold', data.threshold_pp, y.threshold],
    ];
    const compared = pairs.filter(([, asked]) => asked !== undefined && asked !== null);
    const changed = compared.filter(([, asked, answered]) => (typeof asked === 'string' ? String(answered ?? '').toUpperCase() !== asked.toUpperCase() : num(answered) === null || !close(num(asked)!, num(answered)!, 1e-9, 1e-6)));
    checks.push(
      check(
        'yield.terms',
        'Keeps your terms',
        'The amount, asset, holding period, current rate and threshold in the answer against the brief’s.',
        !compared.length ? 'not-verified' : changed.length ? 'failed' : 'passed',
        !compared.length
          ? 'The brief sets none of these terms.'
          : changed.length
            ? `The answer changes the ${changed.map(([name]) => name).join(', ')} the brief set.`
            : `It answers on the brief’s own ${compared.map(([name]) => name).join(', ')}.`,
      ),
    );
  }

  // Net rates: the rate less the costs, spread over the holding period.
  const workable = y.venues.filter((v) => v.apy !== null && v.costs !== null && v.net !== null);
  if (y.amount === null || y.days === null || !workable.length) {
    checks.push(check('yield.net', 'Net rates follow from rates and costs', 'Each venue’s net rate against its rate less its stated costs, spread over the holding period as a simple annual rate.', 'not-verified', y.amount === null || y.days === null ? 'The answer does not state the amount and holding period its net rates are for.' : 'No venue states its rate, its costs and its net rate together.'));
  } else {
    const off = workable.filter((v) => !close(v.apy! - (v.costs! / y.amount!) * (365 / y.days!) * 100, v.net!, 0.02, 0.01));
    checks.push(
      check(
        'yield.net',
        'Net rates follow from rates and costs',
        `Each venue’s net rate against its rate less its stated costs on ${fmt(y.amount)} over ${fmt(y.days)} days, as a simple annual rate, within 0.02 points.`,
        off.length ? 'failed' : 'passed',
        off.length
          ? `${off.map((v) => `${v.name}: ${pct(v.apy! - (v.costs! / y.amount!) * (365 / y.days!) * 100, 3)}% by that reading, ${pct(v.net!, 3)}% stated`).join('; ')}.`
          : `${plural(workable.length, 'venue')} worked through; every net rate follows.`,
      ),
    );
  }

  // The decision: the best net venue, moved to only when it clears the threshold.
  const ranked = y.venues.filter((v) => v.net !== null).sort((a, b) => b.net! - a.net!);
  const best = ranked[0];
  if (!best || y.recommend === null) {
    checks.push(check('yield.decision', 'The decision follows from the figures', 'Whether the answer moves to the best net venue only when it clears the current rate by the threshold.', 'not-verified', y.recommend === null ? 'The answer does not say plainly whether to move.' : 'No venue states a net rate.'));
  } else {
    const named = typeof y.recommend === 'string' ? y.venues.find((v) => v.name.toLowerCase() === (y.recommend as string).toLowerCase()) : null;
    const moves = y.recommend !== false;
    const clears = y.currentApr === null || y.threshold === null ? null : best.net! - y.currentApr >= y.threshold;
    const pickedBest = !named || named === best || named.net === best.net;
    const ok = pickedBest && (clears === null || clears === moves);
    checks.push(
      check(
        'yield.decision',
        'The decision follows from the figures',
        'Whether the answer moves to the best net venue only when it clears the current rate by the threshold.',
        ok ? (clears === null ? 'not-verified' : 'passed') : 'failed',
        !pickedBest
          ? `It names ${named!.name} at ${pct(named!.net!, 3)}%; ${best.name} nets ${pct(best.net!, 3)}%.`
          : clears === null
            ? `${best.name} nets the most, at ${pct(best.net!, 3)}%; the answer does not state the current rate and threshold to weigh it against.`
            : clears !== moves
              ? `${best.name} nets ${pct(best.net!, 3)}% against ${pct(y.currentApr!, 3)}% now, ${clears ? 'clearing' : 'short of'} the ${fmt(y.threshold!)}-point threshold, yet the answer says ${moves ? 'to move' : 'to stay'}.`
              : `${best.name} nets ${pct(best.net!, 3)}% against ${pct(y.currentApr!, 3)}% now, ${clears ? 'clearing' : 'short of'} the ${fmt(y.threshold!)}-point threshold, and the answer says ${moves ? 'to move' : 'to stay'}.`,
      ),
    );
  }

  // Rewards: a rate with or without token incentives is a different figure.
  const text = said(o);
  const mentions = /reward|incentive|emission|\bxvs\b|\bcake\b rewards|farm/.test(text);
  checks.push(
    check(
      'yield.incentives',
      'Says whether rewards are counted',
      'Whether the answer says if token rewards, such as XVS on Venus, are in its rates or left out.',
      mentions ? 'passed' : 'not-verified',
      mentions ? 'It says how token rewards are treated.' : 'The answer does not say whether token rewards are in its rates, so its rates may differ from a venue’s headline figure.',
    ),
  );

  return checks;
}

export const YIELD_NOT_COVERED = [
  'Each rate against the venue at the block the answer names. These checks read the answer, not the chain.',
  'What the deposit will earn. A rate is a reading at one block; the return over the holding period depends on rates that move every block.',
];
