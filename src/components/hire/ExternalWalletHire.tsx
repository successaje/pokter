'use client';

import { useEffect, useState } from 'react';

import {
  connectExternalWallet,
  hasInjectedWallet,
  hireFromExternalWallet,
  onExternalAccountsChanged,
  revokeExternalWalletAllowance,
  type HireStep,
} from '@/lib/wallet/external';
import { explorerTxUrl, NATIVE_SYMBOL } from '@/lib/network/presentation';
import { shortAddress } from '@/lib/ui/format';
import { rememberJob } from '@/lib/wallet/activity';
import { WALLET_NETWORK } from '@/lib/wallet/passkey';
import { parseUnits } from 'viem';
import type { HiredJob } from '@/lib/erc8183/types';

/*
 * What each signature is for, in the order they are raised.
 *
 * Five prompts in a row is how people learn to click through prompts. Naming
 * them in advance, and marking the one being asked for, is the difference
 * between approving a sequence you were shown and approving whatever appears.
 */
const STEPS: { id: HireStep; label: string; detail: string }[] = [
  { id: 'creating', label: 'Create the job', detail: 'Writes the task and expiry on chain. No funds move.' },
  { id: 'registering', label: 'Register the policy', detail: 'Binds the dispute rules. No funds move.' },
  { id: 'budgeting', label: 'Set the budget', detail: 'Records the amount. No funds move.' },
  { id: 'approving', label: 'Approve the exact budget', detail: 'Allows the escrow to draw this amount and no more.' },
  { id: 'funding', label: 'Fund the escrow', detail: 'This is the transaction that moves your money.' },
  { id: 'confirming', label: 'Verify the job', detail: 'Reads the funded job back from chain before reporting success.' },
];

/**
 * Hiring with a wallet someone already has.
 *
 * Offered beside the passkey path rather than instead of it. The passkey
 * wallet gets an atomic five-call batch through Altana's relay; this gets
 * five separate transactions unless the wallet supports EIP-5792, and every
 * gap between them is a state the person now owns. That is a real cost and
 * the panel says so before anyone starts, rather than after something fails.
 */
export function ExternalWalletHire({
  provider,
  providerLabel,
  automatedDelivery,
  agent,
  task,
  budgetU,
  ttlSeconds,
  riskWarnings = [],
}: {
  provider: `0x${string}`;
  providerLabel?: string;
  /** Whether this seller publishes an endpoint that can be told to deliver. */
  automatedDelivery?: boolean;
  agent: { chainId: number; tokenId: string; name: string; category: string };
  task: string;
  budgetU: number;
  ttlSeconds: number;
  riskWarnings?: string[];
}) {
  const [account, setAccount] = useState<string | null>(null);
  const [step, setStep] = useState<HireStep | null>(null);
  const [failedAt, setFailedAt] = useState<HireStep | null>(null);
  const [jobId, setJobId] = useState<bigint | null>(null);
  const [lastHash, setLastHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [atomic, setAtomic] = useState<boolean | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [riskAccepted, setRiskAccepted] = useState(riskWarnings.length === 0);
  const [delivery, setDelivery] = useState<
    null | 'asking' | 'asked' | 'unreachable' | 'none'
  >(null);
  const [deliveryDetail, setDeliveryDetail] = useState<string | null>(null);

  useEffect(() => {
    if (!account || !hasInjectedWallet()) return;
    return onExternalAccountsChanged((accounts) => {
      const next = accounts[0] ?? null;
      if (!next || next.toLowerCase() !== account.toLowerCase()) {
        setAccount(null);
        setStep(null);
        setError('The wallet account changed. Connect the account you intend to use again.');
      }
    });
  }, [account]);

  if (!hasInjectedWallet()) return null;

  const connect = async () => {
    setError(null);
    try {
      setAccount(await connectExternalWallet());
    } catch (caught) {
      setError(
        (caught as Error)?.message === 'WRONG_CHAIN'
          ? `Switch your wallet to ${process.env.NEXT_PUBLIC_ALTANA_NETWORK === 'bnb' ? 'BNB Chain' : 'BNB Testnet'} and try again.`
          : 'Could not connect. Check the wallet extension and try again.',
      );
    }
  };

  const hire = async () => {
    setError(null);
    setFailedAt(null);
    try {
      const outcome = await hireFromExternalWallet({
        identityChainId: agent.chainId,
        agentTokenId: agent.tokenId,
        agentName: agent.name,
        category: agent.category,
        provider,
        providerLabel,
        task,
        budgetU,
        ttlSeconds,
        onProgress: (progress) => {
          setFailedAt(progress.step);
          setStep(progress.step);
          if (progress.jobId) setJobId(progress.jobId);
          if (progress.hash) setLastHash(progress.hash);
        },
      });
      setAtomic(outcome.atomic);
      setJobId(outcome.jobId);
      setStep('done');

      /*
       * A funded job nobody recorded is a funded job nobody can find.
       *
       * The passkey path writes the record and pings the seller; this one
       * returned a job id and stopped, so a hire made here would have left
       * escrow funded, the activity page empty and the seller never told to
       * deliver — which is the state that leaves money sitting until expiry.
       * Recorded against the connected address, because that is the wallet the
       * chain names as this job's client.
       */
      const now = new Date().toISOString();
      const hired: HiredJob = {
        id: crypto.randomUUID(),
        jobId: outcome.jobId.toString(),
        chainId: WALLET_NETWORK.chainId,
        isTestnet: WALLET_NETWORK.chainId === 97,
        agentChainId: agent.chainId,
        agentTokenId: agent.tokenId,
        agentName: agent.name,
        providerLabel,
        provider,
        task,
        budgetRaw: parseUnits(String(budgetU), 18).toString(),
        expiredAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
        hiredAt: now,
        hireTxHash: outcome.transactionHash,
        status: 'FUNDED',
        statusCheckedAt: now,
        deliverableUrl: null,
        settleTxHash: null,
      };

      if (account) rememberJob(account, hired);

      /*
       * Told separately from the record, and failing separately too. A seller
       * that cannot be reached does not undo a funded job, so this reports
       * rather than throws — the escrow is real either way and the buyer needs
       * to know which of the two happened.
       */
      if (automatedDelivery) {
        setDelivery('asking');
        try {
          const response = await fetch('/api/notify-funded', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              agentChainId: agent.chainId,
              tokenId: agent.tokenId,
              jobId: hired.jobId,
              provider: hired.provider,
            }),
          });
          if (response.ok) {
            setDelivery('asked');
          } else {
            /*
             * The route refuses for five different reasons — a provider that
             * does not match the job, a job that is not FUNDED, a registry
             * disagreeing with the chain, a seller with no A2A card, a rate
             * limit — and this collapsed all of them into "could not be
             * reached". That reads as a network problem and sends nobody
             * anywhere useful. The reason it actually gave is the thing worth
             * showing.
             */
            const detail = await response
              .json()
              .then((body: { error?: string }) => body?.error)
              .catch(() => null);
            setDelivery('unreachable');
            setDeliveryDetail(detail ?? `The seller endpoint returned ${response.status}.`);
          }
        } catch (caught) {
          setDelivery('unreachable');
          setDeliveryDetail(
            (caught as Error)?.message ?? 'The request did not complete.',
          );
        }
      } else {
        setDelivery('none');
      }
    } catch (caught) {
      const message = (caught as Error)?.message ?? '';
      // A rejected or failed provider request is no longer in flight. Keeping
      // the last step active left the button saying “Waiting for wallet…”
      // forever even though there was nothing left for the wallet to approve.
      setStep(null);
      setError(
        message === 'WRONG_CHAIN'
          ? 'Your wallet changed network part way through. Nothing further was sent.'
          : message === 'ACCOUNT_CHANGED'
            ? 'The selected wallet account changed. Nothing further was sent.'
            : message === 'INSUFFICIENT_PAYMENT_TOKEN'
              ? `This wallet does not hold enough $U for the ${budgetU} $U budget.`
          : /user rejected|denied/i.test(message)
            ? 'You declined a signature. Nothing further was sent.'
            : 'That step did not complete. Nothing after it was sent — see where it stopped below.',
      );
    }
  };

  const revoke = async () => {
    if (!account) return;
    setRevoking(true);
    setError(null);
    try {
      await revokeExternalWalletAllowance(account as `0x${string}`);
      setRevoked(true);
    } catch {
      setError('The allowance was not revoked. Check the wallet transaction and try again.');
    } finally {
      setRevoking(false);
    }
  };

  const activeIndex = STEPS.findIndex((s) => s.id === step);
  const running = step !== null && step !== 'done';

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--brand-strong)]">
          Use the wallet you already have
        </p>
        <p className="text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
          Hires straight from your extension wallet, with no passkey to create
          and nothing to fund first. It costs {NATIVE_SYMBOL} for gas, and
          unless your wallet can batch it asks for several transactions instead
          of one. The exact number depends on its existing token allowance.
        </p>
      </div>

      {account ? (
        <p className="tabular text-[11px] text-[color:var(--text-muted)]">
          Signing as {shortAddress(account)} — check this is the wallet you
          meant before approving anything.
        </p>
      ) : null}

      {riskWarnings.length > 0 && (
        <label className="flex items-start gap-2 rounded-[var(--radius)] border border-[color:var(--caution)]/35 bg-[color:var(--caution-dim)] p-3 text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
          <input
            type="checkbox"
            checked={riskAccepted}
            onChange={(event) => setRiskAccepted(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-[color:var(--brand)]"
          />
          <span>
            I understand this agent does not meet Pokter’s recommendation threshold
            and accept the additional risk before funding escrow.
          </span>
        </label>
      )}

      <ol className="flex flex-col gap-1.5">
        {STEPS.map((entry, index) => {
          const done = activeIndex > index || step === 'done';
          const current = step === entry.id || (Boolean(error) && failedAt === entry.id);
          return (
            <li
              key={entry.id}
              className={
                current
                  ? 'flex gap-2.5 rounded-[var(--radius)] border border-[color:var(--brand)] bg-[color:var(--brand-highlight-soft)] p-2.5'
                  : 'flex gap-2.5 rounded-[var(--radius)] border border-transparent p-2.5'
              }
            >
              <span
                className={
                  done
                    ? 'tabular flex size-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--positive)] text-[10px] font-bold text-[color:var(--surface)]'
                    : 'tabular flex size-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--bg-subtle)] text-[10px] font-semibold text-[color:var(--text-muted)]'
                }
              >
                {done ? '✓' : index + 1}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[12px] font-medium">{entry.label}</span>
                <span className="text-[11px] leading-snug text-[color:var(--text-muted)]">
                  {entry.detail}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      {error && (
        <div className="rounded-[var(--radius)] border border-[color:var(--negative)]/35 bg-[color:var(--negative-dim)] p-3">
          <p className="text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
            {error}
          </p>
          {jobId !== null && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-[color:var(--text-muted)]">
              Job #{jobId.toString()} exists on chain. The highlighted step was
              the last action Pokter attempted; check it in the explorer before
              retrying. An unfunded job cannot draw funds and expires on its own.
            </p>
          )}
          {lastHash && (
            <a href={explorerTxUrl(lastHash)} target="_blank" rel="noreferrer"
              className="mt-1.5 inline-block text-[11px] underline decoration-dotted underline-offset-2">
              Inspect the last confirmed transaction ↗
            </a>
          )}
          {(failedAt === 'approving' || failedAt === 'funding' || failedAt === 'confirming') &&
            account && !revoked && (
              <button type="button" onClick={revoke} disabled={revoking}
                className="mt-2 text-[11px] font-medium text-[color:var(--negative)] underline underline-offset-2 disabled:opacity-50">
                {revoking ? 'Waiting for wallet…' : 'Revoke any remaining $U allowance'}
              </button>
            )}
          {revoked && (
            <p className="mt-1.5 text-[11px] text-[color:var(--positive)]">$U allowance revoked.</p>
          )}
        </div>
      )}

      {step === 'done' && jobId !== null && (
        <div className="flex flex-col gap-1.5 rounded-[var(--radius)] border border-[color:var(--positive)]/35 bg-[color:var(--positive-dim)] p-3">
          <p className="text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
            Job #{jobId.toString()} funded
            {atomic ? ' in one atomic wallet batch' : ' through the verified transaction sequence'}
            , and saved to this device. Track it from your activity page.
          </p>
          {/*
            Whether the seller was actually told. Funding and delivery fail
            separately, and a buyer who thinks a silent seller was asked will
            wait out the whole window before finding out it never heard.
          */}
          {delivery && (
            <p className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
              {delivery === 'asking'
                ? 'Asking the seller to deliver…'
                : delivery === 'asked'
                  ? 'The seller has been asked to deliver.'
                  : delivery === 'unreachable'
                    ? `Delivery was not requested: ${deliveryDetail ?? 'the seller could not be reached'}. Escrow is funded and stays yours until the job expires.`
                    : 'This seller publishes no delivery endpoint, so nothing was requested. Escrow is funded and stays yours until the job expires.'}
            </p>
          )}
        </div>
      )}

      {account ? (
        <button
          type="button"
          onClick={hire}
          disabled={running || !riskAccepted || (Boolean(error) && jobId !== null)}
          className="action-primary inline-flex min-h-10 items-center justify-center rounded-[var(--radius)] px-5 text-[13px] font-semibold disabled:opacity-50"
        >
          {running
            ? 'Waiting for wallet…'
            : error && jobId !== null
              ? 'Review the existing job first'
              : `Hire for ${budgetU} $U`}
        </button>
      ) : (
        <button
          type="button"
          onClick={connect}
          className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius)] border border-[color:var(--border-strong)] px-5 text-[13px] font-medium transition-colors hover:bg-[color:var(--surface-hover)]"
        >
          Connect my wallet
        </button>
      )}
    </section>
  );
}
