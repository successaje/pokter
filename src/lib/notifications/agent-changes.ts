import { formatQuotedPrice, tokenLabel } from '@/lib/erc8183/pricing';

/**
 * What changed about a followed agent between two sweeps, worth an email.
 *
 * Only facts Pokter measured: whether it answered its probes in the last
 * day, its signed price, and paid jobs delivered or missed through Pokter
 * escrow. The first observation sets a baseline and sends nothing, so a
 * new follower is not told "news" that is only the agent's current state.
 */
export interface FollowedAgentState {
  /** Answered at least one probe in the last 24 hours (null when not probed). */
  answering: boolean | null;
  /** Current signed price, as a number in `currency` (not necessarily $U), or null when it has none. */
  priceU: number | null;
  /**
   * The token that price is signed in. Optional: states stored before
   * prices carried a token have none, and are compared on the number
   * alone rather than assumed to have been $U.
   */
  currency?: string | null;
  delivered: number;
  missed: number;
}

export interface AgentChange {
  kind: 'down' | 'up' | 'price' | 'priced' | 'unpriced' | 'missed' | 'delivered';
  title: string;
  body: string;
}

/* In the price's own token; a state with no token says it is unknown. */
function money(amount: number, currency: string | null | undefined): string {
  return formatQuotedPrice(amount, currency ?? null);
}

export function agentChanges(name: string, prev: FollowedAgentState | null, next: FollowedAgentState): AgentChange[] {
  if (!prev) return [];
  const changes: AgentChange[] = [];
  if (prev.answering === true && next.answering === false) {
    changes.push({ kind: 'down', title: `${name} stopped answering`, body: 'It did not answer any of Pokter’s probes in the last 24 hours. A job funded now may not be delivered.' });
  }
  if (prev.answering === false && next.answering === true) {
    changes.push({ kind: 'up', title: `${name} is answering again`, body: 'It answered Pokter’s probes again in the last 24 hours.' });
  }
  /*
   * Compared on (currency, amount). The same figure in another token is
   * another price, and is said as a change of currency. Only when both
   * states name one: a state stored before prices carried a token is not
   * evidence the token changed.
   */
  const tokenMoved =
    prev.priceU !== null && next.priceU !== null && Boolean(prev.currency && next.currency) && prev.currency!.toLowerCase() !== next.currency!.toLowerCase();
  if (tokenMoved) {
    changes.push({ kind: 'price', title: `${name} changed its price`, body: `The currency changed from ${tokenLabel(prev.currency)} to ${tokenLabel(next.currency)}: its signed price moved from ${money(prev.priceU!, prev.currency)} to ${money(next.priceU!, next.currency)}.` });
  } else if (prev.priceU !== null && next.priceU !== null && Math.abs(prev.priceU - next.priceU) > 1e-9) {
    changes.push({ kind: 'price', title: `${name} changed its price`, body: `Its signed price moved from ${money(prev.priceU, prev.currency)} to ${money(next.priceU, next.currency)}.` });
  }
  if (prev.priceU === null && next.priceU !== null) {
    changes.push({ kind: 'priced', title: `${name} now signs a price`, body: `It quotes ${money(next.priceU, next.currency)}, signed by its own wallet.` });
  }
  if (prev.priceU !== null && next.priceU === null) {
    changes.push({ kind: 'unpriced', title: `${name} no longer signs a price`, body: 'Its signed quote has lapsed. You can still set a budget when hiring.' });
  }
  if (next.missed > prev.missed) {
    const n = next.missed - prev.missed;
    changes.push({ kind: 'missed', title: `${name} missed ${n === 1 ? 'a paid job' : `${n} paid jobs`}`, body: 'A funded job passed its deadline with nothing delivered. Its delivery record on Pokter now shows it.' });
  }
  if (next.delivered > prev.delivered) {
    const n = next.delivered - prev.delivered;
    changes.push({ kind: 'delivered', title: `${name} delivered ${n === 1 ? 'a paid job' : `${n} paid jobs`}`, body: 'A funded job through Pokter escrow was delivered.' });
  }
  return changes;
}
