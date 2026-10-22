import 'server-only';

import { getProbeStore } from '@/lib/history/store';
import { readCardForPage } from '@/lib/agents/agent-card';
import { blockerCodeForCardProblem, type CardProblem } from '@/lib/agents/card-read';
import { hireBlocker, type HireBlocker } from './blocker';

/**
 * Which evidence produced a blocker, named by the branch that produced it.
 *
 * Returned rather than worked out afterwards: a caller that reports
 * provenance — `/api/v1/agents/:chain/:token` does, in a field whose whole
 * purpose is to say where a claim came from — cannot recover this from the
 * blocker, because the same code arrives from more than one source.
 */
export type BlockerSource = 'sweep' | 'card';

/**
 * The agent's current hire blocker: none when it has a signed price an
 * escrow can pay; the payment problem when its price cannot be paid;
 * otherwise why the latest sweep's price request failed, if it did.
 */
export function currentHireBlocker(
  agent: { chain_id: number; token_id: string; agent_wallet?: string | null; services?: Record<string, unknown> | null },
  quote: { quotedAt: string } | null,
  payable: boolean | null,
  /**
   * What the page's own read of the card found (`readCardForPage`), for an
   * agent the sweep has no evidence about. Used only when there is none:
   * a stored failure is the measured one and wins.
   */
  card?: { problem: CardProblem | null; readAt: string } | null,
): (HireBlocker & { observedAt: string | null; from: BlockerSource }) | null {
  const dated = (blocker: HireBlocker | null, observedAt: string | null, from: BlockerSource) =>
    blocker ? { ...blocker, observedAt, from } : null;

  if (quote && payable !== false) return null;
  if (quote && payable === false) return dated(hireBlocker({ code: 'payment-incompatible' }), quote.quotedAt, 'sweep');

  const failed = getProbeStore().quoteFailureFor(agent.chain_id, agent.token_id);
  if (!failed) {
    if (!card?.problem) return null;
    /* Which code each read implies, including the one that must stay transient. */
    const { code, detail } = blockerCodeForCardProblem(card.problem);
    return dated(hireBlocker({ code, detail, agentWallet: agent.agent_wallet, protocols: Object.keys(agent.services ?? {}) }), card.readAt, 'card');
  }
  return dated(
    hireBlocker({ code: failed.code, detail: failed.detail, sellerReason: failed.sellerReason, agentWallet: agent.agent_wallet, protocols: Object.keys(agent.services ?? {}) }),
    failed.observedAt,
    'sweep',
  );
}

/**
 * The same blocker, reading the agent's card only when nothing on record
 * answers.
 *
 * `/api/v1/agents/:chain/:token` is where an assistant reads this — MCP
 * `get_agent` forwards to it, and so does the agent-to-agent path — and it
 * reported no blocker at all for an agent the sweep has never reached,
 * which is the whole case this exists for. hwayongjin.agent (56:300282)
 * said nothing there while its own page said why.
 *
 * The card read is made only when the store has nothing to say, because
 * then it is the only evidence there is. A stored failure, or a quote an
 * escrow can pay, answers without calling anybody: this is a public
 * endpoint and most agents on it already have a measured verdict. Bounded
 * the way the page's read is bounded, and a read that throws is simply no
 * card evidence rather than a failed request.
 */
export async function currentHireBlockerWithCard(
  agent: { chain_id: number; token_id: string; agent_wallet?: string | null; services?: Record<string, unknown> | null },
  quote: { quotedAt: string } | null,
  payable: boolean | null,
  /** The agent's registered A2A endpoint, from its registry record. */
  endpoint: string | null | undefined,
): Promise<(HireBlocker & { observedAt: string | null; from: BlockerSource }) | null> {
  /*
   * A quote an escrow can pay settles it, so no card is read.
   *
   * Checked before the read and not after it, because the blocker alone
   * cannot say which happened: `currentHireBlocker` answers null both for
   * "nothing on record" and for "on record, and nothing is wrong", and only
   * the first is a reason to call the agent. Without this the agents that
   * can be hired — the ones an assistant looks up precisely because it is
   * about to hire them — each cost an outbound request on this public
   * endpoint, whose result is then discarded, since the same quote makes
   * the second decision null too.
   */
  if (quote && payable !== false) return null;
  /*
   * `from` comes back with the blocker rather than being assigned here. A
   * wrapper labelling everything that is not the card read as the sweep
   * would be guessing, and would be wrong as soon as the decision grows a
   * third source.
   */
  const onRecord = currentHireBlocker(agent, quote, payable);
  if (onRecord) return onRecord;
  const readAt = new Date().toISOString();
  const card = await readCardForPage(endpoint, agent.token_id).catch(() => null);
  return currentHireBlocker(agent, quote, payable, card ? { problem: card.problem, readAt } : null);
}
