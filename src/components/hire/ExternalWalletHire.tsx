'use client';

import { useState } from 'react';

import {
  connectExternalWallet,
  hasInjectedWallet,
  hireFromExternalWallet,
  type HireStep,
} from '@/lib/wallet/external';
import { NATIVE_SYMBOL } from '@/lib/network/presentation';
import { shortAddress } from '@/lib/ui/format';

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
  task,
  budgetU,
  ttlSeconds,
}: {
  provider: `0x${string}`;
  task: string;
  budgetU: number;
  ttlSeconds: number;
}) {
  const [account, setAccount] = useState<string | null>(null);
  const [step, setStep] = useState<HireStep | null>(null);
  const [jobId, setJobId] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [atomic, setAtomic] = useState<boolean | null>(null);

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
    try {
      const outcome = await hireFromExternalWallet({
        provider,
        task,
        budgetU,
        ttlSeconds,
        onProgress: (progress) => {
          setStep(progress.step);
          if (progress.jobId) setJobId(progress.jobId);
        },
      });
      setAtomic(outcome.atomic);
      setJobId(outcome.jobId);
      setStep('done');
    } catch (caught) {
      const message = (caught as Error)?.message ?? '';
      setError(
        message === 'WRONG_CHAIN'
          ? 'Your wallet changed network part way through. Nothing further was sent.'
          : /user rejected|denied/i.test(message)
            ? 'You declined a signature. Nothing further was sent.'
            : 'That step did not complete. Nothing after it was sent — see where it stopped below.',
      );
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
          unless your wallet can batch it asks for five signatures instead of
          one — every step is listed below before any of them is raised.
        </p>
      </div>

      {account ? (
        <p className="tabular text-[11px] text-[color:var(--text-muted)]">
          Signing as {shortAddress(account)} — check this is the wallet you
          meant before approving anything.
        </p>
      ) : null}

      <ol className="flex flex-col gap-1.5">
        {STEPS.map((entry, index) => {
          const done = activeIndex > index || step === 'done';
          const current = step === entry.id;
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
          {/*
            Where it stopped, in terms of what now exists. A half-built job is
            recoverable and an approval left behind is not dangerous at this
            size — but only if the person is told which of the two they have.
          */}
          {jobId !== null && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-[color:var(--text-muted)]">
              Job #{jobId.toString()} exists on chain and is not funded. Nothing
              can be drawn from it, and it expires on its own. You can import it
              on your activity page to finish or track it.
            </p>
          )}
        </div>
      )}

      {step === 'done' && jobId !== null && (
        <p className="rounded-[var(--radius)] border border-[color:var(--positive)]/35 bg-[color:var(--positive-dim)] p-3 text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
          Job #{jobId.toString()} funded
          {atomic ? ' in one batched transaction' : ' across five transactions'}.
          Track it from your activity page.
        </p>
      )}

      {account ? (
        <button
          type="button"
          onClick={hire}
          disabled={running}
          className="action-primary inline-flex min-h-10 items-center justify-center rounded-[var(--radius)] px-5 text-[13px] font-semibold disabled:opacity-50"
        >
          {running ? 'Waiting for your wallet…' : `Hire for ${budgetU} $U`}
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
