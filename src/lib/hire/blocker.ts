import { blockerCodeForCardProblem, type CardProblem } from '@/lib/agents/card-read';
import type { QuoteFailureCode } from './failure';
import { NO_ENDPOINT_DETAIL } from './no-endpoint';

/**
 * Why an agent cannot be hired through Pokter right now, in words its
 * owner can act on, with the part of the integration kit that explains
 * the fix.
 *
 * The sweep asks every agent for a price and used to discard the reason
 * when it got none, so an agent's page said only "no signed price" and
 * its owner had to guess. Of 55 agents checked on 15 October that answered
 * probes but could not be priced, 20 had no negotiate skill and 4 signed
 * with a wallet other than their own; few published a way to be told.
 * Saying it on the agent's own page reaches the owner who looks.
 */

export interface HireBlockerInput {
  code: QuoteFailureCode | string;
  detail?: string | null;
  sellerReason?: string | null;
  /** The agent's registered wallet, for the wrong-signer case. */
  agentWallet?: string | null;
  /** Protocols the registry record names, for the MCP-only case. */
  protocols?: readonly string[];
}

export interface HireBlocker {
  code: string;
  /** One sentence, about the agent, saying what fails. */
  reason: string;
  /** The integration kit section that explains the fix. */
  fix: { label: string; href: string };
  /** Whether it may be a passing condition rather than something to change. */
  transient: boolean;
}

const KIT = '/build/integration';
const short = (address?: string | null) => (address && address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address ?? 'its registered wallet');

export function hireBlocker(input: HireBlockerInput): HireBlocker | null {
  const at = (anchor: string, label: string) => ({ label, href: `${KIT}#${anchor}` });
  switch (input.code) {
    case 'no-price-skill':
      return { code: input.code, reason: 'Its agent card declares no negotiate skill, so it cannot sign a price and cannot be hired through escrow.', fix: at('skills', 'Skills a card declares'), transient: false };
    case 'no-quote':
      return { code: input.code, reason: 'It answers negotiate, but not with a signed quote: Pokter needs negotiation_hash, provider_sig and a price and currency in response.terms.', fix: at('quote', 'The signed quote'), transient: false };
    case 'bad-signature':
      return { code: input.code, reason: `Its quote is not signed by its registered agent wallet (${short(input.agentWallet)}), so Pokter will not fund against it.`, fix: at('quote', 'The signed quote'), transient: false };
    case 'terms-mismatch':
      return { code: input.code, reason: 'Its signed hash does not cover the terms it returned, so the price cannot be shown as signed.', fix: at('quote', 'The signed quote'), transient: false };
    /*
     * The card itself did not answer, so nothing here is a finding about the
     * agent. Kept apart from `no-endpoint` because the two make different
     * claims and only one of them is permanent: a transient card lookup used
     * to arrive as "names no service to send a brief to", which told a
     * builder to reconnect an agent that was already connected and told the
     * buyer, at 409, not to try again.
     */
    case 'card-unreadable':
      return { code: input.code, reason: `Its agent card did not answer this read${input.detail ? ` (${input.detail})` : ''}, so whether it can be priced is unchecked rather than ruled out. Pokter asks again on the next view.`, fix: at('transports', 'Transports'), transient: true };
    case 'no-endpoint': {
      const mcpOnly = input.protocols?.includes('mcp') && !input.protocols.includes('a2a');
      /*
       * Nothing Pokter read named an interface (56:300282, whose platform
       * reports UNBOUND, offline, endpoint null).
       *
       * Worded for what was read and nothing else, because four reads
       * arrive under this detail and no stronger sentence is true of all
       * four. "Its card answers but names no service" is false where every
       * location answered with no card at all. "Neither location returns a
       * card naming an interface" is false where one of them timed out
       * after the other had already settled it — a negative about a place
       * that never answered. And "the operator has listed it without
       * connecting a running agent" is false of an agent serving its card
       * somewhere other than the well-known path.
       *
       * So: what Pokter read, and what it did not find in it.
       */
      const said = (reason: string) => ({ code: input.code, reason, fix: at('transports', 'Transports'), transient: false });
      if (input.detail === NO_ENDPOINT_DETAIL.cardWithoutInterface) {
        return said('Nothing Pokter read at its registered endpoint or the card path under it names an A2A interface, so there is nowhere to send a brief.');
      }
      if (input.detail === NO_ENDPOINT_DETAIL.registryNoWallet) {
        return said('No agent wallet found in the registry data Pokter reads for it, so a price it signed could not be checked against one, and Pokter does not ask it for a price.');
      }
      /*
       * The registry data is all that was read here: the indexer's copy of
       * the registration, which can lag the registration itself. So the
       * sentence is about that data, and says no card was read, rather than
       * that the agent has no endpoint (56:382582's live registration named
       * one its indexed copy did not).
       */
      if (mcpOnly) {
        return said('The registry data Pokter reads lists only an MCP endpoint for it. Paid jobs are priced over A2A (a negotiate skill on an agent card), so it can be measured but not hired.');
      }
      if (input.detail === NO_ENDPOINT_DETAIL.registryNoA2a) {
        return said('No A2A endpoint found in the registry data Pokter reads for it, so there is nothing to call to price and hire it. No agent card was read: one published elsewhere is not seen until the registry data names it.');
      }
      if (input.detail === NO_ENDPOINT_DETAIL.cardWithoutJsonRpc) {
        return said('Its agent card offers no HTTPS JSON-RPC interface, which is the one Pokter calls to price and hire it.');
      }
      /* Recorded before the read was named: what was found, not what the agent lacks. */
      return said('Pokter found no A2A interface it could call for it, so it cannot price or hire it here.');
    }
    case 'auth-required':
      return { code: input.code, reason: `Its endpoint refuses anonymous calls${input.detail ? ` (${input.detail})` : ''}, so a buyer’s job cannot reach it.`, fix: at('identity', 'Identity'), transient: false };
    case 'seller-declined':
      return {
        code: input.code,
        reason: `It declines Pokter’s generic price request${input.sellerReason ? `: “${input.sellerReason.slice(0, 160)}”` : '.'} A buyer’s brief in the format it asks for may still be quoted, but no price shows until it answers a generic one.`,
        fix: at('skills', 'Skills a card declares'),
        transient: false,
      };
    case 'seller-not-ready':
      return { code: input.code, reason: 'It accepted the price request but did not return a price in time.', fix: at('transports', 'Transports'), transient: true };
    case 'quote-expired':
      return { code: input.code, reason: 'It signed a quote that had already expired when it arrived.', fix: at('quote', 'The signed quote'), transient: true };
    case 'payment-incompatible':
      return { code: input.code, reason: 'It quotes in a token no enabled escrow settles in, so its price cannot be funded.', fix: at('escrows', 'Escrows'), transient: false };
    case 'http-error':
      return { code: input.code, reason: `Its endpoint answered the price request with an error${input.detail ? ` (${input.detail})` : ''}.`, fix: at('skills', 'Skills a card declares'), transient: true };
    case 'timeout':
      return { code: input.code, reason: 'Its endpoint did not answer the price request in time.', fix: at('transports', 'Transports'), transient: true };
    case 'unreachable':
      return { code: input.code, reason: `Its endpoint could not be reached for a price${input.detail && /agent card/.test(input.detail) ? ': it answers, but not with an agent card' : ''}.`, fix: at('transports', 'Transports'), transient: true };
    case 'rate-limited':
      return { code: input.code, reason: 'Its endpoint was limiting requests when Pokter asked for a price.', fix: at('transports', 'Transports'), transient: true };
    default:
      return null;
  }
}

/**
 * Which evidence produced a blocker, named by the branch that produced it.
 *
 * Returned rather than worked out afterwards. A caller that reports
 * provenance — `/api/v1/agents/:chain/:token` does, in a field whose whole
 * purpose is to say where a claim came from — cannot recover this from the
 * blocker, because the same code arrives from more than one source:
 * `payment-incompatible` is the sweep's stored quote or a buyer's own, and
 * `no-endpoint` is the sweep's price request or this request's card read.
 *
 * `'brief'` is a quote Pokter got for a buyer's or an assistant's own
 * brief, through `/api/hire/quote` or `/api/trial`. It is dated to when
 * they asked, and it is not a measurement Pokter scheduled.
 */
export type BlockerSource = 'sweep' | 'brief' | 'card' | 'registry';

/** How long a buyer's signed quote outweighs the sweep's failed generic one. */
export const BRIEF_QUOTE_HOLDS_MS = 7 * 24 * 3_600_000;

/** A clock a minute ahead of Pokter's is a clock, not a quote from the future. */
const CLOCK_SKEW_MS = 60_000;

/** What one signed, verified quote for a buyer's own brief recorded. */
export interface BriefQuote {
  quotedAt: string;
  /** Whether an enabled escrow settles the currency it signed (`escrowChainForCurrency`). */
  payable: boolean;
}

/** Whether a recorded brief quote is recent enough to still speak for the agent. */
export function briefQuoteStillSpeaks(brief: BriefQuote | null | undefined, now: number): brief is BriefQuote {
  if (!brief) return false;
  const at = Date.parse(brief.quotedAt);
  return Number.isFinite(at) && at <= now + CLOCK_SKEW_MS && now - at <= BRIEF_QUOTE_HOLDS_MS;
}

/**
 * The one stored failure a buyer's signed quote can disprove.
 *
 * The sweep asks every agent the same generic price question, and some
 * answer it without a price because it names no wallet or token. Vitals
 * (56:367904) did, so its page said it "answers negotiate, but not with a
 * signed quote" while it was signing quotes for real briefs. That claim,
 * and only that claim, is what a signed quote for a real brief contradicts.
 *
 * Nothing else is in here, and the omissions are the point. A security,
 * structural, authentication or payment failure is about whether a job can
 * reach the agent or be paid for at all, and a price signed last Tuesday
 * says nothing about a wrong signer, a gated endpoint, a card with no
 * negotiate skill or a token no escrow settles — an override by recency
 * alone erased exactly those. `seller-declined` stays too: declining
 * Pokter's generic ask remains true of the generic ask, which is what its
 * wording already says. The transient network codes stay because they are
 * already marked transient and carry no verdict to erase.
 */
const STALE_PRICING_FAILURES: ReadonlySet<string> = new Set(['no-quote']);

/**
 * Whether a buyer's signed quote overrides this stored "cannot be priced".
 *
 * Scoped by category and by time, both: the failure has to be the stale
 * pricing one, the quote has to be payable, and the timestamps have to show
 * the quote came after the failure. An undated failure is never outranked —
 * nothing proves which came first — and an unpayable quote proves only that
 * the agent signs, not that it can be hired (see `payment-incompatible`).
 */
export function briefQuoteOutranksFailure(
  failure: { code: string; observedAt?: string | null },
  brief: BriefQuote,
  now: number,
): boolean {
  if (!brief.payable) return false;
  if (!STALE_PRICING_FAILURES.has(failure.code)) return false;
  if (!briefQuoteStillSpeaks(brief, now)) return false;
  const failedAt = failure.observedAt ? Date.parse(failure.observedAt) : Number.NaN;
  return Number.isFinite(failedAt) && Date.parse(brief.quotedAt) > failedAt;
}

/**
 * The blocker to show for one agent, from everything Pokter holds about it.
 *
 * Pure, and the whole order of precedence lives here, because precedence is
 * where both mistakes were: a newer failure set aside by an older signed
 * quote, and a card Pokter could not read reported as a card that names no
 * interface. `currentHireBlocker` only reads the store and hands the facts
 * over, so the order can be exercised without one.
 *
 * Newest evidence wins, and only over what it actually speaks to:
 *   1. a verified quote an escrow can pay — nothing is blocking a hire;
 *   2. that quote in money no escrow settles — the payment problem;
 *   3. the sweep's own failed price request, unless a newer signed quote for
 *      a buyer's brief disproves that exact failure;
 *   4. a signed brief quote in money no escrow settles — it prices, and the
 *      hire still cannot be funded;
 *   5. what this page's own card read found, which is the only evidence for
 *      an agent the sweep has never reached.
 */
export function decideHireBlocker(input: {
  agentWallet?: string | null;
  protocols?: readonly string[];
  /** The stored quote from the sweep, and whether an escrow can pay it. */
  quote: { quotedAt: string } | null;
  payable: boolean | null;
  /** Why the sweep's latest generic price request failed, if it did. */
  failed: { code: string; detail?: string | null; sellerReason?: string | null; observedAt: string } | null;
  /** The last signed quote a buyer's own brief got (`noteBriefQuote`). */
  brief: BriefQuote | null;
  /** What the page's own card read found (`readCardForPage`). */
  card: { problem: CardProblem | null; readAt: string } | null;
  now: number;
}): (HireBlocker & { observedAt: string | null; from: BlockerSource }) | null {
  const { agentWallet, protocols, quote, payable, failed, card, now } = input;
  const dated = (blocker: HireBlocker | null, observedAt: string | null, from: BlockerSource) =>
    blocker ? { ...blocker, observedAt, from } : null;

  if (quote && payable !== false) return null;
  if (quote && payable === false) return dated(hireBlocker({ code: 'payment-incompatible' }), quote.quotedAt, 'sweep');

  const brief = briefQuoteStillSpeaks(input.brief, now) ? input.brief : null;

  if (failed && !(brief && briefQuoteOutranksFailure(failed, brief, now))) {
    const blocker = dated(
      hireBlocker({ code: failed.code, detail: failed.detail, sellerReason: failed.sellerReason, agentWallet, protocols }),
      failed.observedAt,
      'sweep',
    );
    if (blocker) return blocker;
  }

  /*
   * It signed for a brief, in money no enabled escrow settles. The signature
   * is honest and the hire still cannot be funded, so the quote never stands
   * in for one that can be: the proof that it prices used to hide the fact
   * that it cannot be paid.
   *
   * `'brief'`, not `'sweep'`. This quote came from a buyer's or an
   * assistant's own request and is dated to it, and a caller that reported
   * it as the sweep's price request was asserting a measurement that never
   * happened — in the field whose purpose is to say where a claim came from.
   */
  if (brief && !brief.payable) return dated(hireBlocker({ code: 'payment-incompatible' }), brief.quotedAt, 'brief');

  if (!card?.problem) return null;
  /* Which code each read implies, including the one that must stay transient. */
  const { code, detail } = blockerCodeForCardProblem(card.problem);
  /* No endpoint in the registry data means no card was read: its source is that data, not a card read. */
  return dated(hireBlocker({ code, detail, agentWallet, protocols }), card.readAt, card.problem === 'no-endpoint' ? 'registry' : 'card');
}
