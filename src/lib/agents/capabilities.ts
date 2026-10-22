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
 * under `negotiate`, `negotiate-erc8183-job` and `erc8183-job-status`. A
 * negotiate skill whose operator named it after the work is kept as the
 * paid job (see `SkillKind`).
 */
const PLUMBING_IDS = new Set([
  'negotiate',
  'negotiate-erc8183-job',
  'erc8183-job-status',
  'notify_funded',
  'notify-funded',
]);

const PLUMBING_NAME = /^(negotiate\b|erc-?8183\b|job funded$|notify)/i;

/**
 * What a declared skill is for, as far as Pokter acts on it.
 *
 * - `paid`: the priced job (the ERC-8183 negotiate skill) when its operator
 *   named it after the work. Stockroom calls its negotiate skill "Quote a
 *   Stockroom borrow desk brief" and documents the brief format there and
 *   nowhere else; dropping it as plumbing left its profile saying "No skills
 *   declared" and its hire page offering a generic brief.
 * - `preview`: a free call outside escrow (IVL's `preview`). Its input format
 *   says how to ask for the preview, not what the paid job accepts.
 * - `capability`: anything else the agent says it does.
 */
export type SkillKind = 'capability' | 'paid' | 'preview';

export interface DeclaredSkill {
  /**
   * The card's own skill id, as declared.
   *
   * Carried because the hire page compiles the buyer's brief against this
   * skill and the courier delivers to it, and the two have to be the same
   * skill. Matching on `name` nearly worked: `pickWorkSkill` chooses by id,
   * and an operator whose id and name differ — `venus-health-factor` named
   * "Venus health factor report" — would have the page compile against one
   * skill and the delivery go to another. Empty when the card omits it, in
   * which case the name is the id, exactly as `pickWorkSkill` reads it.
   */
  id: string;
  name: string;
  kind: SkillKind;
  description: string | null;
  /**
   * How the agent says to ask it, in its own words.
   *
   * A2A cards carry `examples` on a skill and Pokter dropped them at
   * parse time, then offered buyers a task template chosen by category
   * instead. For an agent in no category that meant generic DeFi
   * wording — and Pokter's own evidence agent was hired on mainnet with
   * a brief it had to refuse, while its card published the two formats
   * that would have worked.
   */
  examples: string[];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

const PAID_IDS = new Set(['negotiate', 'negotiate-erc8183-job']);

function kindOf(id: string, name: string, tags: unknown): SkillKind | null {
  const tagged = Array.isArray(tags) ? tags.map((tag) => text(tag).toLowerCase()) : [];
  if (PAID_IDS.has(id)) return PLUMBING_NAME.test(name) ? null : 'paid';
  if (PLUMBING_IDS.has(id) || PLUMBING_NAME.test(name)) return null;
  if (id === 'preview' || tagged.includes('preview') || /\(free\)|\bfree preview\b/i.test(name)) return 'preview';
  return 'capability';
}

/**
 * Example requests written into a skill's description rather than its
 * `examples` array: the `task_description` of a data part the operator
 * shows. Stockroom documents its only brief format this way. A placeholder
 * ("...", "…") is the operator saying nothing, and is not an example.
 */
export function examplesInDescription(description: string): string[] {
  const found: string[] = [];
  for (const match of description.matchAll(/"task_description"\s*:\s*"((?:[^"\\]|\\.){1,200})"/g)) {
    const example = match[1].replace(/\\"/g, '"').trim();
    if (example.length < 3 || /^(?:\.{2,}|…|<[^>]*>)$/.test(example)) continue;
    found.push(example);
  }
  return found;
}

/**
 * The description without its wire instructions. Sentences holding a
 * payload ("Send a data part {...}") or the escrow steps ("Anchor the
 * returned envelope…") say how to call the skill, which the hire flow does
 * for the buyer; the rest say what it is for and what it needs. Kept whole
 * when nothing else is left.
 */
export function readableDescription(description: string): string {
  const sentences = description.split(/(?<=[.!?])\s+(?=[A-Z])/);
  const kept = sentences.filter((sentence) => !sentence.includes('{') && !/^(?:Anchor|POST|Then send)\b/.test(sentence.trim()));
  const readable = kept.join(' ').trim();
  return readable.length >= 20 ? readable : description;
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
    const declaredId = text(skill.id);
    const id = declaredId.toLowerCase();
    const name = text(skill.name);

    if (!name) continue;
    const kind = kindOf(id, name, skill.tags);
    if (!kind) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const description = text(skill.description);
    const listed = Array.isArray(skill.examples) ? skill.examples.map((example) => text(example)) : [];
    kept.push({
      /* As declared, not lowercased: `pickWorkSkill` compares the raw id
         and a skill whose id was folded would stop matching its own card. */
      id: declaredId || name,
      name,
      kind,
      description: description ? readableDescription(description) : null,
      examples: [...new Set([...listed, ...examplesInDescription(description)])]
        .filter((example) => example.length > 0 && example.length <= 200)
        .slice(0, 4),
    });
    if (kept.length === limit) break;
  }

  return kept;
}

/** The id of a card's free preview skill, if it declares one. */
export function previewSkillId(skills: unknown): string | null {
  if (!Array.isArray(skills)) return null;
  for (const entry of skills) {
    if (typeof entry !== 'object' || entry === null) continue;
    const skill = entry as Record<string, unknown>;
    const id = text(skill.id);
    if (id && kindOf(id.toLowerCase(), text(skill.name), skill.tags) === 'preview') return id;
  }
  return null;
}

/**
 * What an MCP agent serves, as skills.
 *
 * An agent that publishes only an MCP endpoint showed "No skills declared
 * on its card" on its own page while Pokter's prober had already read its
 * tool list and the API was publishing it under `measured.capabilities`.
 * 4LPHA's Grid agent serves nine tools and its listing named none of them,
 * so the one column on the page headed "It claims" claimed nothing.
 *
 * The same plumbing rule as the card path, deliberately: a tool called
 * `notify_funded` is job plumbing over either transport, and inventing a
 * second rule here would make the two listings disagree about what counts
 * as a capability.
 *
 * Everything is `capability`. The paid and preview kinds come from an A2A
 * card's `id` and `tags` taxonomy, which MCP has no equivalent of, and
 * guessing a tool is the paid job from its name would put a claim on the
 * page that nothing checked. `examples` is empty for the same reason: a
 * JSON Schema says what arguments are accepted, not how the operator says
 * to ask — see `templatesFromSkills`, which builds briefs from examples
 * and so is correctly left with nothing to offer here.
 */
export function mcpCapabilities(tools: unknown, limit = 4): DeclaredSkill[] {
  if (!Array.isArray(tools)) return [];

  const seen = new Set<string>();
  const kept: DeclaredSkill[] = [];

  for (const entry of tools) {
    if (typeof entry !== 'object' || entry === null) continue;
    const tool = entry as Record<string, unknown>;
    const name = text(tool.name);
    if (!name) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    // A tool name is the whole identifier here: there is no separate id.
    if (PLUMBING_IDS.has(key) || PLUMBING_NAME.test(name)) continue;
    seen.add(key);

    const description = text(tool.description);
    kept.push({
      // A tool name is the whole identifier over MCP; there is no separate id.
      id: name,
      name,
      kind: 'capability',
      description: description ? readableDescription(description) : null,
      examples: [],
    });
    if (kept.length >= limit) break;
  }

  return kept;
}
