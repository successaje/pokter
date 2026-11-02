import { keccak256, toHex } from 'viem';

import { canonicalJson } from '@/lib/erc8183/negotiation';
import { GRID_METHOD } from './grid-plan-check';
import { CONTENT_METHOD } from './content-plan-check';
import { RESEARCH_METHOD } from './research-plan-check';
import { TRADING_METHOD } from './trading-plan-check';
import { YIELD_METHOD } from './yield-plan-check';
import type { PlanCheckReport } from './plan-check-kit';

export const PLAN_PROOF_VERSION = 'pokter-plan-check/1' as const;
export const PLAN_PROOF_PREFIX = `${PLAN_PROOF_VERSION} spec=`;
export type PlanProofKind = 'grid' | 'yield' | 'research' | 'trading' | 'content';

/** The stable checks a structured delivery must expose. An outcome may still be not verified. */
const CHECKS: Record<PlanProofKind, readonly string[]> = {
  grid: ['grid.terms', 'grid.bounds', 'grid.spacing', 'grid.budget', 'grid.fees', 'grid.sides', 'grid.out-of-range', 'grid.order-rules', 'answer.dated', 'answer.sources'],
  yield: ['yield.terms', 'yield.net', 'yield.decision', 'yield.incentives', 'answer.dated', 'answer.sources'],
  research: ['research.sources', 'research.provenance', 'research.counts', 'answer.dated', 'answer.sources'],
  trading: ['trading.direction', 'trading.exposure', 'trading.ratio', 'trading.costs', 'answer.dated', 'answer.sources'],
  content: ['content.count', 'content.length', 'content.format', 'content.phrases', 'content.claims', 'answer.dated', 'answer.sources'],
};

const TERMS: Record<PlanProofKind, readonly string[]> = {
  grid: [
    'Pokter checks the grid’s stated levels, spacing, budget, fees and order sides.',
    'It compares buyer terms only when the brief states them as structured data.',
    'It checks for a data date and named sources; missing inputs are not verified, never passed.',
    'Market prices, execution, gas, slippage and future profit are not verified.',
  ],
  yield: [
    'Pokter recalculates net rates from stated rates, costs, amount and holding period.',
    'It checks whether the stated recommendation follows the comparison and threshold.',
    'It compares buyer terms only when the brief states them as structured data.',
    'Actual venue rates and future returns are not verified.',
  ],
  research: [
    'Pokter checks that each structured finding names its source and provenance.',
    'Where a report gives call and answer counts, Pokter recalculates its stated answer rate.',
    'Missing dates and sources are shown; a citation is not verification of the source or claim.',
    'External facts, completeness and the quality of conclusions are not verified.',
  ],
  trading: [
    'Pokter checks a structured trade plan’s direction, size, price-distance arithmetic and risk/reward ratio.',
    'Fee and slippage assumptions must be stated; Pokter does not verify live market prices or execution.',
    'The plan is advisory only and does not move funds or predict profit.',
  ],
  content: [
    'Pokter checks a structured draft’s word count against the buyer’s structured word limits.',
    'It compares a stated format and literal required phrases with the brief, and checks sources beside listed factual claims.',
    'Pokter does not verify source accuracy, originality or editorial quality.',
  ],
};

export interface PlanProofSpec {
  version: typeof PLAN_PROOF_VERSION;
  kind: PlanProofKind;
  method: string;
  requiredChecks: readonly string[];
  limits: readonly string[];
  specHash: string;
}

export function planProofSpec(kind: PlanProofKind): PlanProofSpec {
  const method = { grid: GRID_METHOD, yield: YIELD_METHOD, research: RESEARCH_METHOD, trading: TRADING_METHOD, content: CONTENT_METHOD }[kind];
  const requiredChecks = CHECKS[kind];
  const limits = TERMS[kind];
  const agreed = { version: PLAN_PROOF_VERSION, kind, method, requiredChecks, limits };
  return { ...agreed, specHash: keccak256(toHex(canonicalJson(agreed))) };
}

export function planProofTerms(kind: PlanProofKind): string[] {
  const spec = planProofSpec(kind);
  return [`${PLAN_PROOF_PREFIX}${spec.specHash}`, `Structured delivery checked by ${spec.method}.`, ...spec.limits];
}

/** A different or partial checker is not the one the seller was asked to accept. */
export function planProofCoverage(spec: PlanProofSpec, report: PlanCheckReport | null): { matched: boolean; missing: string[] } {
  if (!report || report.kind !== spec.kind || report.method !== spec.method) return { matched: false, missing: [...spec.requiredChecks] };
  const present = new Set(report.checks.map((check) => check.id));
  const missing = spec.requiredChecks.filter((id) => !present.has(id));
  return { matched: missing.length === 0, missing };
}
