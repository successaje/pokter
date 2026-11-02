import { briefData, check, isObj, num, str, type Obj, type PlanCheck } from './plan-check-kit';

/** Measurable brief and citation checks on a draft, without judging originality or quality. */
export const CONTENT_METHOD = 'content-plan@1';

function draft(o: Obj): string | null {
  return str(o.draft) ?? (isObj(o.content) ? str(o.content.text) : null);
}

export function isContentDraft(o: Obj): boolean {
  return draft(o) !== null && (o.format !== undefined || o.claims !== undefined || o.word_count !== undefined);
}

export function contentChecks(o: Obj, brief: string | null): PlanCheck[] {
  const text = draft(o);
  const words = text?.trim().split(/\s+/u).filter(Boolean).length ?? 0;
  const stated = num(o.word_count);
  const terms = briefData(brief);
  const min = terms ? num(terms.min_words) : null;
  const max = terms ? num(terms.max_words) : null;
  const format = terms ? str(terms.format) : null;
  const deliveredFormat = str(o.format);
  const required = terms && Array.isArray(terms.required_phrases) ? terms.required_phrases.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())) : [];
  const missing = required.filter((phrase) => !text?.toLocaleLowerCase().includes(phrase.toLocaleLowerCase()));
  const claims = Array.isArray(o.claims) ? o.claims : null;
  const uncited = claims?.flatMap((claim, index) => isObj(claim) && str(claim.text) && (str(claim.source) || Array.isArray(claim.sources) && claim.sources.some((source) => str(source))) ? [] : [index + 1]) ?? [];
  return [
    check('content.count', 'The stated word count matches the draft', 'The draft’s whitespace-separated words against the word count supplied with it.',
      !text || stated === null ? 'not-verified' : stated === words ? 'passed' : 'failed',
      !text || stated === null ? 'A draft and stated word count are needed.' : `Counted ${words} words; the answer states ${stated}.`),
    check('content.length', 'Draft fits the brief’s word limits', 'The counted draft words against minimum and maximum word limits supplied as structured brief data.',
      !text || min === null && max === null ? 'not-verified' : (min === null || words >= min) && (max === null || words <= max) ? 'passed' : 'failed',
      !text || min === null && max === null ? 'No structured word limits were available in the brief.' : `${words} words; brief limit ${min ?? 'none'}–${max ?? 'none'}.`),
    check('content.format', 'Names the requested format', 'The delivered format label against the format supplied as structured brief data.',
      !format || !deliveredFormat ? 'not-verified' : format.toLocaleLowerCase() === deliveredFormat.toLocaleLowerCase() ? 'passed' : 'failed',
      !format || !deliveredFormat ? 'The structured brief or delivery does not name a format.' : `Brief: ${format}; delivery: ${deliveredFormat}.`),
    check('content.phrases', 'Includes required brief phrases', 'Literal required phrases from structured brief data against the draft text.',
      !required.length ? 'not-applicable' : !text ? 'not-verified' : missing.length ? 'failed' : 'passed',
      !required.length ? 'No literal required phrases were supplied.' : missing.length ? `Missing: ${missing.join(', ')}.` : `${required.length} required phrases present.`),
    check('content.claims', 'Every listed factual claim names a source', 'A non-empty source beside every factual claim the delivery explicitly lists.',
      !claims ? 'not-verified' : !claims.length ? 'not-applicable' : uncited.length ? 'failed' : 'passed',
      !claims ? 'The delivery does not list factual claims, so their citations cannot be checked.' : !claims.length ? 'No factual claims were listed.' : uncited.length ? `Claims without text or source: ${uncited.join(', ')}.` : `${claims.length} listed claims each name a source.`),
  ];
}

export const CONTENT_NOT_COVERED = [
  'Whether the format label describes the actual draft, or the claims list includes every factual statement in it.',
  'Whether sources support those claims, and the draft’s originality, tone, usefulness or publication rights.',
];
