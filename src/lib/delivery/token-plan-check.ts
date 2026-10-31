import { at, briefData, check, isObj, num, str, strAt, type Obj, type PlanCheck } from './plan-check-kit';

/**
 * A token-safety report checked against itself and the brief.
 *
 * A token check has no single right answer to recompute: whether an owner
 * that can mint is a risk is a judgement. What can be held to a rule is
 * that the report is about the token the buyer named, and that its verdict
 * is no milder than its own worst finding — a report that lists a
 * honeypot and still says "safe" has contradicted itself, whatever the
 * token is.
 */

export const TOKEN_METHOD = 'token-plan@1';

const ADDRESS = /0x[0-9a-fA-F]{40}/;
const SEVERITY: Record<string, number> = { ok: 0, pass: 0, safe: 0, low: 0, info: 0, caution: 1, warn: 1, warning: 1, medium: 1, watch: 1, fail: 2, danger: 2, high: 2, critical: 2, avoid: 2, unsafe: 2, scam: 2 };
const severityOf = (word: string | null) => (word ? SEVERITY[word.toLowerCase().trim()] ?? null : null);

export function isTokenReport(o: Obj): boolean {
  const token = strAt(o, 'token', 'address', 'token_address');
  return Boolean(token && ADDRESS.test(token) && (at(o, 'verdict', 'risk_level', 'rating') !== undefined));
}

export function tokenChecks(o: Obj, brief: string | null): PlanCheck[] {
  if (!isTokenReport(o)) return [];
  const checks: PlanCheck[] = [];
  const token = strAt(o, 'token', 'address', 'token_address')!.match(ADDRESS)![0];

  const data = briefData(brief);
  const asked = (data && str(data.token)) ?? brief?.match(ADDRESS)?.[0] ?? null;
  checks.push(
    check(
      'token.subject',
      'Checks the token you named',
      'The token address the report is about against the address in the brief.',
      !asked ? 'not-verified' : asked.toLowerCase() === token.toLowerCase() ? 'passed' : 'failed',
      !asked ? 'The brief is not shown, or names no address.' : asked.toLowerCase() === token.toLowerCase() ? 'The report is about the token the brief named.' : `The brief named ${asked}; the report is about ${token}.`,
    ),
  );

  const verdictWord = strAt(o, 'verdict', 'risk_level', 'rating', 'verdict.label');
  const verdict = severityOf(verdictWord);
  const findings = at(o, 'reasons', 'findings', 'flags');
  const levels = Array.isArray(findings) ? findings.map((f) => (isObj(f) ? severityOf(str(f.level) ?? str(f.severity)) : null)).filter((n): n is number => n !== null) : [];
  const honeypot = at(o, 'measured.honeypot', 'honeypot') === true;
  const sellTax = num(at(o, 'measured.sell_tax_pct', 'sell_tax_pct'));
  const worst = Math.max(levels.length ? Math.max(...levels) : -1, honeypot || (sellTax !== null && sellTax >= 50) ? 2 : -1);
  checks.push(
    check(
      'token.verdict',
      'The verdict is no milder than its findings',
      'The verdict against the most severe finding the report itself lists, and against a honeypot or a sell tax of 50% or more, which always fail.',
      verdict === null || worst < 0 ? 'not-verified' : verdict >= worst ? 'passed' : 'failed',
      verdict === null
        ? 'The verdict is not one Pokter can rank against its findings.'
        : worst < 0
          ? 'The findings do not carry a level to weigh the verdict against.'
          : verdict >= worst
            ? `“${verdictWord}” is as severe as its worst finding.`
            : `“${verdictWord}” is milder than the report’s own worst finding.`,
    ),
  );

  return checks;
}

export const TOKEN_NOT_COVERED = [
  'The findings against the token contract. These checks read the report, not the chain.',
  'Whether the token or the project behind it is a good buy.',
];
