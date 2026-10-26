'use client';

import { useQuery } from '@tanstack/react-query';
import { formatEther, formatUnits, type Address } from 'viem';
import { useAccount, useConnect, useDisconnect } from 'wagmi';

import { displaySymbol, offeredTokens } from '@/lib/network/tokens';
import { useActiveWallet } from '@/lib/wallet/active';
import { ESCROW_CHAIN, walletConnectConfigured } from '@/lib/wallet/config';
import { externalBalances, hasInjectedWallet } from '@/lib/wallet/external';
import { WALLET_NETWORK, walletClient } from '@/lib/wallet/passkey';
import { balanceScope, selectableChains, switchAllowed } from '@/lib/wallet/balance-scope';
import { usePasskeyWallet } from '@/lib/wallet/PasskeyProvider';
import { useHydrated } from '@/lib/ui/use-hydrated';
import { useLiveSwitchChain } from '@/lib/wallet/use-live-switch-chain';

/**
 * One offered payment token's balance. The decimals are the registry's, read
 * from the contract once and recorded — never a literal 18, which is wrong
 * for a six-decimal token by a factor of 10^12.
 */
export interface TokenBalance {
  address: Address;
  /** As the product writes it: "$U", "USDT". */
  symbol: string;
  decimals: number;
  /** Whether this is the escrow default ($U) on the chain. */
  isDefault: boolean;
  raw: bigint | null;
  /** As a decimal number, for display only. */
  amount: number | null;
}

export interface WalletBalances {
  /** The escrow default ($U), as a decimal number. Kept for callers that only show $U. */
  payment: number | null;
  /**
   * Every token Pokter offers for a hire on `chainId`, $U first. With only
   * $U offered this is one entry; a USDT balance appears when USDT hiring is
   * on, so a buyer paying in USDT sees what they can spend.
   */
  tokens: TokenBalance[];
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
  const { switchChain, isPending: switching, error: switchError } = useLiveSwitchChain();

  const injectedAvailable = hydrated && Boolean(hasInjectedWallet());
  const injected = injectedAvailable ? (connectors.find((c) => c.id === 'injected') ?? null) : null;
  const walletConnect = connectors.find((c) => c.id === 'walletConnect') ?? null;

  const passkeyTokens = offeredTokens(WALLET_NETWORK.chainId);

  const passkeyBalances = useQuery({
    queryKey: ['wallet-balances', 'passkey', passkey.wallet?.address, passkeyTokens.map((t) => t.address).join(',')],
    queryFn: async () => {
      const result = await walletClient().balances({ wallet: passkey.wallet!.address, tokens: passkeyTokens.map((t) => t.address) });
      /* One entry per requested token, in order. Scaled by the registry's decimals, not the one the contract call returned. */
      const raws = passkeyTokens.map((_, i) => {
        const read = result.tokens?.[i];
        return read && read.ok ? read.raw : null;
      });
      return { native: Number(formatEther(result.native)), raws };
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

  const externalTokens = scope.readable ? offeredTokens(scope.chainId) : [];

  const externalBalance = useQuery({
    // Read on the chain the wallet is on, when hires can be funded there, so a
    // wallet on mainnet shows its mainnet balance rather than its testnet one.
    queryKey: ['wallet-balances', 'external', externalAddress, scope.readable ? scope.chainId : 'unreadable', externalTokens.map((t) => t.address).join(',')],
    queryFn: async () => {
      if (!scope.readable) return null;
      /* One read per offered token; a token whose read fails is shown as unknown, not as zero. */
      const reads = await Promise.all(externalTokens.map((t) => externalBalances(scope.chainId, t.address).catch(() => null)));
      const first = reads.find((r) => r !== null);
      if (!first) return null;
      return { native: Number(formatEther(first.native)), raws: reads.map((r) => (r ? r.payment : null)) };
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
  const tokenList = active.mode === 'passkey' ? passkeyTokens : externalTokens;
  const raws = source?.data?.raws ?? [];
  const tokens: TokenBalance[] = balanceChainId === null ? [] : tokenList.map((t, i) => {
    const raw = raws[i] ?? null;
    return { address: t.address, symbol: displaySymbol(t), decimals: t.decimals, isDefault: t.offered, raw, amount: raw === null ? null : Number(formatUnits(raw, t.decimals)) };
  });
  const balances: WalletBalances = {
    payment: tokens.find((t) => t.isDefault)?.amount ?? null,
    tokens,
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
