import { at, briefData, check, close, fmt, isObj, num, numAt, pct, plural, said, str, strAt, type Obj, type PlanCheck } from './plan-check-kit';

/**
 * A grid plan checked against its own numbers.
 *
 * Read in the shapes grid agents deliver today: Gridloom's buy and sell
 * order lists, and the flat `levels` list with a side and an allocation
 * that outside grid agents send. The checks hold whichever shape it is to
 * what any grid plan has to get right: levels that span the range at the
 * stated step, orders that add up to the budget, a step that clears the
 * fee paid on each fill, orders on the right side of the price, the base
 * asset the sells need, and what is left holding when price leaves the
 * range.
 *
 * None of it says a grid will make money. A grid earns only while price
 * swings across its levels, and that is the market's, not the plan's.
 */

export const GRID_METHOD = 'grid-plan@1';

interface Level {
  price: number;
  side: 'buy' | 'sell' | null;
  /** The order's size in the quote asset, when the plan gives it that way. */
  usd: number | null;
  /** The order's size in the base asset, when the plan gives it that way. */
  base: number | null;
}

interface GridPlan {
  base: string | null;
  lower: number | null;
  upper: number | null;
  count: number | null;
  levels: Level[];
  spacing: 'geometric' | 'arithmetic' | null;
  stepPct: number | null;
  budget: number | null;
  priceNow: number | null;
  feePct: number | null;
  netPct: number | null;
  below: string | null;
  above: string | null;
  setup: string | null;
}

const QUOTE_KEYS = ['usdt', 'usd', 'usdc', 'allocation_usd', 'capital_usd', 'size_usd', 'amount_usd', 'quote'];

function levelOf(raw: unknown, side: Level['side'], base: string | null): Level | null {
  if (!isObj(raw)) return null;
  const price = num(raw.price);
  if (price === null) return null;
  const stated = str(raw.side)?.toLowerCase();
  const usdKey = QUOTE_KEYS.find((key) => num(raw[key]) !== null);
  const baseKey = base ? Object.keys(raw).find((key) => key.toLowerCase() === base.toLowerCase()) : undefined;
  return {
    price,
    side: stated === 'buy' || stated === 'sell' ? stated : side,
    usd: usdKey ? num(raw[usdKey]) : null,
    base: baseKey ? num(raw[baseKey]) : num(raw.base_amount),
  };
}

function readGrid(o: Obj): GridPlan | null {
  const pair = strAt(o, 'pair', 'market', 'symbol');
  const base = pair?.split(/[/-]/)[0]?.trim() || strAt(o, 'base', 'result.plan.token.symbol', 'token.symbol');
  const buys = at(o, 'grid.buy_orders', 'buy_orders');
  const sells = at(o, 'grid.sell_orders', 'sell_orders');
  let levels: Level[] = [];
  if (Array.isArray(buys) || Array.isArray(sells)) {
    levels = [
      ...(Array.isArray(buys) ? buys.map((l) => levelOf(l, 'buy', base)) : []),
      ...(Array.isArray(sells) ? sells.map((l) => levelOf(l, 'sell', base)) : []),
    ].filter((l): l is Level => l !== null);
  } else {
    const list = at(o, 'levels', 'grid.prices', 'result.plan.grid.prices', 'grid.levels');
    if (Array.isArray(list)) levels = list.map((l) => levelOf(l, null, base)).filter((l): l is Level => l !== null);
  }
  if (levels.length < 2) return null;
  levels.sort((a, b) => a.price - b.price);
  const spacing = strAt(o, 'grid.spacing', 'spacing', 'result.plan.grid.spacing')?.toLowerCase();
  const count = numAt(o, 'level_count', 'grid.level_count', 'result.plan.grid.levels') ?? (typeof at(o, 'grid.levels') === 'number' ? numAt(o, 'grid.levels') : null);
  return {
    base,
    lower: numAt(o, 'range.lower', 'lower_price', 'lower', 'grid.lower_price', 'result.plan.grid.lower_price'),
    upper: numAt(o, 'range.upper', 'upper_price', 'upper', 'grid.upper_price', 'result.plan.grid.upper_price'),
    count,
    levels,
    spacing: spacing?.startsWith('geo') ? 'geometric' : spacing?.startsWith('arith') || spacing === 'linear' ? 'arithmetic' : null,
    stepPct: numAt(o, 'grid.step_pct', 'step_pct', 'grid.spacing_pct', 'spacing_pct', 'result.plan.grid.spacing_pct'),
    budget: numAt(o, 'setup.budget_usd', 'budget_usd', 'capital_usd', 'grid.capital_usd', 'result.plan.grid.capital_usd', 'budget'),
    priceNow: numAt(o, 'price_now', 'current_price', 'price', 'result.plan.token.price_usd', 'token.price_usd'),
    feePct: numAt(o, 'economics.pool_fee_pct', 'pool_fee_pct', 'fee_pct', 'pool.swap_fee_pct', 'result.plan.pool.swap_fee_pct'),
    netPct: numAt(o, 'economics.net_per_round_trip_pct', 'net_per_round_trip_pct'),
    below: strAt(o, 'economics.if_price_falls_below_range', 'if_price_falls_below_range', 'out_of_range.below', 'below_range'),
    above: strAt(o, 'economics.if_price_rises_above_range', 'if_price_rises_above_range', 'out_of_range.above', 'above_range'),
    setup: strAt(o, 'setup.swap_first', 'swap_first', 'setup.starting_inventory', 'starting_inventory'),
  };
}

export function isGridPlan(o: Obj): boolean {
  return readGrid(o) !== null && (numAt(o, 'range.lower', 'lower_price', 'grid.lower_price') !== null || /grid/.test(said(o).slice(0, 400)));
}

/** The first amount written just before the base asset's symbol: "hold 1.00757 ETH". */
function amountBefore(text: string | null, symbol: string | null): number | null {
  if (!text || !symbol) return null;
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`(-?\\d[\\d,]*\\.?\\d*(?:e[-+]?\\d+)?)\\s*${escaped}\\b`, 'i'));
  return match ? num(match[1]) : null;
}

export function gridChecks(o: Obj, brief: string | null): PlanCheck[] {
  const g = readGrid(o);
  if (!g) return [];
  const checks: PlanCheck[] = [];
  const prices = g.levels.map((l) => l.price);
  const first = prices[0];
  const last = prices[prices.length - 1];

  // The buyer's terms. A budget read as a price bound is the failure this is for.
  const data = briefData(brief);
  if (data) {
    const asked: Array<[string, number | string | null, number | string | null]> = [
      ['asset', str(data.base) ?? str(data.asset), g.base],
      ['budget', numAt(data, 'budget_usdt', 'budget_usd', 'budget'), g.budget],
      ['lower bound', numAt(data, 'range.lower', 'lower'), first],
      ['upper bound', numAt(data, 'range.upper', 'upper'), last],
      ['number of levels', numAt(data, 'grids') !== null ? numAt(data, 'grids')! + 1 : numAt(data, 'levels'), prices.length],
      ['spacing', str(data.spacing)?.toLowerCase() ?? null, g.spacing],
    ];
    const compared = asked.filter(([, want]) => want !== null);
    const changed = compared.filter(([, want, got]) => (typeof want === 'string' ? String(got ?? '').toLowerCase() !== want.toLowerCase() : typeof got !== 'number' || !close(want as number, got, 1e-9, 0.001)));
    checks.push(
      check(
        'grid.terms',
        'Keeps your terms',
        'The asset, budget, range, number of levels and spacing in the plan against the brief’s.',
        !compared.length ? 'not-verified' : changed.length ? 'failed' : 'passed',
        !compared.length ? 'The brief sets none of these terms.' : changed.length ? `The plan changes the ${changed.map(([name]) => name).join(', ')} the brief set.` : `It plans on the brief’s own ${compared.map(([name]) => name).join(', ')}.`,
      ),
    );
  } else {
    checks.push(check('grid.terms', 'Keeps your terms', 'The asset, budget, range, number of levels and spacing in the plan against the brief’s.', 'not-verified', 'The brief did not set its terms as data Pokter can compare, or is not shown.'));
  }

  // Bounds and count.
  if (g.lower === null || g.upper === null) {
    checks.push(check('grid.bounds', 'Levels span the range', 'The lowest and highest levels against the range the plan states, and the number of levels against its count.', 'not-verified', 'The plan does not state its range, so its levels have nothing to be held to.'));
  } else {
    const ends = close(first, g.lower, 0, 0.001) && close(last, g.upper, 0, 0.001);
    const counted = g.count === null || g.count === prices.length;
    checks.push(
      check(
        'grid.bounds',
        'Levels span the range',
        'The lowest and highest levels against the range the plan states, and the number of levels against its count.',
        ends && counted ? 'passed' : 'failed',
        ends && counted
          ? `${plural(prices.length, 'level')} from ${fmt(first)} to ${fmt(last)}, matching the stated range.`
          : !ends
            ? `The levels run from ${fmt(first)} to ${fmt(last)}; the plan states ${fmt(g.lower)} to ${fmt(g.upper)}.`
            : `The plan lists ${plural(prices.length, 'level')} and states ${g.count}.`,
      ),
    );
  }

  // Spacing: every gap the same, and the step the plan states.
  const ratios = prices.slice(1).map((p, i) => p / prices[i] - 1);
  const gaps = prices.slice(1).map((p, i) => p - prices[i]);
  const evenRatio = ratios.every((r) => close(r, ratios[0], 0.0002, 0.01));
  const evenGap = gaps.every((d) => close(d, gaps[0], 0, 0.01));
  const spacing = g.spacing ?? (evenRatio ? 'geometric' : evenGap ? 'arithmetic' : null);
  const even = spacing === 'geometric' ? evenRatio : spacing === 'arithmetic' ? evenGap : false;
  const stepPct = spacing === 'geometric' ? ratios[0] * 100 : spacing === 'arithmetic' ? (gaps[0] / first) * 100 : null;
  const stepMatches = g.stepPct === null || stepPct === null || spacing === 'arithmetic' || close(stepPct, g.stepPct, 0.005, 0.002);
  checks.push(
    check(
      'grid.spacing',
      'Levels are evenly spaced',
      'Each gap between neighbouring levels against the others, and against the step the plan states, within 0.2% of the step.',
      even && stepMatches ? 'passed' : 'failed',
      !even
        ? `The gaps between levels are not even${spacing ? ` for ${spacing} spacing` : ''}.`
        : !stepMatches
          ? `The levels step ${pct(stepPct!, 3)}% each; the plan states ${pct(g.stepPct!, 3)}%.`
          : `${spacing === 'geometric' ? 'Geometric' : 'Arithmetic'} spacing${stepPct !== null && spacing === 'geometric' ? ` of ${pct(stepPct, 3)}% a level` : ''}${g.stepPct !== null ? ', as stated' : ''}.`,
    ),
  );

  // Budget: what the orders commit, at the price they are placed at.
  const sizes = g.levels.map((l) => (l.usd !== null ? l.usd : l.base !== null && g.priceNow !== null ? l.base * g.priceNow : null));
  if (g.budget === null) {
    checks.push(check('grid.budget', 'Orders add up to the budget', 'The sum of every order, sells valued at the current price, against the budget the plan states.', 'not-verified', 'The plan does not state a budget.'));
  } else if (sizes.some((s) => s === null)) {
    checks.push(check('grid.budget', 'Orders add up to the budget', 'The sum of every order, sells valued at the current price, against the budget the plan states.', 'not-verified', 'Not every order states its size, so the total cannot be added up.'));
  } else {
    const total = sizes.reduce<number>((sum, s) => sum + (s ?? 0), 0);
    const fits = close(total, g.budget, 0.01, 0.005);
    checks.push(
      check(
        'grid.budget',
        'Orders add up to the budget',
        'The sum of every order, sells valued at the current price, against the budget the plan states, within 0.5%.',
        fits ? 'passed' : 'failed',
        fits ? `The orders commit ${fmt(total)}, the stated budget of ${fmt(g.budget)}.` : `The orders commit ${fmt(total)}; the budget is ${fmt(g.budget)}.`,
      ),
    );
  }

  // Fees: a round trip is two fills, so a step has to clear two fees.
  if (g.feePct === null) {
    checks.push(check('grid.fees', 'Each step clears the fees', 'The step between levels against two fills’ fees, the cost of one buy and one sell.', 'not-verified', 'The plan does not state the fee paid on each fill.'));
  } else if (stepPct === null) {
    checks.push(check('grid.fees', 'Each step clears the fees', 'The step between levels against two fills’ fees, the cost of one buy and one sell.', 'not-verified', 'The step could not be read from uneven levels.'));
  } else {
    const net = stepPct - 2 * g.feePct;
    const netMatches = g.netPct === null || close(net, g.netPct, 0.005, 0.002);
    checks.push(
      check(
        'grid.fees',
        'Each step clears the fees',
        'The step between levels against two fills’ fees at the rate the plan states, and the net it states for a round trip.',
        net > 0 && netMatches ? 'passed' : 'failed',
        net <= 0
          ? `A ${pct(stepPct, 3)}% step does not clear two ${pct(g.feePct, 3)}% fees: every round trip loses.`
          : !netMatches
            ? `A ${pct(stepPct, 3)}% step less two ${pct(g.feePct, 3)}% fees leaves ${pct(net, 3)}%; the plan states ${pct(g.netPct!, 3)}%.`
            : `A ${pct(stepPct, 3)}% step less two ${pct(g.feePct, 3)}% fees leaves ${pct(net, 3)}% a round trip, before gas and slippage.`,
      ),
    );
  }

  // Sides: buys below the price, sells above it.
  if (g.priceNow === null) {
    checks.push(check('grid.sides', 'Orders sit on the right side of the price', 'Each buy against the current price the plan states, and each sell likewise.', 'not-verified', 'The plan does not state the price it was placed around.'));
  } else {
    const p = g.priceNow;
    const wrong = g.levels.filter((l) => (l.side === 'buy' && l.price > p * 1.001) || (l.side === 'sell' && l.price < p * 0.999));
    const unsided = g.levels.filter((l) => l.side === null).length;
    checks.push(
      check(
        'grid.sides',
        'Orders sit on the right side of the price',
        'Each buy is at or below the current price the plan states, and each sell at or above it.',
        wrong.length ? 'failed' : unsided ? 'not-verified' : 'passed',
        wrong.length
          ? `${plural(wrong.length, 'order')} sit on the wrong side of ${fmt(p)}: an order there would fill at once.`
          : unsided
            ? `${plural(unsided, 'level')} do not say whether they buy or sell.`
            : !g.levels.some((l) => l.side === 'sell')
              ? `All ${plural(g.levels.length, 'order')} are buys at or below ${fmt(p)}.`
              : !g.levels.some((l) => l.side === 'buy')
                ? `All ${plural(g.levels.length, 'order')} are sells at or above ${fmt(p)}.`
                : `${plural(g.levels.filter((l) => l.side === 'buy').length, 'buy')} below ${fmt(p)} and ${plural(g.levels.filter((l) => l.side === 'sell').length, 'sell')} above it.`,
      ),
    );
  }

  // Starting inventory: sells need the base asset in hand.
  const sells = g.levels.filter((l) => l.side === 'sell');
  if (g.priceNow !== null && sells.length && g.levels.every((l) => l.side !== null)) {
    const needed = sells.reduce((sum, l) => sum + (l.base ?? (l.usd !== null ? l.usd / g.priceNow! : 0)), 0);
    const stated = amountBefore(g.setup, g.base);
    checks.push(
      check(
        'grid.inventory',
        'Says what to hold for the sells',
        'The base asset the sell orders need, against the amount the plan says to hold or buy first, within 1%.',
        stated === null ? 'not-verified' : close(stated, needed, 0, 0.01) ? 'passed' : 'failed',
        stated === null
          ? `The sells need about ${fmt(needed)} ${g.base ?? 'of the base asset'}; the plan does not say to hold or buy it.`
          : close(stated, needed, 0, 0.01)
            ? `The sells need ${fmt(needed)} ${g.base}, as the plan says.`
            : `The sells need ${fmt(needed)} ${g.base}; the plan says ${fmt(stated)}.`,
      ),
    );
  } else if (g.priceNow !== null && !sells.length && g.levels.every((l) => l.side === 'buy')) {
    checks.push(check('grid.inventory', 'Says what to hold for the sells', 'The base asset the sell orders need, against the amount the plan says to hold or buy first.', 'not-applicable', 'Every level is a buy, so the grid starts in the quote asset alone.'));
  }

  // Out of range: what is left holding past either end.
  if (!g.below || !g.above) {
    const missing = [!g.below && 'below', !g.above && 'above'].filter(Boolean).join(' or ');
    checks.push(check('grid.out-of-range', 'Says what happens outside the range', 'Whether the plan says what is held if price leaves the range on either side, and the amount held below it.', 'not-verified', `The plan does not say what happens if price moves ${missing} the range.`));
  } else {
    const buys = g.levels.filter((l) => l.side === 'buy');
    const stated = amountBefore(g.below, g.base);
    const computable = g.priceNow !== null && buys.every((l) => l.usd !== null) && sells.every((l) => l.base !== null || l.usd !== null);
    const expected = computable ? sells.reduce((sum, l) => sum + (l.base ?? l.usd! / g.priceNow!), 0) + buys.reduce((sum, l) => sum + l.usd! / l.price, 0) : null;
    const agrees = stated === null || expected === null || close(stated, expected, 0, 0.005);
    checks.push(
      check(
        'grid.out-of-range',
        'Says what happens outside the range',
        'Whether the plan says what is held if price leaves the range on either side, and, where it names an amount, the base asset every buy filling would leave.',
        agrees ? 'passed' : 'failed',
        !agrees
          ? `Every buy filling leaves ${fmt(expected!)} ${g.base}; the plan says ${fmt(stated!)}.`
          : stated !== null && expected !== null
            ? `It says both, and the ${fmt(stated)} ${g.base} held below the range is what every buy filling leaves.`
            : 'It says what is held if price leaves the range on either side.',
      ),
    );
  }

  // Exchange order rules.
  const text = said(o);
  // "Binance-Peg" names a token, not a venue, so Binance counts only as an exchange.
  const book = /order ?book|limit orders?|\bcex\b|binance (spot|exchange|api)|\bokx\b|bybit/.test(text);
  const pool = /pancakeswap|uniswap|\bpool\b|\bswap\b|\bamm\b/.test(text);
  checks.push(
    book
      ? check('grid.order-rules', 'Minimum order and price step', 'Each order against the venue’s minimum order size and price step.', 'not-verified', 'The plan names an order-book venue; Pokter does not read an exchange’s order rules yet.')
      : pool
        ? check('grid.order-rules', 'Minimum order and price step', 'Each order against the venue’s minimum order size and price step.', 'not-applicable', 'Fills are swaps in a pool, which has no minimum order size or price step. Gas on small orders is a cost the fee check does not include.')
        : check('grid.order-rules', 'Minimum order and price step', 'Each order against the venue’s minimum order size and price step.', 'not-verified', 'The plan does not name where its orders would be placed.'),
  );

  return checks;
}

export const GRID_NOT_COVERED = [
  'The current price against the market at the time the plan names. These checks read the plan, not the chain.',
  'Whether the range or the number of levels is a good choice, and whether the grid will make money: it earns only while price swings across its levels.',
];
