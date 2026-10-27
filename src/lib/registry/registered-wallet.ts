/**
 * Which wallet an agent's escrow jobs pay, from the registry's answer and
 * the indexer's copy.
 *
 * The registry answers first: the wallet it names, or none when it names
 * none (ERC-8004 clears the agent wallet when an identity is transferred,
 * and 56:376435's copy still named the wallet the registry had cleared).
 * The copy is used only when the chain did not answer, because refusing
 * every hire while a public node is slow would be worse than the copy every
 * route used before. Pure, so the rule is tested without a chain.
 */
export function chooseRegisteredWallet(read: { answered: boolean; wallet: string | null }, indexed: string | null | undefined): string | null {
  return read.answered ? read.wallet : (indexed ?? null);
}
