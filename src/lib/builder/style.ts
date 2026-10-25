import { CONCEPTS } from '@/lib/builder/concepts';
import type { BuildStyle, DraftFields } from '@/lib/builder/drafts';

/**
 * Two ways to be helped, and the difference is who decides.
 *
 * The flow had one manner: a four-step form that asked for everything,
 * in order, whether or not the answer was already on the screen. That
 * suits somebody who wants to specify their agent and nobody who wants
 * one built. So there are two styles, and the default is the one that
 * decides things.
 *
 * Both run over the same draft and the same steps, which is the point:
 * switching is a change of manner, not a change of state, so nothing
 * typed and no progress is lost in either direction. Both produce the
 * same registration file, run the same endpoint check, and hold the same
 * line on wallets and keys — a quieter build is not a laxer one.
 */
export const BUILD_STYLES: ReadonlyArray<{
  id: BuildStyle;
  label: string;
  /** One line, for the switch. */
  summary: string;
  /** What it will and will not do, for the panel under the switch. */
  behaviour: string[];
}> = [
  {
    id: 'recommend',
    label: 'Recommend and build',
    summary: 'Pokter proposes and decides; you confirm the things that matter.',
    behaviour: [
      'Uses everything you have already given and never asks for it twice.',
      /* Counted from the list the picker renders, so the description cannot
         outlive the list. It said five while the prompt said three. */
      `With no idea yet, puts forward ${CONCEPTS.length} concepts, recommends one, and says why.`,
      'Takes the routine decisions itself — protocol, skill names, file names — and shows what it chose.',
      'Asks only what genuinely blocks the build, grouped into one message.',
      'Changes nothing until you choose. Saying nothing is not agreement.',
    ],
  },
  {
    id: 'with-me',
    label: 'Build with me',
    summary: 'The plan up front, and a real choice at each stage.',
    behaviour: [
      'Explains what each stage is for before it asks anything.',
      'Offers the choices Recommend-and-build would take for you.',
      'Keeps the technical detail one click away rather than in the way.',
      'Same checks, same registration file, same rules about keys.',
    ],
  },
];

/**
 * Recommend-and-build in the fewest words that still bind, for the briefs
 * that have no room for the long form.
 *
 * Three surfaces hand an assistant a brief: the guided step, the
 * standalone prompt builder, and the Pokter MCP section — which the page
 * marks "Recommended" and which therefore reaches more builders than the
 * other two together. That one ended with "Ask me what the agent should
 * do before writing anything", so the most prominent route was the one
 * instructing the questionnaire this flow is trying to remove.
 *
 * The long prompt says this at length because it has the space. This is
 * the same commitment compressed, kept here rather than written out twice
 * so the short form cannot drift from the default it names.
 */
export const RECOMMEND_AND_BUILD_BRIEF = [
  'Do not interview me before you start. If I have said what I want, build that. If I have not, propose a few concepts, recommend one, and say why.',
  'Start when I pick one, or when I say "choose for me". Those are the only two starts. A reply that is neither — a question, a remark, a half-answer — is not approval: answer it and ask again.',
  'Once I have chosen, build it. Do not come back for the routine decisions; they are yours.',
  'Do not wait on a name. Pick a working one, say it is provisional, and carry on.',
  'Decide the routine engineering yourself — language, layout, tests, libraries — and tell me in one line what you chose. Ask me only for a wallet signature, for money I have not already agreed to spend, or for a security trade-off. Never ask me for a private key or a recovery phrase.',
].join('\n');

export function buildStyle(id: BuildStyle) {
  return BUILD_STYLES.find((style) => style.id === id) ?? BUILD_STYLES[0];
}

export type SuppliedField = 'name' | 'description' | 'category' | 'endpoint' | 'image' | 'repository';

/**
 * What the builder has already given, so nothing asks for it again.
 *
 * The reason this is a function and not an inline check at each field:
 * "never ask again for anything already present" has to hold across a
 * concept picker, a five-question blueprint and a form that can all be on
 * screen in the same session. One answer about what is present keeps them
 * agreeing with each other.
 */
export function suppliedFields(draft: DraftFields): SuppliedField[] {
  const supplied: SuppliedField[] = [];
  if (draft.name.trim()) supplied.push('name');
  if (draft.description.trim()) supplied.push('description');
  if (draft.category.trim()) supplied.push('category');
  if (draft.endpoint.trim()) supplied.push('endpoint');
  if (draft.image.trim()) supplied.push('image');
  if (draft.repository.trim()) supplied.push('repository');
  return supplied;
}

/** Whether there is enough of an idea to stop proposing ones. */
export function hasIdea(draft: DraftFields): boolean {
  return Boolean(draft.name.trim() || draft.description.trim() || draft.category.trim());
}

export interface RoutineDecision {
  id: string;
  /** What was decided. */
  decision: string;
  /** Why, in a sentence a non-specialist can argue with. */
  because: string;
}

/**
 * The decisions Recommend-and-build takes rather than asks about.
 *
 * Shown, not hidden: a decision made on somebody's behalf and not told to
 * them is indistinguishable from a decision they will later be blamed
 * for. Each is reversible on the step that owns it.
 */
export function routineDecisions(draft: DraftFields): RoutineDecision[] {
  const decisions: RoutineDecision[] = [
    {
      id: 'protocol',
      decision: draft.protocol === 'mcp' ? 'An MCP server' : 'An A2A agent',
      because:
        draft.protocol === 'mcp'
          ? 'A tool an assistant calls. Pokter can measure it, and a price is negotiated over A2A, so an MCP-only agent cannot be priced or hired here.'
          : 'A price is negotiated over A2A, so this is the shape a buyer can actually hire. Assistants can still reach it through Pokter’s own MCP server.',
    },
    {
      id: 'card-path',
      decision: 'The agent card at /.well-known/agent-card.json',
      because: 'Where Pokter’s prober and every buyer’s hire looks first. A card somewhere else is a card nobody finds.',
    },
    {
      id: 'skills',
      decision: 'Skills named negotiate, notify_funded and one named for the work',
      because: 'Pokter calls the first for a price and the second when a job is funded. The third is what the brief is addressed to, so it is named for the outcome rather than the implementation.',
    },
    {
      id: 'image',
      decision: 'A generated image, unless you set one',
      because: 'A listing with no image reads as abandoned, and this is the one field where a placeholder is better than a blank.',
    },
  ];
  return decisions;
}

export interface BlockingQuestion {
  id: 'endpoint' | 'network' | 'category';
  question: string;
  /** Why it cannot be decided for them. */
  because: string;
  /** Which step answers it. */
  step: number;
}

/**
 * The questions that genuinely block, grouped so they arrive once.
 *
 * Everything that can be decided is decided. What is left is the address
 * of a machine Pokter cannot guess at, a choice about real money, and —
 * only when a concept was never taken — what the agent is actually for.
 * Three at most, asked together, rather than a four-step interrogation.
 */
export function blockingQuestions(draft: DraftFields): BlockingQuestion[] {
  const questions: BlockingQuestion[] = [];
  if (!draft.category.trim()) {
    questions.push({
      id: 'category',
      question: 'Which outcome is this agent for?',
      because: 'Pokter shows a category’s own words on your agent’s page, so guessing it would put a claim about your agent in front of buyers.',
      step: 0,
    });
  }
  if (!draft.endpoint.trim()) {
    questions.push({
      id: 'endpoint',
      question: 'What is the https address your agent answers on?',
      because: 'Pokter calls it from its own servers the way a hire does. There is nothing to check until it has an address.',
      step: 1,
    });
  }
  questions.push({
    id: 'network',
    question: 'Register on BNB testnet or BNB Chain?',
    because: 'Mainnet costs real BNB and the identity is permanent. That is not a decision to take on your behalf.',
    step: 3,
  });
  return questions;
}
