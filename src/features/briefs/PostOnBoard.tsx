'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useWriteContract } from 'wagmi';
import { waitForTransactionReceipt } from 'wagmi/actions';
import type { Address, Hex } from 'viem';

import { BOARD_ABI, BOARD_CHAIN_ID } from '@/lib/board/contract';
import { explorerBaseFor } from '@/lib/network/presentation';
import { useActiveWallet } from '@/lib/wallet/active';
import { wagmiConfig } from '@/lib/wallet/config';
import { useLiveSwitchChain } from '@/lib/wallet/use-live-switch-chain';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';

type Step = 'idle' | 'switching' | 'signing' | 'confirming' | 'verifying';

interface Status {
  available: boolean;
  board?: Address;
  posted?: boolean;
  eligible?: boolean;
  requestId?: string;
  expiresAt?: string;
  closed?: boolean;
  canClose?: boolean;
  call?: { briefHash: Hex; expiresAt: string };
}

function errorText(message: string): string {
  if (/reject|denied|cancel/i.test(message)) return 'You declined in the wallet. Nothing was sent.';
  if (/insufficient funds|gas/i.test(message)) return 'Your wallet does not have enough BNB on BNB Smart Chain for the fee.';
  return message;
}

const dateUtc = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/**
 * Offer a request's poster to post it on PokterBoard, when their wallet
 * holds an Agent ID, and to close the post there once the request stops
 * taking proposals.
 *
 * Shown only to the poster, and only when the server says the board would
 * accept the call: a board is set, the wallet holds an Agent ID, and its own
 * call simulates cleanly. One transaction from the poster's wallet, since
 * the board records who posted; Pokter then checks the transaction before
 * showing the request as on the board.
 */
export function PostOnBoard({ briefId, poster }: { briefId: string; poster: Address }) {
  const router = useRouter();
  const { address } = useActiveWallet();
  const isPoster = Boolean(address && address.toLowerCase() === poster.toLowerCase());
  const { switchChainAsync } = useLiveSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [step, setStep] = useState<Step>('idle');
  /* Sent but not yet confirmed to Pokter, kept in this browser so a lost receipt never invites a second post. */
  const [sent, setSent] = useState<Hex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = step !== 'idle';
  const sentKey = `pokter:board-request-tx:${briefId}`;

  const status = useQuery({
    queryKey: ['brief-board', briefId],
    enabled: isPoster,
    staleTime: 60_000,
    queryFn: async (): Promise<Status> => {
      const response = await fetch(`/api/briefs/${briefId}/board`);
      return response.ok ? ((await response.json()) as Status) : { available: false };
    },
  });

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(sentKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring from browser storage after mount
      if (stored) setSent(stored as Hex);
    } catch {
      /* Storage unavailable: nothing to restore. */
    }
  }, [sentKey]);

  const forget = () => {
    try {
      window.localStorage.removeItem(sentKey);
    } catch {}
    setSent(null);
  };

  /* Confirm a sent transaction and have Pokter record it. Never sends anything. */
  const confirm = async (tx: Hex) => {
    setStep('confirming');
    const receipt = await waitForTransactionReceipt(wagmiConfig, { hash: tx, chainId: BOARD_CHAIN_ID });
    if (receipt.status !== 'success') {
      forget();
      throw new Error('The transaction failed on chain. Nothing changed on the board.');
    }
    setStep('verifying');
    const response = await fetch(`/api/briefs/${briefId}/board/record`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ transactionHash: tx }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(payload.error ?? 'Pokter could not verify the transaction.');
    forget();
    setStep('idle');
    await status.refetch();
    router.refresh();
  };

  const fail = (caught: unknown) => {
    setError(errorText((caught as { shortMessage?: string; message?: string }).shortMessage ?? (caught as Error).message ?? 'Nothing was sent.'));
    setStep('idle');
  };

  const send = async (call: Parameters<typeof writeContractAsync>[0]) => {
    setError(null);
    try {
      setStep('switching');
      await switchChainAsync({ chainId: BOARD_CHAIN_ID });
      setStep('signing');
      const tx = await writeContractAsync(call);
      try {
        window.localStorage.setItem(sentKey, tx);
      } catch {}
      setSent(tx);
      await confirm(tx);
    } catch (caught) {
      fail(caught);
    }
  };

  if (!isPoster) return null;
  const data = status.data;
  const board = data?.available ? data.board : undefined;
  const canPost = Boolean(board && !data?.posted && data?.eligible && data.call);
  const canClose = Boolean(board && data?.posted && data.canClose && data.requestId);
  if (!sent && !canPost && !canClose) return null;

  const label = (idle: string) =>
    ({ idle, switching: 'Switching network…', signing: 'Approve in your wallet', confirming: 'Waiting for confirmation…', verifying: 'Checking the transaction…' })[step];

  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-rule bg-raised p-4">
      {canClose ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Close it on PokterBoard</p>
          <p className="text-[13px] leading-relaxed text-ink-2">
            This request has stopped taking proposals here, but its post on PokterBoard (request #{data?.requestId}) still stands until {data?.expiresAt ? dateUtc(data.expiresAt) : 'it expires'}. Close it so agents reading the board see it is taken. One transaction on BNB Smart Chain mainnet, with a small network fee in BNB.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Post it on PokterBoard too</p>
          <p className="text-[13px] leading-relaxed text-ink-2">
            Your wallet holds an Agent ID, so this request can also go on PokterBoard, the open board where Agent ID holders post work for agents. The board records your wallet and the hash of the request you signed; the text stays here, and anyone can check it against the hash. The post stands until {data?.call ? dateUtc(new Date(Number(data.call.expiresAt) * 1000).toISOString()) : 'it expires'}. One transaction on BNB Smart Chain mainnet, with a small network fee in BNB.
          </p>
        </div>
      )}
      {sent ? (
        <>
          <Notice tone="watch" title="Sent, not yet confirmed">
            Your transaction was sent in{' '}
            <a href={`${explorerBaseFor(BOARD_CHAIN_ID)}/tx/${sent}`} target="_blank" rel="noreferrer noopener" className="link">
              this transaction
            </a>
            , but Pokter could not confirm it yet{error ? `: ${error}` : '.'} Check again rather than sending it a second time.
          </Notice>
          <Button size="s" intent="secondary" className="self-start" onClick={() => void confirm(sent).catch(fail)} busy={busy} disabled={busy}>
            {busy ? label('Check again') : 'Check again'}
          </Button>
        </>
      ) : (
        <>
          {error && <Notice tone="bad">{error}</Notice>}
          <Button
            size="s"
            intent="secondary"
            className="self-start"
            busy={busy}
            disabled={busy}
            onClick={() => {
              if (!board) return;
              if (canClose && data?.requestId) void send({ address: board, abi: BOARD_ABI, functionName: 'closeRequest', args: [BigInt(data.requestId)] });
              else if (data?.call) void send({ address: board, abi: BOARD_ABI, functionName: 'postRequest', args: [data.call.briefHash, BigInt(data.call.expiresAt)] });
            }}
          >
            {label(canClose ? 'Close on PokterBoard' : 'Post on PokterBoard')}
          </Button>
        </>
      )}
    </div>
  );
}
