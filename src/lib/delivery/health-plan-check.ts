import { at, check, close, fmt, isObj, num, numAt, pct, strAt, usd, type Obj, type PlanCheck } from './plan-check-kit';

/**
 * A lending health report checked against its own numbers.
 *
 * A health factor is the collateral counted at each market's liquidation
 * threshold over the debt, so a report that lists its markets carries
 * everything needed to recompute it, and the liquidation distance and the
 * repair amounts follow from it in turn. These checks hold the report to
 * that arithmetic. Whether the figures are what Venus held at the block the
 * report names is the chain check's question (`venus-report-check.ts`),
 * which reads the oracle prices, decimals and thresholds itself.
 */

export const HEALTH_METHOD = 'health-plan@1';

interface Market {
  usd: number;
  threshold: number | null;
}

function marketsOf(value: unknown): Market[] | null {
  if (!isObj(value)) return null;
  const markets = Object.values(value)
    .filter(isObj)
    .map((m) => ({ usd: num(m.usd ?? m.value_usd), threshold: num(m.liquidation_threshold ?? m.threshold) }))
    .filter((m): m is Market => m.usd !== null);
  return markets.length ? markets : null;
}

export function isHealthReport(o: Obj): boolean {
  return numAt(o, 'health_factor', 'healthFactor', 'position.health_factor') !== null;
}

const ADDRESS = /0x[0-9a-fA-F]{40}/g;

export function healthChecks(o: Obj, brief: string | null): PlanCheck[] {
  const hf = numAt(o, 'health_factor', 'healthFactor', 'position.health_factor');
  if (hf === null) return [];
  const checks: PlanCheck[] = [];

  // The wallet: a report on the wrong account is right about nothing the buyer asked.
  const account = strAt(o, 'account', 'wallet', 'address', 'position.account');
  const named = [...new Set((brief?.match(ADDRESS) ?? []).map((a) => a.toLowerCase()))];
  checks.push(
    check(
      'health.subject',
      'Reports on the wallet you named',
      'The account the report is about against the wallet address in the brief.',
      !account || named.length !== 1 ? 'not-verified' : account.toLowerCase() === named[0] ? 'passed' : 'failed',
      !account
        ? 'The report does not name the account it read.'
        : named.length === 0
          ? 'The brief is not shown, or names no wallet.'
          : named.length > 1
            ? 'The brief names more than one address, so which one was meant is not clear.'
            : account.toLowerCase() === named[0]
              ? 'The report is about the wallet the brief named.'
              : `The brief named ${named[0]}; the report is about ${account}.`,
    ),
  );
  const collateral = marketsOf(at(o, 'markets.collateral', 'collateral_markets'));
  const debt = marketsOf(at(o, 'markets.debt', 'debt_markets'));
  const collateralUsd = numAt(o, 'collateral_usd', 'position.collateral_usd');
  const debtUsd = numAt(o, 'debt_usd', 'position.debt_usd');

  // Totals: the markets listed add up to the totals stated.
  if (collateral && debt && collateralUsd !== null && debtUsd !== null) {
    const c = collateral.reduce((sum, m) => sum + m.usd, 0);
    const d = debt.reduce((sum, m) => sum + m.usd, 0);
    const ok = close(c, collateralUsd, 1, 0.005) && close(d, debtUsd, 1, 0.005);
    checks.push(
      check(
        'health.totals',
        'Markets add up to the totals',
        'The collateral and debt listed market by market against the totals the report states, within $1 or 0.5%.',
        ok ? 'passed' : 'failed',
        ok ? `Collateral $${usd(c)} and debt $${usd(d)}, as stated.` : `The markets add up to $${usd(c)} collateral and $${usd(d)} debt; the report states $${usd(collateralUsd)} and $${usd(debtUsd)}.`,
      ),
    );
  }

  // The health factor from the markets and their thresholds.
  const weighted = collateral && collateral.every((m) => m.threshold !== null) ? collateral.reduce((sum, m) => sum + m.usd * m.threshold!, 0) : null;
  const owed = debt ? debt.reduce((sum, m) => sum + m.usd, 0) : debtUsd;
  if (weighted === null || owed === null || owed <= 0) {
    checks.push(
      check(
        'health.follows',
        'The health factor follows from the markets',
        'The health factor against the collateral counted at each market’s liquidation threshold, over the debt.',
        'not-verified',
        owed !== null && owed <= 0 ? 'The report lists no debt, so there is no ratio to recompute.' : 'The report does not list each collateral market with its liquidation threshold.',
      ),
    );
  } else {
    const expected = weighted / owed;
    const ok = close(expected, hf, 0.005, 0.005);
    checks.push(
      check(
        'health.follows',
        'The health factor follows from the markets',
        'The health factor against the collateral counted at each market’s liquidation threshold, over the debt, within 0.005 or 0.5%.',
        ok ? 'passed' : 'failed',
        ok ? `$${usd(weighted)} weighted collateral over $${usd(owed)} debt is ${pct(expected, 4)}, the ${fmt(hf)} stated.` : `$${usd(weighted)} weighted collateral over $${usd(owed)} debt is ${pct(expected, 4)}; the report states ${fmt(hf)}.`,
      ),
    );
  }

  // Liquidatable is the same fact as a health factor below one.
  const liquidatable = at(o, 'liquidatable', 'position.liquidatable');
  if (typeof liquidatable === 'boolean') {
    const ok = liquidatable === hf < 1;
    checks.push(check('health.liquidatable', 'Liquidatable agrees with the health factor', 'The stated liquidatable flag against a health factor below one.', ok ? 'passed' : 'failed', ok ? `${liquidatable ? 'Liquidatable' : 'Not liquidatable'} at ${fmt(hf)}.` : `The report says ${liquidatable ? '' : 'not '}liquidatable at a health factor of ${fmt(hf)}.`));
  }

  // How far collateral can fall: 1 - 1/HF, when the debt holds its price.
  const drop = numAt(o, 'liquidation.all_collateral_drop_pct', 'liquidation_drop_pct', 'drop_to_liquidation_pct');
  if (drop !== null && hf > 0) {
    const expected = (1 - 1 / hf) * 100;
    const ok = close(expected, drop, 0.1, 0.005);
    checks.push(
      check(
        'health.distance',
        'The liquidation distance follows',
        'The stated fall in collateral to liquidation against 1 − 1/health factor, which holds when the debt keeps its price, within 0.1 points.',
        ok ? 'passed' : 'failed',
        ok ? `A ${pct(expected)}% fall takes ${fmt(hf)} to 1, as stated.` : `A ${pct(expected)}% fall takes ${fmt(hf)} to 1; the report states ${fmt(drop)}%.`,
      ),
    );
  }

  // Repairs: repay to the target, or add collateral counted at its threshold.
  const target = numAt(o, 'restore.target_health_factor', 'target_health_factor');
  const repay = numAt(o, 'restore.repay_usd', 'repay_usd');
  const add = numAt(o, 'restore.or_add_weighted_collateral_usd', 'restore.add_weighted_collateral_usd');
  if (target !== null && (repay !== null || add !== null) && owed !== null && owed > 0) {
    const weightedNow = hf * owed;
    const repayExpected = Math.max(0, owed - weightedNow / target);
    const addExpected = Math.max(0, target * owed - weightedNow);
    const ok = (repay === null || close(repayExpected, repay, 0.5, 0.005)) && (add === null || close(addExpected, add, 0.5, 0.005));
    checks.push(
      check(
        'health.restore',
        'The repair amounts reach the target',
        `The debt to repay, and the weighted collateral to add, that take the health factor to the stated ${fmt(target)}, within $0.50 or 0.5%.`,
        ok ? 'passed' : 'failed',
        ok && repayExpected === 0 && addExpected === 0
          ? `At ${fmt(hf)} it is already above ${fmt(target)}, so there is nothing to repay or add, as stated.`
          : ok
          ? `Repaying $${usd(repayExpected)} or adding $${usd(addExpected)} of weighted collateral reaches ${fmt(target)}, as stated.`
          : `Reaching ${fmt(target)} takes repaying $${usd(repayExpected)} or adding $${usd(addExpected)}; the report states ${repay === null ? '—' : `$${usd(repay)}`} and ${add === null ? '—' : `$${usd(add)}`}.`,
      ),
    );
  }

  return checks;
}

export const HEALTH_NOT_COVERED = [
  'Each figure against Venus at the block the report names. That is the chain check, which reads the oracle prices, decimals and thresholds itself and is shown separately where it has run.',
  'What happens next: prices move, and a health factor is true only at its block.',
];
