import { fallback, http } from 'viem';

/**
 * A transport that can confirm a transaction we just sent.
 *
 * publicnode's BNB Chain endpoint answers eth_getTransactionReceipt with
 * "Archive requests require a personal token", even for a transaction a
 * few seconds old, so every mainnet registration and delivery that waited
 * for its receipt there would fail after sending. Brinkwatch's mainnet
 * registration did exactly that. BNB Chain's own endpoint serves receipts;
 * publicnode stays as the fallback, and testnet is unchanged.
 */
const URLS: Record<number, string[]> = {
  56: ['https://bsc-dataseed.bnbchain.org', 'https://bsc-dataseed1.defibit.io', 'https://bsc-rpc.publicnode.com'],
  97: ['https://bsc-testnet-rpc.publicnode.com', 'https://data-seed-prebsc-1-s1.bnbchain.org:8545'],
};

export function sendingTransport(chainId: number) {
  return fallback((URLS[chainId] ?? []).map((url) => http(url)));
}
