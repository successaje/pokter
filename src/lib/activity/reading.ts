/**
 * What an agent's wallet has done on chain, as a reader can take it.
 *
 * `sent` is the account nonce: transactions the wallet itself sent. A
 * smart-contract wallet acts through other accounts, so its nonce says
 * little; that is named rather than reported as "never transacted".
 */
export interface WalletActivity {
  chainId: number;
  address: string;
  sent: number;
  contract: boolean;
  checkedAt: string;
}

export function activityReading(activity: WalletActivity | null, agentWallet: string | null | undefined, chainLabel: string): { text: string; active: boolean | null } {
  if (!agentWallet) return { text: 'No agent wallet registered', active: null };
  if (!activity) return { text: 'Not read yet', active: null };
  if (activity.contract) return { text: `A contract wallet on ${chainLabel}: its own sends do not show its activity`, active: null };
  if (activity.sent === 0) return { text: `Has sent no transactions on ${chainLabel}`, active: false };
  return { text: `Has sent ${activity.sent.toLocaleString('en-US')} transaction${activity.sent === 1 ? '' : 's'} on ${chainLabel}`, active: true };
}

/** The row in Compare: BNB Chain first, and BNB Testnet beside it for an agent registered there. */
export function activityRow(
  activity: { mainnet: WalletActivity | null; testnet: WalletActivity | null },
  agentWallet: string | null | undefined,
  registryChainId: number,
): string {
  const mainnet = activityReading(activity.mainnet, agentWallet, 'BNB Chain').text;
  if (registryChainId !== 97 || !agentWallet) return mainnet;
  return `${mainnet}. ${activityReading(activity.testnet, agentWallet, 'BNB Testnet').text}`;
}
