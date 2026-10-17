import { getAddress } from 'viem';

/**
 * Which escrow a hire is funded on.
 *
 * Pokter ran one escrow, chosen for the whole site by `ALTANA_NETWORK`, and it
 * was testnet. Most agents that sign a price sign it in mainnet $U, which the
 * testnet escrow cannot pay, so those agents could be read about here and not
 * hired. The escrow is now chosen per hire: an agent whose signed price is in
 * a token one of the enabled escrows settles in is hired on that escrow, and
 * everything else stays on testnet as before.
 *
 * Isomorphic and free of SDK imports, so the server, the browser and the tests
 * apply the same rule. The payment tokens are pinned here rather than read
 * from the SDK for the same reason; they are the `paymentToken` values in
 * `erc8183Addresses` as of SDK 0.9, and `correctedErc8183Addresses` remains
 * the source for every other escrow address.
 */

export type EscrowChainId = 56 | 97;

/** The token each ERC-8183 deployment settles in. */
export const ESCROW_PAYMENT_TOKEN: Record<EscrowChainId, `0x${string}`> = {
  56: '0xcE24439F2D9C6a2289F741120FE202248B666666',
  97: '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565',
};

/**
 * The escrows hires may be funded on, from `NEXT_PUBLIC_ESCROW_CHAINS`.
 *
 * Unset means testnet only, which is what the site did before this existed.
 * Mainnet is opened by listing it ("97,56"), and nothing else does so: real
 * money moves only when somebody has set this on purpose. Public, because the
 * browser decides which network to ask the wallet for.
 */
export function enabledEscrowChains(raw: string | undefined = process.env.NEXT_PUBLIC_ESCROW_CHAINS): EscrowChainId[] {
  const listed = (raw ?? '97')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((id): id is EscrowChainId => id === 56 || id === 97);
  const unique = [...new Set(listed)];
  return unique.length > 0 ? unique : [97];
}

export function isEscrowChain(chainId: number, enabled: EscrowChainId[] = enabledEscrowChains()): chainId is EscrowChainId {
  return (enabled as number[]).includes(chainId);
}

function sameAddress(a: string, b: string): boolean {
  try {
    return getAddress(a) === getAddress(b);
  } catch {
    return false;
  }
}

/** The enabled escrow that settles in this token, or null when none does. */
export function escrowChainForCurrency(currency: string, enabled: EscrowChainId[] = enabledEscrowChains()): EscrowChainId | null {
  return enabled.find((chainId) => sameAddress(currency, ESCROW_PAYMENT_TOKEN[chainId])) ?? null;
}

/**
 * The escrow to hire an agent on.
 *
 * A signed price decides it: the price is only payable on the escrow that
 * settles in its token, so that is the escrow, or none when no enabled escrow
 * does. An agent with no signed price is hired on testnet, where the buyer
 * sets the budget and Pokter's delivery agent can carry the task; that path
 * never runs on mainnet (see `demo-guard`).
 */
export function escrowChainForHire(
  quoteCurrency: string | null | undefined,
  enabled: EscrowChainId[] = enabledEscrowChains(),
): EscrowChainId | null {
  if (quoteCurrency) return escrowChainForCurrency(quoteCurrency, enabled);
  return enabled.includes(97) ? 97 : null;
}

/**
 * The escrow a **paid** hire of this agent would settle on, or null.
 *
 * Distinct from `escrowChainForHire`, which answers "where could a buyer
 * hire this at all" and falls back to testnet because the free trial is
 * always available there. That fallback is right for offering an option
 * and wrong for labelling an agent: fed to a card it printed
 * "Test tokens · BNB Testnet" about 58 of 77 mainnet-registered agents,
 * none of which had priced in testnet currency — they simply had no price
 * Pokter could read. A missing or unverifiable price does not establish
 * that an agent is testnet-only.
 *
 * So this answers only the question a buyer is actually asking of a price:
 * which money pays it. Null when there is no verified, payable quote, and
 * null is meant to hide the hiring network — never the registered one,
 * which is a separate fact and stays on the card.
 */
export function paidHireChain(input: {
  /** The quote's currency, when Pokter recorded and verified one. */
  quoteCurrency: string | null | undefined;
  /** Whether an enabled escrow can actually pay that currency. */
  payable: boolean | null | undefined;
}, enabled: EscrowChainId[] = enabledEscrowChains()): EscrowChainId | null {
  if (!input.quoteCurrency || input.payable !== true) return null;
  return escrowChainForCurrency(input.quoteCurrency, enabled);
}

/**
 * Every escrow a buyer may hire this agent on, the preferred one first.
 *
 * The escrow that can pay the signed price comes first. Testnet is always
 * offered as well while it is enabled: there Pokter's delivery agent carries
 * the task to the agent and returns its answer, which costs the buyer nothing
 * and is how most agents with a mainnet price could be tried before mainnet
 * hires opened. Taking it away would leave free hiring only for agents that
 * never signed a price.
 */
export function escrowOptionsForHire(
  quoteCurrency: string | null | undefined,
  enabled: EscrowChainId[] = enabledEscrowChains(),
): EscrowChainId[] {
  const preferred = escrowChainForHire(quoteCurrency, enabled);
  const options: EscrowChainId[] = preferred === null ? [] : [preferred];
  if (enabled.includes(97) && !options.includes(97)) options.push(97);
  return options;
}

/**
 * Which escrow Pokter would fund this agent's job on, told to the agent.
 *
 * Nothing used to say, so an agent that can price per chain had to guess,
 * and one of Pokter's own quoted in the mainnet token for a testnet
 * listing — honestly signed and impossible to fund. The agent's own
 * registry chain is the preferred answer when Pokter settles there,
 * because an agent registered on mainnet almost certainly means to be
 * paid in mainnet currency; otherwise the first enabled escrow.
 *
 * A hint, not a demand. It travels alongside the brief rather than inside
 * `terms`, so it does not enter the hash the seller signs: an agent that
 * ignores it behaves exactly as before, and one that honours it returns a
 * price Pokter can actually fund. `escrow_chains` is included because a
 * buyer able to settle on either should not force a seller onto one.
 */
export function settlementHint(
  agent: { chain_id: number },
  enabled: EscrowChainId[] = enabledEscrowChains(),
) {
  const preferred = isEscrowChain(agent.chain_id, enabled) ? agent.chain_id : enabled[0];
  return { chain_id: preferred, escrow_chains: enabled };
}
