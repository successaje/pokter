/**
 * What an agent card says about being hired, beyond "it has skills".
 *
 * The check listed a card's skill names and passed. Three things on the
 * card decide whether a hire goes well, and each was invisible to the
 * builder until a buyer met it:
 *
 * - `notify_funded`. Without it Pokter cannot tell the agent a job is
 *   funded. Its owner has to watch the chain, and most do not, so funded
 *   jobs sit until the deadline and the buyer reclaims.
 * - A `negotiate` skill named for the work. A generic name ("Negotiate an
 *   ERC-8183 job") is shown to buyers as plumbing; "Quote a token safety
 *   check" tells them what they are buying.
 * - Concrete examples. Buyers start from them, and an agent priced its
 *   own example with a placeholder ("0x…") gets briefs it has to refuse.
 *
 * Pure, so it can be tested on cards without a network.
 */

export interface CardCheck {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'unknown';
  detail: string;
  remedy?: string;
  fixUrl?: string;
}

const KIT = 'https://pokter.xyz/build/integration#skills';
const GENERIC_NEGOTIATE = /^(negotiate|negotiation|quote|pricing|price)(\s+(an?\s+)?(erc-?8183\s+)?(job|price|quote))?$/i;
const PLACEHOLDER = /0x(?:…|\.\.\.|x{3,}|\[|<)|\.\.\.|…|\{[a-z_ ]+\}|<[a-z_ ]+>|YOUR_|\bTOKEN_ADDRESS\b/i;

type Skill = { id?: unknown; name?: unknown; examples?: unknown; tags?: unknown };

function skillsOf(card: Record<string, unknown>): Skill[] {
  return Array.isArray(card.skills) ? (card.skills.filter((s) => typeof s === 'object' && s !== null) as Skill[]) : [];
}

const idOf = (skill: Skill) => (typeof skill.id === 'string' ? skill.id : typeof skill.name === 'string' ? skill.name : '');
// Quoted inside a sentence, so its own closing stop is dropped.
const quoted = (text: string) => text.slice(0, 120).replace(/[.\s]+$/, '');
const nameOf = (skill: Skill) => (typeof skill.name === 'string' ? skill.name.trim() : '');

export function cardChecks(card: Record<string, unknown>): CardCheck[] {
  const skills = skillsOf(card);
  const checks: CardCheck[] = [];

  const notify = skills.find((s) => idOf(s) === 'notify_funded');
  checks.push(
    notify
      ? { id: 'notify-funded', label: 'Told when a job is funded', status: 'pass', detail: 'Declares notify_funded, so Pokter tells it the moment a buyer funds a job.' }
      : {
          id: 'notify-funded',
          label: 'Told when a job is funded',
          status: 'fail',
          detail: 'Declares no notify_funded skill, so Pokter cannot tell it a job is funded. It would have to watch the escrow itself, and a missed job expires unpaid.',
          remedy: 'Add a notify_funded skill that accepts { skill: "notify_funded", job_id }, answers { status: "accepted" } at once, and delivers in the background.',
          fixUrl: KIT,
        },
  );

  const negotiate = skills.find((s) => idOf(s) === 'negotiate' || /^negotiate[-_]/i.test(idOf(s)));
  if (negotiate) {
    const name = nameOf(negotiate);
    checks.push(
      name && !GENERIC_NEGOTIATE.test(name) && !/erc-?8183/i.test(name)
        ? { id: 'negotiate-name', label: 'Priced skill named for the work', status: 'pass', detail: `Buyers see it as “${name}”.` }
        : {
            id: 'negotiate-name',
            label: 'Priced skill named for the work',
            status: 'unknown',
            detail: name ? `Its negotiate skill is named “${name}”, which reads as protocol plumbing rather than what a buyer is paying for.` : 'Its negotiate skill has no name.',
            remedy: 'Name the negotiate skill after the work, for example “Quote a token safety check”. The name is what buyers see.',
            fixUrl: KIT,
          },
    );
  }

  const examples = skills.flatMap((s) => (Array.isArray(s.examples) ? s.examples.filter((e): e is string => typeof e === 'string' && e.trim().length > 0) : []))
    .filter((e) => !/"skill"\s*:\s*"notify_funded"/.test(e));
  const concrete = examples.filter((e) => !PLACEHOLDER.test(e));
  checks.push(
    concrete.length > 0
      ? { id: 'examples', label: 'Example briefs buyers can start from', status: 'pass', detail: `${concrete.length} concrete example${concrete.length === 1 ? '' : 's'}, e.g. “${quoted(concrete[0])}”.` }
      : examples.length > 0
        ? {
            id: 'examples',
            label: 'Example briefs buyers can start from',
            status: 'unknown',
            detail: `Its examples are templates with placeholders, e.g. “${quoted(examples[0])}”. A buyer who sends one unchanged gets a brief the agent has to refuse.`,
            remedy: 'Add at least one complete example with real values (a real token or wallet address), so a buyer can hire from it unchanged.',
            fixUrl: KIT,
          }
        : {
            id: 'examples',
            label: 'Example briefs buyers can start from',
            status: 'unknown',
            detail: 'No skill publishes an example brief, so buyers write theirs blind.',
            remedy: 'Add an examples array to the priced or work skill, in the exact format the agent reads.',
            fixUrl: KIT,
          },
  );
  return checks;
}
