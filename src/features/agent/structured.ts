import type { DeclaredSkill } from '@/lib/agents/capabilities';
import type { SampleDelivery } from '@/lib/agent/sample-delivery';
import { flatText } from '@/lib/delivery/answer';

/**
 * The five questions a buyer brings to a profile, each answered from
 * something the page already holds, with who said it.
 *
 * Nothing is written to fill a gap. A section with no source says so,
 * because "this agent publishes no example brief" is itself something a
 * buyer should weigh — and a filled-in guess would read exactly like the
 * operator's own word.
 */
export type Said = 'operator' | 'agent' | 'pokter' | 'buyer';

export interface StructuredLine {
  text: string;
  by: Said;
}

export interface StructuredProfile {
  does: { text: string | null };
  send: { example: StructuredLine | null; answered: { text: string; jobId: string } | null };
  back: { result: string | null; jobId: string | null; relayed: boolean; lifecycleOnly: boolean };
  goodFor: { skills: string[]; category: { label: string; declared: boolean } | null };
  limits: StructuredLine[];
}

export interface StructuredInput {
  description: string;
  skills: Pick<DeclaredSkill, 'name' | 'kind' | 'examples'>[];
  sample: Pick<SampleDelivery, 'jobId' | 'kind' | 'asked' | 'title' | 'fields' | 'result' | 'limitations'> | null;
  category: { label: string; source: 'declared' | 'name' | 'description' | null } | null;
  hireBlocker: { reason: string } | null;
  warnings: string[];
}

const one = (value: string | null | undefined, max: number): string | null => {
  const t = value?.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};

/** The agent's answer in a sentence: its stated result, else its title, else the first field that reads as text. */
function resultOf(sample: NonNullable<StructuredInput['sample']>): string | null {
  if (sample.result) return one(sample.result, 360);
  if (sample.title) return one(sample.title, 360);
  for (const field of sample.fields) {
    const value = typeof field.value === 'string' ? field.value : flatText(field.value);
    if (value) return one(`${field.label}: ${value}`, 360);
  }
  return null;
}

export function structuredProfile(p: StructuredInput): StructuredProfile {
  // The paid skill is the one a hire runs, so its example is the brief that fits a hire.
  const ordered = [...p.skills].sort((a, b) => Number(b.kind === 'paid') - Number(a.kind === 'paid'));
  const example = ordered.flatMap((s) => s.examples).map((e) => one(e, 300)).find(Boolean) ?? null;

  /*
   * A lifecycle demonstration is Pokter's seller proving the escrow works;
   * nothing in it came from the agent. Shown under "what you get back" it
   * would put Pokter's receipt in the agent's mouth, so it only changes
   * what the empty state says.
   */
  const answer = p.sample && p.sample.kind !== 'lifecycle' ? p.sample : null;
  const asked = answer ? one(answer.asked, 300) : null;

  const named = p.skills.filter((s) => s.kind === 'capability').map((s) => s.name);
  const skills = (named.length > 0 ? named : p.skills.map((s) => s.name)).filter(Boolean).slice(0, 6);

  const limits: StructuredLine[] = [];
  const seen = new Set<string>();
  const add = (text: string | null | undefined, by: Said) => {
    const t = one(text, 400);
    if (!t || seen.has(t.toLowerCase())) return;
    seen.add(t.toLowerCase());
    limits.push({ text: t, by });
  };
  for (const limitation of answer?.limitations.slice(0, 3) ?? []) add(limitation, 'agent');
  if (p.hireBlocker) add(p.hireBlocker.reason, 'pokter');
  for (const warning of p.warnings) add(warning, 'pokter');

  return {
    does: { text: one(p.description, 600) },
    send: {
      example: example ? { text: example, by: 'operator' } : null,
      answered: asked && answer ? { text: asked, jobId: answer.jobId } : null,
    },
    back: {
      result: answer ? resultOf(answer) : null,
      jobId: answer?.jobId ?? null,
      relayed: answer?.kind === 'relayed',
      lifecycleOnly: p.sample?.kind === 'lifecycle',
    },
    goodFor: {
      skills,
      category: p.category ? { label: p.category.label, declared: p.category.source === 'declared' } : null,
    },
    limits,
  };
}
