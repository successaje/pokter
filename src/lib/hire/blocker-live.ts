import 'server-only';

import { getProbeStore } from '@/lib/history/store';
import { blockerCodeForCardProblem, type CardProblem } from '@/lib/agents/card-read';
import { hireBlocker, type HireBlocker } from './blocker';

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
): (HireBlocker & { observedAt: string | null }) | null {
  if (quote && payable !== false) return null;
  if (quote && payable === false) {
    const blocker = hireBlocker({ code: 'payment-incompatible' });
    return blocker ? { ...blocker, observedAt: quote.quotedAt } : null;
  }
  const failed = getProbeStore().quoteFailureFor(agent.chain_id, agent.token_id);
  if (!failed) {
    if (!card?.problem) return null;
    /* Which code each read implies, including the one that must stay transient. */
    const { code, detail } = blockerCodeForCardProblem(card.problem);
    const blocker = hireBlocker({ code, detail, agentWallet: agent.agent_wallet, protocols: Object.keys(agent.services ?? {}) });
    return blocker ? { ...blocker, observedAt: card.readAt } : null;
  }
  const blocker = hireBlocker({ code: failed.code, detail: failed.detail, sellerReason: failed.sellerReason, agentWallet: agent.agent_wallet, protocols: Object.keys(agent.services ?? {}) });
  return blocker ? { ...blocker, observedAt: failed.observedAt } : null;
}
