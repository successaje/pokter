/**
 * What `prepare_hire` asks the agent for: its price for exactly this brief,
 * in the money the owner authorised.
 *
 * The owner's token travels as the preference every other hire path sends
 * (the hire page, and the Agent ID route's fresh price before funding).
 * Without it the agent signs in its default, $U, and a hire the owner
 * authorised in USDT was refused as "signed a price in $U", though the
 * agent signs in USDT when asked: on 26 November a hire of Touchstone from
 * an assistant could not be prepared in USDT at all.
 *
 * A preference asks; it does not decide. The agent may still sign in
 * another currency, and `prepare_hire` refuses that as before. With no
 * token the owner authorised $U, every agent's default, so nothing is asked.
 */
export function prepareQuoteRequest(input: { chainId: number; tokenId: string; task: string; category: string; escrowChainId: number; ownerToken: string | null }) {
  return {
    chainId: input.chainId,
    tokenId: input.tokenId,
    task: input.task,
    category: input.category,
    ...(input.ownerToken ? { escrowChainId: input.escrowChainId, preferredToken: input.ownerToken } : {}),
  };
}
