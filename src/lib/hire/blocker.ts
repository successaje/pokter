import type { QuoteFailureCode } from './failure';

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
      if (input.detail === 'card-without-interface') {
        return { code: input.code, reason: 'Nothing Pokter read at its registered endpoint or the card path under it names an A2A interface, so there is nowhere to send a brief.', fix: at('transports', 'Transports'), transient: false };
      }
      return mcpOnly
        ? { code: input.code, reason: 'It publishes only an MCP endpoint. Paid jobs are priced over A2A (a negotiate skill on an agent card), so it can be measured but not hired.', fix: at('transports', 'Transports'), transient: false }
        : { code: input.code, reason: 'Its agent card offers no HTTPS JSON-RPC interface, which is the one Pokter calls to price and hire it.', fix: at('transports', 'Transports'), transient: false };
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
