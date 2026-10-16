'use client';

import { useQuery } from '@tanstack/react-query';
import { formatEther, formatUnits } from 'viem';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';

import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { useActiveWallet } from '@/lib/wallet/active';
import { ESCROW_CHAIN, walletConnectConfigured } from '@/lib/wallet/config';
import { externalBalances, hasInjectedWallet } from '@/lib/wallet/external';
import { WALLET_NETWORK, walletClient } from '@/lib/wallet/passkey';
import { balanceScope, selectableChains, switchAllowed } from '@/lib/wallet/balance-scope';
import { usePasskeyWallet } from '@/lib/wallet/PasskeyProvider';
import { useHydrated } from '@/lib/ui/use-hydrated';

export interface WalletBalances {
  /** The payment token ($U), as a decimal number. */
  payment: number | null;
  /** Native gas (tBNB / BNB). */
  native: number | null;
  loading: boolean;
  /**
   * The chain these figures were read on, or null when none may be shown.
   *
   * A balance read on a different chain from the one the wallet is on is
   * worse than no balance, because a buyer decides what they can afford by
   * looking at it. Null means show the switch, not a number.
   */
  chainId: number | null;
  /** Why no figure is available, when there is none. */
  unreadable: 'no-wallet' | 'off-escrow-chain' | null;
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

  /*
   * The scope decides whether a figure may be shown at all. Passing
   * `undefined` to `externalBalances` fell back to the configured chain, so
   * a wallet on another network was shown a balance from BNB Chain under a
   * label saying it was the wallet's.
   */
  const scope = balanceScope({ connectedChainId: chain?.id ?? null, connected: isConnected });

  const externalBalance = useQuery({
    // Read on the chain the wallet is on, when hires can be funded there, so a
    // wallet on mainnet shows its mainnet balance rather than its testnet one.
    queryKey: ['wallet-balances', 'external', externalAddress, scope.readable ? scope.chainId : 'unreadable'],
    queryFn: async () => {
      if (!scope.readable) return null;
      const result = await externalBalances(scope.chainId);
      if (!result) return null;
      return { native: Number(formatEther(result.native)), payment: Number(formatUnits(result.payment, 18)) };
    },
    enabled: active.mode === 'external' && scope.readable,
    refetchInterval: 30_000,
  });

  const source = active.mode === 'passkey' ? passkeyBalances : active.mode === 'external' ? externalBalance : null;
  /*
   * A passkey account is a smart account on one network by construction, so
   * its balances are scoped by the wallet rather than by what an injected
   * wallet happens to be pointing at.
   */
  const balanceChainId = active.mode === 'passkey' ? WALLET_NETWORK.chainId : scope.readable ? scope.chainId : null;
  const balances: WalletBalances = {
    payment: source?.data?.payment ?? null,
    native: source?.data?.native ?? null,
    loading: Boolean(source?.isLoading),
    /** Null when no figure may be shown: the caller offers the switch instead. */
    chainId: balanceChainId,
    unreadable: active.mode === 'external' && !scope.readable ? scope.reason : null,
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
    /** The networks a hire can settle on, offered as a choice. */
    escrowChains: selectableChains(),
    /*
     * An explicit choice, refused for a chain no hire could settle on. The
     * wallet still has to accept it: a selection here is a request, and
     * `switching`/`switchError` report what the wallet actually did.
     */
    switchToChain: (chainId: number) => {
      if (!switchAllowed(chainId)) return;
      switchChain({ chainId: chainId as 56 | 97 });
    },
    disconnectExternal: () => disconnect(),
  };
}

export type WalletState = ReturnType<typeof useWalletState>;
