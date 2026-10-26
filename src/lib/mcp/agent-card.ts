import { formatQuoted } from '@/lib/network/tokens';
import { formatQuotedPrice, formatQuotedRaw } from '@/lib/erc8183/pricing';
import { escrowChainForCurrency } from '@/lib/network/escrow';

/**
 * The agent card an MCP host shows inline (MCP Apps, `ui://`), and the
 * data it draws.
 *
 * Built from the public API's agent record, so the card says what the
 * agent page says: its evidence step, its signed price and where that
 * settles, and anything blocking a hire with its fix. Hosts that do not
 * render apps get the same tools' text, so the card only ever adds.
 */

export const AGENT_CARD_URI = 'ui://pokter/agent-card';
export const MCP_APP_MIME = 'text/html;profile=mcp-app';

export interface AgentCardData {
  name: string;
  chainId: number;
  tokenId: string;
  /** The evidence step reached, e.g. "Delivered", and how far each step got. */
  step: string | null;
  steps: Array<{ label: string; earned: boolean; partial?: boolean }>;
  price: { label: string; signed: boolean; current: boolean } | null;
  network: { label: string; money: string; real: boolean } | null;
  blocker: { reason: string; fix: string } | null;
  /** A quote just signed for this brief, when the card follows get_quote. */
  quote: { price: string; signer: string; termsBound: boolean } | null;
  brief: string | null;
  hireUrl: string;
  pageUrl: string;
}

type Detail = {
  name?: string;
  chainId?: number;
  tokenId?: string;
  ladder?: { label?: string; steps?: Array<{ label?: string; earned?: boolean; state?: string }> } | null;
  /*
   * The record's price, in its own token. `amountU` is null for any token
   * that is not $U (`wirePrice`), so a card keyed on it alone would show a
   * USDT agent as unpriced; `priceRaw` and `currency` name the money.
   */
  price?: { amountU?: number | null; priceRaw?: string; currency?: string | null; current?: boolean; payable?: boolean | null } | null;
  hire?: { escrowChainId?: number | null } | null;
  hireBlocker?: { reason?: string; fix?: string } | null;
  links?: { html?: string } | null;
};

/** The network a hire is funded on, in the words the card and the tools use. */
export function networkOf(escrowChainId: number | null | undefined): { chainId: number; label: string; money: string; real: boolean } | null {
  if (escrowChainId === 56) return { chainId: 56, label: 'BNB Chain · Mainnet', money: 'Real funds', real: true };
  if (escrowChainId === 97) return { chainId: 97, label: 'BNB Chain · Testnet', money: 'Test tokens', real: false };
  return null;
}

const short = (address: string) => (address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address);

export function buildAgentCard(
  detail: Detail,
  { origin, brief = null, quote = null }: { origin: string; brief?: string | null; quote?: { priceRaw: string; currency?: string | null; signer: string; termsBound: boolean } | null },
): AgentCardData {
  const chainId = Number(detail.chainId);
  const tokenId = String(detail.tokenId ?? '');
  const hire = new URL(`/hire/${chainId}/${tokenId}`, origin);
  if (brief) hire.searchParams.set('task', brief.slice(0, 2000));
  /*
   * Beside a fresh quote, the escrow that can actually settle its currency:
   * the stored record can still name the testnet fallback for an agent that
   * had no price (Vitals, 56:367904, shown "Testnet" beside a mainnet quote).
   *
   * `escrowChainForCurrency`, not `settlementChainOf`. The second answers
   * which chain's token this address is and knows nothing about
   * `enabledEscrowChains()`, so with mainnet escrow off — the unset default,
   * and local development — it labelled a mainnet-$U quote "BNB Chain ·
   * Mainnet · Real funds" while `/api/hire/quote` refused that same quote
   * 409 `payment-incompatible`. Production only hid it because `fly.toml`
   * carries '97,56'. A currency no enabled escrow settles falls back to the
   * record rather than naming money this deployment cannot move.
   */
  const settles = quote?.currency ? escrowChainForCurrency(quote.currency) : null;
  const escrow = settles ?? detail.hire?.escrowChainId ?? null;
  const price = detail.price && (typeof detail.price.priceRaw === 'string' || typeof detail.price.amountU === 'number') ? detail.price : null;
  /* The currency is required to name the money: an older record with only `amountU` was, by that field's contract, $U — but is printed as unknown rather than assumed. */
  const storedLabel = price
    ? typeof price.priceRaw === 'string'
      ? /^0+$/.test(price.priceRaw) ? 'Free' : formatQuotedRaw(price.currency ?? null, price.priceRaw)
      : formatQuotedPrice(price.amountU as number, price.currency ?? null)
    : null;
  return {
    name: detail.name || `Agent #${tokenId}`,
    chainId,
    tokenId,
    step: detail.ladder?.label ?? null,
    /* A partial step is drawn as neither earned nor absent; see `agent-card-html`. */
    steps: (detail.ladder?.steps ?? []).map((s) => ({
      label: String(s.label ?? ''),
      earned: Boolean(s.earned),
      ...(s.state === 'partial' ? { partial: true } : {}),
    })),
    /*
     * A quote fetched for this card is the price that holds now. The record's
     * stored price is older and has usually expired, so a card beside a
     * fresh quote used to call its own price "not current".
     */
    price: quote
      /* Read on the chain the currency settles on, never the one the agent is registered on (`settlementChainOf`). */
      ? { label: formatQuoted(quote.currency, quote.priceRaw)?.label ?? `${quote.priceRaw} (unverified token)`, signed: true, current: true }
      : price && storedLabel ? { label: storedLabel, signed: true, current: Boolean(price.current) } : null,
    network: (() => {
      const network = networkOf(escrow);
      return network ? { label: network.label, money: network.money, real: network.real } : null;
    })(),
    /*
     * The record's own blocker, whatever quote sits beside it.
     *
     * A fresh signed quote does prove the agent can be priced, and that is
     * already settled where it belongs: `get_quote` reads this record after
     * the quote is recorded, and `currentHireBlocker` drops the one failure
     * a signed brief quote disproves. Dropping it here instead dropped all
     * of them — a gated endpoint, a wrong signer, a token no escrow settles
     * — and the worst of those is the quote's own: an agent that signs in
     * unpayable money looked hireable precisely because it had signed.
     */
    blocker: detail.hireBlocker?.reason ? { reason: detail.hireBlocker.reason, fix: detail.hireBlocker.fix ?? `${origin}/build/integration` } : null,
    quote: quote ? { price: formatQuoted(quote.currency, quote.priceRaw)?.label ?? `${quote.priceRaw} (unverified token)`, signer: short(quote.signer), termsBound: quote.termsBound } : null,
    brief,
    hireUrl: hire.href,
    pageUrl: detail.links?.html ?? `${origin}/agents/${chainId}/${tokenId}`,
  };
}
