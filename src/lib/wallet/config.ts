import { createConfig, http } from 'wagmi';
import { bsc, bscTestnet } from 'wagmi/chains';
import { injected } from 'wagmi/connectors/injected';
import { walletConnect } from 'wagmi/connectors/walletConnect';

/**
 * Wallet configuration.
 *
 * Injected for desktop extensions — MetaMask, Rabby, anything exposing
 * EIP-1193 on `window` — and WalletConnect for everything else.
 *
 * This was injected-only, on the reasoning that WalletConnect needed a
 * project id and a relay "for a flow that never leaves the user's own
 * browser". That held while a passkey was the answer on a phone. It stopped
 * holding the moment the browser wallet became the default way in and the
 * campaign guidance started telling people to use one: a phone has no
 * injected provider, so the recommended path offered nothing, and the only
 * remaining option was the passkey the campaign guidance warns against.
 * Mobile had no working route at all.
 *
 * The project id is read from the environment and the connector is omitted
 * when it is missing, so a deployment without one degrades to what this file
 * did before rather than failing to build. `PROJECT_ID` is public by design
 * — it identifies the relay app, it is not a secret.
 *
 * Both chains are configured because the marketplace indexes mainnet agents
 * while the escrow with funds runs on testnet, and the UI has to be able to
 * name which chain a user is actually on.
 */
/**
 * Pulled out so the rule is testable without reloading this module, which
 * builds a live wagmi config at import and cannot be re-evaluated per case.
 * A blank or whitespace value is absent: an empty string reaching the relay
 * is a runtime error at connect time rather than a missing feature at build
 * time, which is the worse of the two.
 */
export function walletConnectProjectId(
  raw: string | undefined = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
): string | null {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

const WALLETCONNECT_PROJECT_ID = walletConnectProjectId();

export const walletConnectConfigured = WALLETCONNECT_PROJECT_ID !== null;

export const wagmiConfig = createConfig({
  chains: [bscTestnet, bsc],
  connectors: [
    injected(),
    // Browser only: its storage layer needs indexedDB, which the server lacks.
    ...(WALLETCONNECT_PROJECT_ID && typeof window !== 'undefined'
      ? [
          walletConnect({
            projectId: WALLETCONNECT_PROJECT_ID,
            showQrModal: true,
            metadata: {
              name: 'Pokter',
              description: 'Find, compare and hire AI agents on BNB Chain.',
              url: process.env.NEXT_PUBLIC_APP_URL ?? 'https://pokter.xyz',
              icons: [`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://pokter.xyz'}/brand/pokter-app-icon-192.png`],
            },
          }),
        ]
      : []),
  ],
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
