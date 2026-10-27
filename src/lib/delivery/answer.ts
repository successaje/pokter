/**
 * A delivered manifest, read as an answer a buyer can use.
 *
 * Agents shape their results differently, but most say the same few
 * things under a handful of names: the result in a sentence (`answer`,
 * `summary`), a one-word judgement (`verdict`) and why (`reasons`), when
 * the data was read (`as_of`), where it came from (`sources`) and what it
 * does not cover (`assumptions`, `not_checked`). Those lead; everything
 * else follows as labelled fields, the data behind the answer.
 *
 * All of it is untrusted text from the agent. It is returned as data and
 * rendered as text, never as markup, and nothing in it is followed.
 */
export interface DeliveredAnswer {
  asked: string | null;
  title: string | null;
  /** The result in the agent's own words, when it gave one. */
  result: string | null;
  /** A short judgement ("Caution", "Safe"), when the agent gave one, with how it reads. */
  verdict: { text: string; tone: AnswerTone } | null;
  /** Why, one line each, with the agent's own level where it gave one. */
  reasons: Array<{ text: string; tone: AnswerTone }>;
  /** When the agent says it read the data: a time, a block, or both. */
  asOf: { time: string | null; block: string | null } | null;
  sources: string[];
  limitations: string[];
  /** Everything else, in the agent's order. */
  fields: Array<{ label: string; value: unknown }>;
  /** Not JSON: the delivery as plain text. */
  raw: string | null;
  producer: string | null;
  generatedAt: string | null;
}

/** How a verdict or reason reads, from the agent's own word for it; null when it is not one Pokter recognises. */
export type AnswerTone = 'ok' | 'watch' | 'bad' | null;

const ASKED = ['question', 'task', 'subject', 'brief'];
const RESULT = ['answer', 'summary', 'result', 'recommendation', 'conclusion'];
const VERDICT = ['verdict', 'rating', 'risk_level', 'assessment', 'outcome', 'grade'];
const REASONS = ['reasons', 'findings', 'why', 'rationale', 'flags', 'risks'];
const SOURCES = ['sources', 'data_sources', 'source'];
const LIMITS = ['limitations', 'not_checked', 'notChecked', 'unchecked', 'out_of_scope', 'assumptions', 'caveats', 'warning', 'warnings', 'note', 'notes'];

/*
 * Words agents use for how something reads. Only these colour a verdict
 * or a reason; anything else is shown in the agent's words, uncoloured,
 * rather than Pokter guessing whether "Moderate" is good news.
 */
const TONES: Record<Exclude<AnswerTone, null>, string[]> = {
  ok: ['ok', 'pass', 'passed', 'good', 'safe', 'low', 'healthy', 'fine', 'clear', 'info'],
  watch: ['caution', 'warn', 'warning', 'medium', 'moderate', 'watch', 'review', 'risky'],
  bad: ['bad', 'fail', 'failed', 'high', 'danger', 'dangerous', 'critical', 'unsafe', 'avoid', 'scam', 'honeypot'],
};

export function toneOf(word: unknown): AnswerTone {
  if (typeof word !== 'string') return null;
  const w = word.trim().toLowerCase();
  for (const tone of ['bad', 'watch', 'ok'] as const) if (TONES[tone].includes(w)) return tone;
  return null;
}

/** A verdict is a short judgement; a paragraph under that key is a result, not a verdict. */
function verdictFrom(value: unknown): DeliveredAnswer['verdict'] {
  const t = text(value);
  return t && t.length <= 40 ? { text: t, tone: toneOf(t) } : null;
}

/** Reasons as lines, keeping a level the agent attached to each (`{ level, finding }`). */
function reasonsFrom(value: unknown): DeliveredAnswer['reasons'] {
  if (!Array.isArray(value)) return lines(value).map((t) => ({ text: t, tone: null }));
  return value.flatMap((item) => {
    if (typeof item === 'string') return item.trim() ? [{ text: item.trim(), tone: null }] : [];
    if (!item || typeof item !== 'object') return [];
    const o = item as Record<string, unknown>;
    const said = text(o.finding) ?? text(o.text) ?? text(o.reason) ?? text(o.message) ?? text(o.detail) ?? text(o.description);
    if (said) return [{ text: said, tone: toneOf(o.level ?? o.severity ?? o.status ?? o.tone) }];
    return lines([item]).map((t) => ({ text: t, tone: null }));
  });
}
const PLUMBING = new Set(['agent', 'agentid', 'chainid', 'job', 'deliveredat', 'title', 'as_of', 'asof']);

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** A string, or a list of strings and small objects, as lines of text. */
function lines(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap((item) => (typeof item === 'string' ? [item] : item && typeof item === 'object' ? [Object.values(item).filter((v) => typeof v === 'string' || typeof v === 'number').join(' · ')] : [])).filter(Boolean);
  if (value && typeof value === 'object') return Object.entries(value).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'string' || typeof v === 'number' ? v : JSON.stringify(v)}`);
  return [];
}

/** The buyer's own words from a brief, unwrapping Pokter's JSON envelope when there is one. */
export function briefText(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  // Pokter's own briefs travel as a JSON envelope with the words in `task`.
  try {
    const inner = JSON.parse(raw) as { task?: unknown };
    return text(inner.task) ?? raw;
  } catch {
    return raw;
  }
}

/**
 * When the agent read the data, and only that.
 *
 * This fell back to `generated_at`, which is when the report was written.
 * The page prints the result as "Data read <time>", so a report composed
 * now from an hour-old reading claimed the reading was now — Pokter
 * stating a freshness nobody measured, on the one figure that decides
 * whether an answer is still true.
 *
 * An agent that does not say stays unknown. `generated_at` is still
 * carried, as `generatedAt`, and shown under its own name.
 */
function asOfFrom(value: unknown): DeliveredAnswer['asOf'] {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    const time = text(o.time) ?? text(o.timestamp) ?? null;
    const block = o.block !== undefined && o.block !== null ? String(o.block) : null;
    if (time || block) return { time, block };
  }
  if (typeof value === 'string' && value.trim()) return { time: value.trim(), block: null };
  return null;
}

export function readDeliveredAnswer(manifestText: string): DeliveredAnswer {
  const empty: DeliveredAnswer = { asked: null, title: null, result: null, verdict: null, reasons: [], asOf: null, sources: [], limitations: [], fields: [], raw: null, producer: null, generatedAt: null };
  let manifest: { response?: { content?: unknown }; metadata?: Record<string, unknown> };
  try {
    manifest = JSON.parse(manifestText) as typeof manifest;
  } catch {
    return { ...empty, raw: manifestText };
  }
  const metadata = manifest.metadata ?? {};
  const producer = text(metadata.producer);
  const generatedAt = text(metadata.generated_at);
  const content = manifest.response?.content;
  let object: Record<string, unknown> | null = null;
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) object = parsed as Record<string, unknown>;
    } catch {
      return { ...empty, producer, generatedAt, raw: content };
    }
  } else if (content && typeof content === 'object' && !Array.isArray(content)) {
    object = content as Record<string, unknown>;
  }
  if (!object) return { ...empty, producer, generatedAt, raw: typeof content === 'string' ? content : manifestText };

  const pick = (keys: string[]) => keys.find((key) => object![key] !== undefined && object![key] !== null && object![key] !== '');
  const askedKey = pick(ASKED);
  const resultKey = RESULT.find((key) => text(object![key]));
  const verdictKey = VERDICT.find((key) => verdictFrom(object![key]));
  const reasonsKey = pick(REASONS);
  const sourceKey = pick(SOURCES);
  const limitKeys = LIMITS.filter((key) => object![key] !== undefined && object![key] !== null && object![key] !== '');
  const used = new Set([askedKey, resultKey, verdictKey, reasonsKey, sourceKey, ...limitKeys].filter(Boolean) as string[]);

  return {
    asked: askedKey ? briefText(object[askedKey]) : null,
    title: text(object.title),
    result: resultKey ? text(object[resultKey]) : null,
    verdict: verdictKey ? verdictFrom(object[verdictKey]) : null,
    reasons: reasonsKey ? reasonsFrom(object[reasonsKey]) : [],
    asOf: asOfFrom(object.as_of ?? object.asOf),
    sources: sourceKey ? lines(object[sourceKey]) : [],
    limitations: limitKeys.flatMap((key) => lines(object![key])),
    fields: Object.entries(object)
      .filter(([key]) => !used.has(key) && !PLUMBING.has(key.toLowerCase()))
      .map(([key, value]) => ({ label: key.replace(/_/g, ' '), value })),
    raw: null,
    producer,
    generatedAt,
  };
}

/** A small flat object as readable text ("lower 1800 · upper 2200"), or null when it is not one. */
export function flatText(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 6) return null;
  if (!entries.every(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v))) return null;
  return entries.map(([k, v]) => `${k.replace(/_/g, ' ')} ${v === null ? '—' : String(v)}`).join(' · ');
}
