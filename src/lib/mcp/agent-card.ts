import { formatAmount } from '@/lib/network/tokens';

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
  /** The evidence step reached, e.g. "Delivered", and which steps are earned. */
  step: string | null;
  steps: Array<{ label: string; earned: boolean }>;
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
  ladder?: { label?: string; steps?: Array<{ label?: string; earned?: boolean }> } | null;
  price?: { amountU?: number; current?: boolean; payable?: boolean | null } | null;
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
  const escrow = detail.hire?.escrowChainId ?? null;
  const price = detail.price && typeof detail.price.amountU === 'number' ? detail.price : null;
  return {
    name: detail.name || `Agent #${tokenId}`,
    chainId,
    tokenId,
    step: detail.ladder?.label ?? null,
    steps: (detail.ladder?.steps ?? []).map((s) => ({ label: String(s.label ?? ''), earned: Boolean(s.earned) })),
    /*
     * A quote fetched for this card is the price that holds now. The record's
     * stored price is older and has usually expired, so a card beside a
     * fresh quote used to call its own price "not current".
     */
    price: quote
      ? { label: formatAmount(chainId, quote.currency, quote.priceRaw)?.label ?? `${quote.priceRaw} (unverified token)`, signed: true, current: true }
      : price ? { label: `${price.amountU} $U`, signed: true, current: Boolean(price.current) } : null,
    network: (() => {
      const network = networkOf(escrow);
      return network ? { label: network.label, money: network.money, real: network.real } : null;
    })(),
    blocker: detail.hireBlocker?.reason ? { reason: detail.hireBlocker.reason, fix: detail.hireBlocker.fix ?? `${origin}/build/integration` } : null,
    quote: quote ? { price: formatAmount(chainId, quote.currency, quote.priceRaw)?.label ?? `${quote.priceRaw} (unverified token)`, signer: short(quote.signer), termsBound: quote.termsBound } : null,
    brief,
    hireUrl: hire.href,
    pageUrl: detail.links?.html ?? `${origin}/agents/${chainId}/${tokenId}`,
  };
}
