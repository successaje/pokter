import { createConfig, http } from 'wagmi';
import { bsc, bscTestnet } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

/**
 * Wallet configuration.
 *
 * Injected connectors only — MetaMask, Rabby, and anything else exposing
 * EIP-1193. No WalletConnect, which would need a project id and a relay for a
 * flow that never leaves the user's own browser.
 *
 * Both chains are configured because the marketplace indexes mainnet agents
 * while the escrow with funds runs on testnet, and the UI has to be able to
 * name which chain a user is actually on.
 */
export const wagmiConfig = createConfig({
  chains: [bscTestnet, bsc],
  connectors: [injected()],
  transports: {
    [bscTestnet.id]: http('https://bsc-testnet-rpc.publicnode.com'),
    [bsc.id]: http('https://bsc-rpc.publicnode.com'),
  },
  ssr: true,
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}

export const ESCROW_CHAIN = bscTestnet;
