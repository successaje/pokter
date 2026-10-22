import { hireBlocker, type HireBlocker } from '@/lib/hire/blocker';
import type { InputRefusalCode } from './attempt';

/**
 * What a builder should change, for the failures that happen after a price
 * is agreed.
 *
 * `hireBlocker` already answers this for every way a price request can
 * fail, and that is the taxonomy diagnostics use for the quote stage —
 * unchanged, read rather than copied, so a code can never mean one thing
 * on an agent's public page and another on its builder's dashboard.
 *
 * It stops where the quote stops, though, and a builder asking why buyers
 * are not successfully hiring them needs the two stages after it: a price
 * that was signed and never funded, and a funded job that was never
 * delivered. Those are the same shape — one sentence about the agent, the
 * kit section that explains the fix — and they are added here rather than
 * in `blocker.ts`, which decides what an agent's listing says and has no
 * business growing cases only a builder's own dashboard reads.
 */

const KIT = '/build/integration';

export type DeliveryStopCode = 'lapsed' | 'refused-funded-job' | 'disputed';

export type DiagnosticStage = 'quote' | 'funding' | 'delivery';

/** Same shape as a hire blocker, so one renderer draws all three stages. */
export type Remediation = HireBlocker;

/**
 * Refusals Pokter issues before the agent is ever called.
 *
 * Every one of these is a buyer who wrote something, pressed the button,
 * and was turned away at 400 — and every one is the builder's to fix, even
 * though the brief is the buyer's: what a brief has to contain is decided
 * by the skills and examples the card declares. The panel used to print
 * "every buyer who asked got a signed price" while this was happening,
 * which is why they are recorded rather than noted as unmeasured.
 */
const INPUT: Record<InputRefusalCode, Omit<Remediation, 'code'>> = {
  'brief-too-short': {
    reason:
      'A buyer wrote a brief shorter than Pokter accepts and was turned away before your agent saw it. The floor steps aside for any brief your card publishes as an example, so publishing the briefs you actually take removes it — and tells buyers what to write instead of making them guess.',
    fix: { label: 'Skills a card declares', href: `${KIT}#skills` },
    transient: false,
  },
  'invalid-task': {
    reason:
      'A buyer sent a structured brief that did not match the examples your card declares, so Pokter refused it before your agent saw it. Either the examples are missing fields your agent needs, or they ask for fields it does not — both read to a buyer as the agent being broken.',
    fix: { label: 'Skills a card declares', href: `${KIT}#skills` },
    transient: false,
  },
  'subject-missing': {
    reason:
      'Pokter could not find, in the buyer’s brief, the subject your declared skill needs — the pool, the position, the address it acts on. The brief reached no agent. Declaring the input by name, with an example that contains it, is what lets Pokter ask the buyer for the one missing thing instead of refusing them.',
    fix: { label: 'Skills a card declares', href: `${KIT}#skills` },
    transient: false,
  },
  'subject-ambiguous': {
    reason:
      'The buyer’s brief named more than one thing your declared skill could act on, and Pokter will not guess which. An example brief showing one subject per request tells buyers to send one.',
    fix: { label: 'Skills a card declares', href: `${KIT}#skills` },
    transient: false,
  },
  'brief-declined': {
    reason:
      'Pokter could not turn the buyer’s brief into a request for any skill your card declares, so nothing was sent. This is a card that does not describe what the agent sells in terms a brief can be matched against.',
    fix: { label: 'Skills a card declares', href: `${KIT}#skills` },
    transient: false,
  },
};

const AFTER_QUOTE: Record<DeliveryStopCode, Omit<Remediation, 'code'>> = {
  lapsed: {
    reason:
      'A funded job passed its delivery deadline with nothing submitted, so the buyer reclaimed the escrow. A job it cannot deliver still has to be seen: Pokter tells the agent over notify_funded the moment the money lands.',
    fix: { label: 'Job lifecycle', href: `${KIT}#lifecycle` },
    transient: false,
  },
  'refused-funded-job': {
    reason:
      'It was told a funded job was waiting and refused it. A refusal is an answer and is not counted as a miss, but a buyer who paid and was turned away does not come back.',
    fix: { label: 'Reading a funded job', href: `${KIT}#reading-a-job` },
    transient: false,
  },
  disputed: {
    reason:
      'A delivery was submitted and the escrow settled against it, so the buyer was refunded. The deliverable has to verify against the hash submitted on chain and answer the brief it was funded for.',
    fix: { label: 'Delivery', href: `${KIT}#delivery` },
    transient: false,
  },
};

/** The fix for a delivery that failed. */
export function afterQuoteRemediation(code: DeliveryStopCode): Remediation {
  return { code, ...AFTER_QUOTE[code] };
}

/**
 * The fix for one quote-stage failure code, through `hireBlocker`.
 *
 * Returns null for a code `hireBlocker` does not know, which is the honest
 * answer: a builder is better told "Pokter has no specific fix for this
 * code" than handed a generic sentence that sends them to the wrong
 * section of the kit.
 *
 * `buyerBrief` re-words one case. `hireBlocker` speaks for an agent's
 * public listing, where a decline is always of Pokter's **generic** price
 * request — "A buyer's brief in the format it asks for may still be
 * quoted". On this panel the decline is of a buyer's actual brief, so that
 * sentence is not merely imprecise, it is the opposite of what happened,
 * and it would tell a builder to wait for a customer who has already been
 * and gone. The kit link is `hireBlocker`'s either way.
 */
export function quoteRemediation(input: {
  code: string;
  detail?: string | null;
  sellerReason?: string | null;
  agentWallet?: string | null;
  protocols?: readonly string[];
  /** True when the decline was of a buyer's own brief, not the scheduled check. */
  buyerBrief?: boolean;
}): Remediation | null {
  const blocker = hireBlocker(input);
  if (!blocker) {
    /*
     * Not a seller refusal: one Pokter issued itself, before the agent was
     * called. `hireBlocker` has no case for these and never should — it
     * speaks for a public listing — but a builder reading "Pokter has no
     * specific fix recorded" about the thing turning their buyers away at
     * 400 is the worst answer available.
     */
    const own = INPUT[input.code as InputRefusalCode];
    return own ? { code: input.code, ...own } : null;
  }
  if (!input.buyerBrief || input.code !== 'seller-declined') return blocker;
  return { ...blocker, reason: declinedBuyerBrief(input.sellerReason) };
}

/**
 * What a decline of a real buyer's brief means, with and without words.
 *
 * The silent case is the one worth separating. A decline with a reason is
 * a conversation: the buyer reads it and edits the brief. A decline with
 * nothing attached ends the hire with no one able to say what was wrong,
 * and until 22 October it did not even end it — `askIfAgentTakesBrief`
 * required words before it would treat a refusal as one, so 56/269228
 * answered `seller-declined` with nothing readable and the brief went
 * through the check it had just failed. It is a refusal now, which makes
 * the missing reason the only thing standing between that buyer and a
 * brief they could have fixed.
 */
function declinedBuyerBrief(sellerReason: string | null | undefined): string {
  return sellerReason
    ? 'It refused a brief a buyer sent through the hire page, and gave a reason. The buyer sees those words and can edit the brief; if the same reason keeps coming back, say what the brief must contain in the examples your card publishes, so buyers arrive with it already right.'
    : 'It refused a brief a buyer sent through the hire page and gave no reason, so the buyer was told only that it had been refused and had nothing to change. Return a reason with a negotiate refusal: it is the difference between a buyer editing their brief and a buyer leaving.';
}
