import { EVIDENCE_CHAINS, parseAgentRef } from '@/lib/evidence/refs';
import type { ChainId } from '@/lib/scan/types';

/**
 * The agent a brief is explicitly about, when its skill needs one named.
 *
 * Pokter's evidence agent publishes its input contract on its card — "Give it
 * an agent reference — 56/303779, eip155:56:303779 or a bare token id" with
 * `examples: ["56/303779", "eip155:97:2554"]` — and reads it from
 * `data.agent`. The courier sent only prose, so the agent fell back to
 * parsing the whole task description as a reference and answered 400. Job
 * 1585 failed that way on every run for a day, with its escrow funded.
 *
 * The subject is not inferred. It is read from the signed brief, which names
 * it outright: "Report on agent 97/2618 (Brinkwatch on BNB Testnet)". What
 * follows is parsing an explicit reference out of text that contains one, and
 * refusing whenever that is not what the text contains.
 *
 * Three refusals, all of them preferred to a guess:
 *
 *  - **none** — no chain-qualified reference in the brief. A bare number is
 *    deliberately not accepted: `2618` alone could be a budget, a count or a
 *    block, and treating it as a token id would be the inference this avoids.
 *    The agent's card offers a bare form, and Pokter does not use it.
 *  - **ambiguous** — two or more distinct agents named. Picking the first
 *    would be choosing a subject on the buyer's behalf.
 *  - a reference naming a chain the skill does not serve is dropped rather
 *    than retargeted, which is `parseAgentRef`'s own rule for chains Pokter
 *    does not index, and asked again here for the narrower set a caller
 *    names. Reusing that parser rather than writing a second one is what
 *    makes what Pokter extracts and what the agent accepts the same thing by
 *    construction.
 */
export type BriefSubject =
  | { ok: true; agent: string; chainId: ChainId; tokenId: string }
  | { ok: false; code: 'none' | 'ambiguous'; candidates: string[] };

/**
 * Chain-qualified references only.
 *
 * `eip155:97:2554`, `97/2618` and `97:2618`. The chain must then be one the
 * skill serves, which `parseAgentRef` enforces — and which incidentally
 * clears most false positives: a date like `22/10` and a time like `11:18`
 * name chains 22 and 11, neither of which is listed.
 */
const CANDIDATE = /\b(?:eip155:\d+:(?:0x[0-9a-fA-F]{40}\/)?\d+|\d+\s*[/:]\s*\d+)\b/g;

export function subjectFromBrief(task: string, chains: readonly ChainId[] = EVIDENCE_CHAINS): BriefSubject {
  const fallback = chains[0] as ChainId;
  const seen = new Map<string, { chainId: ChainId; tokenId: string; text: string }>();

  for (const match of task.matchAll(CANDIDATE)) {
    const candidate = match[0].replace(/\s+/g, '');
    const ref = parseAgentRef(candidate, fallback);
    if (!ref) continue;
    /*
     * And one of the chains this skill serves. `parseAgentRef` refuses
     * chains Pokter does not index at all; this is the narrower question,
     * asked here because the answer belongs to the caller. A chain added
     * to the evidence index for another purpose must not quietly become a
     * chain this skill is asked to report on.
     */
    if (!chains.includes(ref.chainId)) continue;
    seen.set(`${ref.chainId}:${ref.tokenId}`, { ...ref, text: candidate });
  }

  const found = [...seen.values()];
  if (found.length === 0) return { ok: false, code: 'none', candidates: [] };
  if (found.length > 1) {
    return { ok: false, code: 'ambiguous', candidates: found.map((f) => `${f.chainId}/${f.tokenId}`) };
  }

  const [only] = found;
  /*
   * Emitted in the first form the card's own examples use, so what travels
   * is a shape the agent has published rather than one Pokter invented.
   */
  return { ok: true, agent: `${only.chainId}/${only.tokenId}`, chainId: only.chainId, tokenId: only.tokenId };
}

/**
 * Which skills need a subject named in `data`, and under which key.
 *
 * A short list rather than a guess at every agent's contract. An agent that
 * publishes `examples` says what it accepts, and reading those generally is
 * worth doing — the note in `hire/taskTemplates` argues for it — but that is
 * a larger change than repairing one funded job, and inventing a key for a
 * skill nobody has described would be worse than sending what we send today.
 */
const SUBJECT_SKILLS: Record<string, 'agent'> = { agent_evidence: 'agent' };

export function subjectKeyForSkill(skillId: string): 'agent' | null {
  return SUBJECT_SKILLS[skillId] ?? null;
}
