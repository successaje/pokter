import { hireBlocker, type HireBlocker } from '@/lib/hire/blocker';

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

export type FundingStopCode = 'priced-not-funded';

export type DeliveryStopCode = 'lapsed' | 'refused-funded-job' | 'disputed';

export type DiagnosticStage = 'quote' | 'funding' | 'delivery';

/** Same shape as a hire blocker, so one renderer draws all three stages. */
export type Remediation = HireBlocker;

const AFTER_QUOTE: Record<FundingStopCode | DeliveryStopCode, Omit<Remediation, 'code'>> = {
  'priced-not-funded': {
    reason:
      'Buyers got a signed price from it and did not fund the job. A price a buyer has to re-read is usually one that expired while they were deciding, or one far from what the brief looked like it was worth.',
    fix: { label: 'The signed quote', href: `${KIT}#quote` },
    transient: false,
  },
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

/** The fix for a stage-two or stage-three failure. */
export function afterQuoteRemediation(code: FundingStopCode | DeliveryStopCode): Remediation {
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
  if (!blocker || !input.buyerBrief || input.code !== 'seller-declined') return blocker;
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
