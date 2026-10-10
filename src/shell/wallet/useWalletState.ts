'use client';

import { useQuery } from '@tanstack/react-query';
import { formatEther, formatUnits } from 'viem';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';

import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { useActiveWallet } from '@/lib/wallet/active';
import { ESCROW_CHAIN, walletConnectConfigured } from '@/lib/wallet/config';
import { externalBalances, hasInjectedWallet } from '@/lib/wallet/external';
import { WALLET_NETWORK, walletClient } from '@/lib/wallet/passkey';
import { usePasskeyWallet } from '@/lib/wallet/PasskeyProvider';
import { useHydrated } from '@/lib/ui/use-hydrated';

export interface WalletBalances {
  /** The payment token ($U), as a decimal number. */
  payment: number | null;
  /** Native gas (tBNB / BNB). */
  native: number | null;
  loading: boolean;
}

/**
 * Everything the shell needs to know about the person's wallets, in one
 * place: which one signs, its address, its balances, and the connect
 * actions for each kind. Pages never talk to wagmi or the passkey context
 * directly for display; they call this.
 */
export function useWalletState() {
  const hydrated = useHydrated();
  const passkey = usePasskeyWallet();
  const active = useActiveWallet();
  const { address: externalAddress, isConnected, chain, connector } = useAccount();
  const { connect, connectors, isPending: connecting, error: connectError, reset: resetConnect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching, error: switchError } = useSwitchChain();

  const injectedAvailable = hydrated && Boolean(hasInjectedWallet());
  const injected = injectedAvailable ? (connectors.find((c) => c.id === 'injected') ?? null) : null;
  const walletConnect = connectors.find((c) => c.id === 'walletConnect') ?? null;

  const paymentToken = correctedErc8183Addresses(WALLET_NETWORK.chainId).paymentToken;

  const passkeyBalances = useQuery({
    queryKey: ['wallet-balances', 'passkey', passkey.wallet?.address, paymentToken],
    queryFn: async () => {
      const result = await walletClient().balances({ wallet: passkey.wallet!.address, tokens: [paymentToken] });
      const token = result.tokens?.[0];
      return {
        native: Number(formatEther(result.native)),
        payment: token && token.ok ? Number(formatUnits(token.raw, token.decimals)) : null,
      };
    },
    enabled: active.mode === 'passkey' && Boolean(passkey.wallet),
    refetchInterval: 30_000,
  });

  const externalBalance = useQuery({
    queryKey: ['wallet-balances', 'external', externalAddress],
    queryFn: async () => {
      const result = await externalBalances();
      if (!result) return null;
      return { native: Number(formatEther(result.native)), payment: Number(formatUnits(result.payment, 18)) };
    },
    enabled: active.mode === 'external',
    refetchInterval: 30_000,
  });

  const source = active.mode === 'passkey' ? passkeyBalances : active.mode === 'external' ? externalBalance : null;
  const balances: WalletBalances = {
    payment: source?.data?.payment ?? null,
    native: source?.data?.native ?? null,
    loading: Boolean(source?.isLoading),
  };

  return {
    hydrated,
    ready: hydrated && passkey.ready,
    mode: active.mode,
    address: active.address,
    /** A browser wallet is connected on another network. */
    wrongChain: active.wrongChain,
    externalConnected: isConnected,
    externalAddress: externalAddress ?? null,
    externalChainName: chain?.name ?? null,
    connectorName: connector?.name ?? null,
    escrowChain: ESCROW_CHAIN,
    balances,
    refreshBalances: () => void source?.refetch(),
    passkey,
    injectedAvailable,
    walletConnectAvailable: hydrated && walletConnectConfigured && Boolean(walletConnect),
    connecting,
    connectError: connectError?.message ?? null,
    resetConnect,
    connectInjected: () => injected && connect({ connector: injected, chainId: ESCROW_CHAIN.id }),
    connectWalletConnect: () => walletConnect && connect({ connector: walletConnect, chainId: ESCROW_CHAIN.id }),
    switching,
    switchError: switchError?.message ?? null,
    switchToEscrowChain: () => switchChain({ chainId: ESCROW_CHAIN.id }),
    disconnectExternal: () => disconnect(),
  };
}

export type WalletState = ReturnType<typeof useWalletState>;
