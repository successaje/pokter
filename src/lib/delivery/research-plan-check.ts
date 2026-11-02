import { check, close, isObj, num, type Obj, type PlanCheck } from './plan-check-kit';

/** Checks the evidence trail a research answer actually supplies, without treating a citation as truth. */
export const RESEARCH_METHOD = 'research-plan@1';

type Finding = { name: string; value: unknown; source: unknown; provenance: unknown };

function findings(o: Obj): Finding[] {
  const listed = o.findings ?? o.claims;
  const listedFindings: Finding[] = Array.isArray(listed)
    ? listed.filter(isObj).map((item, index) => ({
      name: String(item.claim ?? item.finding ?? item.name ?? `Finding ${index + 1}`),
      value: item.value ?? item.claim ?? item.finding,
      source: item.source ?? item.sources,
      provenance: item.provenance,
    }))
    : [];
  const measuredFields: Finding[] = Object.entries(o).flatMap(([name, value]) =>
    isObj(value) && ('value' in value || 'source' in value || 'provenance' in value)
      ? [{ name, value: value.value, source: value.source ?? value.sources, provenance: value.provenance }]
      : []);
  return [...listedFindings, ...measuredFields];
}

const named = (value: unknown): boolean => typeof value === 'string' ? Boolean(value.trim()) : Array.isArray(value) && value.length > 0 && value.every(named);

export function isResearchReport(o: Obj): boolean {
  const items = findings(o);
  return items.length >= 2 && (items.some((item) => named(item.source) || named(item.provenance)) || Array.isArray(o.findings) || Array.isArray(o.claims) || o.type === 'research' || o.kind === 'research');
}

export function researchChecks(o: Obj): PlanCheck[] {
  const items = findings(o);
  const withValue = items.filter((item) => item.value !== undefined && item.value !== null && item.value !== '');
  const missingSource = withValue.filter((item) => !named(item.source)).map((item) => item.name);
  const missingProvenance = withValue.filter((item) => !named(item.provenance)).map((item) => item.name);
  const checks = [
    check('research.sources', 'Every finding names its source', 'A source beside every structured finding or measured figure in the delivered answer.',
      !withValue.length ? 'not-verified' : missingSource.length ? 'failed' : 'passed',
      !withValue.length ? 'No structured findings with values were supplied.' : missingSource.length ? `Missing sources: ${missingSource.join(', ')}.` : `${withValue.length} findings each name a source.`),
    check('research.provenance', 'Every finding names its provenance', 'A provenance label beside every structured finding or measured figure in the delivered answer.',
      !withValue.length ? 'not-verified' : missingProvenance.length ? 'failed' : 'passed',
      !withValue.length ? 'No structured findings with values were supplied.' : missingProvenance.length ? `Missing provenance: ${missingProvenance.join(', ')}.` : `${withValue.length} findings each name provenance.`),
  ];

  const calls = isObj(o.calls) && isObj(o.calls.value) ? o.calls.value : null;
  const uptime = isObj(o.uptime) ? num(o.uptime.value) : null;
  const taken = calls ? num(calls.taken) : null;
  const answered = calls ? num(calls.answered) : null;
  const countsPresent = o.calls !== undefined || o.uptime !== undefined;
  const completeCounts = taken !== null && answered !== null && uptime !== null;
  const validCounts = completeCounts && Number.isInteger(taken) && Number.isInteger(answered) && taken > 0 && answered >= 0 && answered <= taken && uptime >= 0 && uptime <= 1;
  checks.push(check('research.counts', 'Reported answer rate follows its counts', 'The reported answered and taken counts, and the answer rate when supplied.',
    !countsPresent ? 'not-applicable' : !completeCounts ? 'not-verified' : !validCounts ? 'failed' : close(uptime, answered / taken, 0.0005) ? 'passed' : 'failed',
    !countsPresent ? 'This report gives no call or answer counts.' : !completeCounts ? 'A taken count, answered count and answer rate are needed to recalculate this figure.' : !validCounts ? 'The counts or rate are outside their valid range.' : `${answered} answered of ${taken} taken; the stated rate is ${uptime}.`));
  return checks;
}

export const RESEARCH_NOT_COVERED = [
  'Whether a named source exists, supports the finding, or was read correctly.',
  'Whether the research is complete, its conclusions are sound, or its data is current.',
];
