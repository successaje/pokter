/**
 * What an agent advertises it can do, taken from its own Agent Card.
 *
 * Not a Pokter-authored description, and deliberately not presented as one.
 * Pokter cannot say what an agent does — it has never seen one do anything
 * except answer a probe, and writing "reads your Venus position and returns
 * the health factor" over a registry string would be Pokter making a claim
 * it cannot stand behind. That is the one thing this product must not do.
 *
 * What it can do is prefer the better of the operator's two statements. The
 * registry `description` is free text written once at mint, and it shows:
 * across the catalogue it ranges from "Automated portfolio rebalancing" to
 * "Uncommon-tier Yi He Nexus autonomous trading agent. Class: Yield Weaver
 * [Farm Strategist]". The Agent Card's `skills` are structured, named, live
 * at the endpoint right now, and are what the agent offers to other agents
 * in negotiation — a claim it has to keep rather than one it typed once.
 *
 * 41 of the 79 listed agents publish usable skills. The rest keep the
 * description they had.
 */

/**
 * Skills that are protocol plumbing rather than capabilities.
 *
 * Every ERC-8183 seller publishes these so a job can be negotiated and
 * funded. They say nothing about what the agent is for, and listing
 * "Negotiate an ERC-8183 job" as a capability would push the real ones out
 * of a short line — on several agents it is the only thing that would show.
 *
 * Matched on id, with a name fallback, because the same plumbing appears
 * under `negotiate`, `negotiate-erc8183-job` and `erc8183-job-status`.
 */
const PLUMBING_IDS = new Set([
  'negotiate',
  'negotiate-erc8183-job',
  'erc8183-job-status',
  'notify_funded',
  'notify-funded',
]);

const PLUMBING_NAME = /^(negotiate\b|erc-?8183\b|job funded$|notify)/i;

export interface DeclaredSkill {
  name: string;
  description: string | null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The capabilities worth showing, in declaration order.
 *
 * Returns an empty list rather than a placeholder when nothing survives:
 * an agent whose card holds only plumbing has told us nothing, and the
 * caller falls back to the description instead of printing an empty
 * heading.
 */
export function declaredCapabilities(
  skills: unknown,
  limit = 4,
): DeclaredSkill[] {
  if (!Array.isArray(skills)) return [];

  const seen = new Set<string>();
  const kept: DeclaredSkill[] = [];

  for (const entry of skills) {
    if (typeof entry !== 'object' || entry === null) continue;
    const skill = entry as Record<string, unknown>;
    const id = text(skill.id).toLowerCase();
    const name = text(skill.name);

    if (!name) continue;
    if (PLUMBING_IDS.has(id) || PLUMBING_NAME.test(name)) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    kept.push({ name, description: text(skill.description) || null });
    if (kept.length === limit) break;
  }

  return kept;
}
