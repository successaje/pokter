import { enabledEscrowChains, isEscrowChain, type EscrowChainId } from '@/lib/network/escrow';

/**
 * Which chain a wallet's balances may be read on, and whether they may be
 * read at all.
 *
 * `externalBalances` defaults its chain to the configured network, and the
 * wallet state passed `undefined` whenever the connected chain was not an
 * escrow chain. So a wallet sitting on Ethereum was shown a balance read on
 * BNB Chain, under a label saying it was the wallet's. The number was real
 * and belonged to the same address — on a chain the wallet was not on.
 *
 * A balance from the wrong chain is worse than no balance: a buyer decides
 * whether they can afford a hire by looking at it. So an unreadable scope is
 * reported as unknown rather than filled in from a default, and the caller
 * shows the switch instead of a figure.
 *
 * Pure so the rule can be tested without a wallet.
 */

export type BalanceScope =
  | { readable: true; chainId: EscrowChainId }
  | { readable: false; reason: 'no-wallet' | 'off-escrow-chain' };

export function balanceScope(
  input: { connectedChainId: number | null | undefined; connected: boolean },
  enabled: EscrowChainId[] = enabledEscrowChains(),
): BalanceScope {
  if (!input.connected || input.connectedChainId === null || input.connectedChainId === undefined) {
    return { readable: false, reason: 'no-wallet' };
  }
  if (!isEscrowChain(input.connectedChainId, enabled)) {
    return { readable: false, reason: 'off-escrow-chain' };
  }
  return { readable: true, chainId: input.connectedChainId };
}

/**
 * The networks a buyer may be offered, as a choice.
 *
 * Connecting and switching both pinned the single `ESCROW_CHAIN` derived from
 * `NEXT_PUBLIC_ALTANA_NETWORK`, so there was no way to choose testnet to
 * practise on while mainnet escrow was also enabled. The set comes from the
 * same configuration the hire path settles against, so a chain can never be
 * offered here that a hire could not then be funded on.
 */
export function selectableChains(enabled: EscrowChainId[] = enabledEscrowChains()): EscrowChainId[] {
  return [...enabled].sort((a, b) => a - b);
}

/** Whether a requested switch is to a chain hires can actually settle on. */
export function switchAllowed(chainId: number, enabled: EscrowChainId[] = enabledEscrowChains()): boolean {
  return isEscrowChain(chainId, enabled);
}
