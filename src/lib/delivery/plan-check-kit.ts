/**
 * What a check on a delivered answer says, and the small readers every
 * kind of check shares.
 *
 * A plan check compares an answer with itself and with the brief it was
 * given: whether a grid's levels follow from its range and step, whether a
 * yield comparison's net rates follow from its rates and costs, whether a
 * re-centre's ticks sit on the pool's tick grid. Nothing here reads the
 * chain, so a plan check never goes stale and anyone can repeat it from the
 * delivered record. What the chain said at the answer's block is a
 * different question, answered by checks that name their block
 * (`venus-report-check` for a health factor).
 *
 * The outcomes are ProofRun's three, plus one. `not-applicable` is kept
 * apart from `not-verified` because they tell a buyer opposite things: one
 * says the rule does not apply to this kind of plan, the other that it
 * does and Pokter could not settle it. A plan that leaves something out is
 * `not-verified` with the omission named, never `passed`.
 */

export type PlanCheckOutcome = 'passed' | 'failed' | 'not-verified' | 'not-applicable';

export interface PlanCheck {
  /** Stable across rewording, so two runs can be compared: `grid.spacing`. */
  id: string;
  label: string;
  /** Exactly what was compared, in one sentence. A pass means this and nothing wider. */
  tested: string;
  outcome: PlanCheckOutcome;
  /** What Pokter found: the figures on both sides, or what was missing. */
  detail: string;
}

export type PlanKind = 'grid' | 'yield' | 'range' | 'health' | 'token';

export interface PlanCheckReport {
  kind: PlanKind | null;
  /** The checker and its revision, e.g. `grid-plan@1`. Bumped when a rule or a tolerance changes. */
  method: string;
  label: string;
  checks: PlanCheck[];
  /** What these checks do not cover, said plainly beside the results. */
  notCovered: string[];
}

export type Obj = Record<string, unknown>;

export const isObj = (value: unknown): value is Obj => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** A number however the agent wrote it: 1.5, "1.5", "1,500", "3.5%". */
export function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/,/g, '').replace(/%$/, '');
  if (!/^-?\d*\.?\d+(e[-+]?\d+)?$/i.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** The value at the first dotted path that holds one. */
export function at(o: unknown, ...paths: string[]): unknown {
  for (const path of paths) {
    let cur: unknown = o;
    for (const key of path.split('.')) cur = isObj(cur) ? cur[key] : undefined;
    if (cur !== undefined && cur !== null && cur !== '') return cur;
  }
  return undefined;
}

export const numAt = (o: unknown, ...paths: string[]) => num(at(o, ...paths));
export const strAt = (o: unknown, ...paths: string[]) => str(at(o, ...paths));

/** Within the larger of an absolute and a relative band, the rule Pokter's chain checks use too. */
export function close(a: number, b: number, abs: number, rel = 0): boolean {
  return Math.abs(a - b) <= Math.max(abs, rel * Math.max(Math.abs(a), Math.abs(b)));
}

/** A figure as a reader would write it: no float tails, no exponent below a trillion. */
export function fmt(n: number): string {
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e12 || abs < 1e-6) return n.toExponential(3);
  return Number(n.toPrecision(6)).toLocaleString('en-US', { maximumFractionDigits: 8 });
}

/** A percentage or a rate to the decimals a reader compares: 25.58, 5.145. */
export const pct = (n: number, dp = 2) => Number(n.toFixed(dp)).toLocaleString('en-US', { maximumFractionDigits: dp });

/** Dollars to the cent. */
export const usd = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A time the way Pokter's pages print one: 20 Oct 2026, 16:55 UTC. Anything unparseable as written. */
export function utcTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const month = d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  return `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}, ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The answer as an object, wherever the delivery record put it. */
export function deliveredObject(manifestText: string): Obj | null {
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    return null;
  }
  const content = isObj(manifest) && isObj(manifest.response) ? manifest.response.content : manifest;
  let object: unknown = content;
  if (typeof content === 'string') {
    try {
      object = JSON.parse(content);
    } catch {
      return null;
    }
  }
  if (!isObj(object)) return null;
  // Pokter's courier carries an agent's answer under `answer`, beside the job it was relayed for.
  if (isObj(object.answer) && isObj(object.answered_by)) return object.answer;
  return object;
}

/** All of the answer's text, lower-cased, for checks that ask whether something was said at all. */
export function said(o: unknown): string {
  return JSON.stringify(o ?? '').toLowerCase();
}

/**
 * The terms the brief set, when it set them as data.
 *
 * Pokter's own briefs travel as `{task, data}`; a brief written only in
 * words has no data to compare with, and the check that needs it says so
 * instead of guessing numbers out of prose.
 */
export function briefData(brief: string | null | undefined): Obj | null {
  if (!brief) return null;
  try {
    const parsed = JSON.parse(brief) as unknown;
    if (isObj(parsed) && isObj(parsed.data)) return parsed.data;
    return isObj(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export const check = (id: string, label: string, tested: string, outcome: PlanCheckOutcome, detail: string): PlanCheck => ({ id, label, tested, outcome, detail });
