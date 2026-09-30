'use client';

import type { HireStep } from '@/lib/wallet/external';

/*
 * The five signatures, named before they are asked for.
 *
 * A wallet that asks five times without explanation reads as a bug — the first
 * hire through this path produced five prompts and a panel that said "funding
 * escrow" throughout, so the only way to know what was being signed was to
 * read the calldata. These are the same five in the same order, so the prompt
 * on screen always has a line here that matches it.
 *
 * Batched wallets sign once. The list still stands, because it is describing
 * what the one signature contains.
 */
const STEPS: { id: HireStep; label: string; note: string }[] = [
  { id: 'creating', label: 'Create the job', note: 'Writes the brief and expiry. No funds move.' },
  { id: 'registering', label: 'Register the policy', note: 'Binds the dispute rules. No funds move.' },
  { id: 'budgeting', label: 'Set the budget', note: 'Records the amount. No funds move.' },
  { id: 'approving', label: 'Approve the budget', note: 'Lets the escrow draw exactly this much.' },
  { id: 'funding', label: 'Fund the escrow', note: 'The one that moves your money.' },
];

const ORDER: HireStep[] = [
  'connecting',
  'creating',
  'registering',
  'budgeting',
  'approving',
  'funding',
  'confirming',
  'done',
];

/**
 * What the wallet is asking for, while it asks.
 *
 * Sits where the submit button was, so the explanation is in the place the
 * reader is already looking rather than somewhere they have to find. Open
 * while it runs, because that is the moment the five prompts need accounting
 * for, and collapsible for anyone who has seen it before.
 */
export function ExternalHireSteps({
  step,
  jobId,
}: {
  step: HireStep | null;
  jobId?: bigint | null;
}) {
  if (!step) return null;

  const position = ORDER.indexOf(step);
  const done = step === 'done';
  const index = STEPS.findIndex((entry) => entry.id === step);
  const current = index === -1 ? null : STEPS[index];
  const settled = done
    ? STEPS.length
    : STEPS.filter((entry) => ORDER.indexOf(entry.id) < position).length;

  return (
    <details
      open={!done}
      className="group rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg-subtle)]"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 p-3">
        {/*
          Progress as dots rather than a bar: five is few enough to count, and
          a count is what answers "how many more times will this ask me".
        */}
        <span aria-hidden className="flex shrink-0 gap-1">
          {STEPS.map((entry, i) => (
            <span
              key={entry.id}
              className={
                i < settled
                  ? 'size-1.5 rounded-full bg-[color:var(--positive)]'
                  : i === settled && !done
                    ? 'size-1.5 rounded-full bg-[color:var(--brand)]'
                    : 'size-1.5 rounded-full bg-[color:var(--border-strong)]'
              }
            />
          ))}
        </span>

        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[12px] font-medium">
            {done
              ? 'All five confirmed'
              : step === 'confirming'
                ? 'Waiting for the last confirmation'
                : current
                  ? `Step ${settled + 1} of ${STEPS.length} · ${current.label}`
                  : 'Connecting your wallet'}
          </span>
          <span className="text-[11px] text-[color:var(--text-muted)]">
            {done
              ? jobId
                ? `Job #${jobId.toString()} is funded.`
                : 'The job is funded.'
              : current
                ? current.note
                : step === 'confirming'
                  ? 'Signed. Waiting for the chain to confirm it.'
                  : 'Approve the request in your wallet.'}
          </span>
        </span>

        <span
          aria-hidden
          className="shrink-0 text-[color:var(--text-faint)] transition-transform group-open:rotate-180"
        >
          ⌄
        </span>
      </summary>

      <ol className="flex flex-col gap-0.5 border-t border-[color:var(--border)] p-2">
        {STEPS.map((entry, i) => {
          const finished = i < settled;
          const active = i === settled && !done;
          return (
            <li
              key={entry.id}
              className={
                active
                  ? 'flex items-start gap-2.5 rounded-[calc(var(--radius)-2px)] bg-[color:var(--surface)] p-2'
                  : 'flex items-start gap-2.5 p-2'
              }
            >
              <span
                aria-hidden
                className={
                  finished
                    ? 'mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-[color:var(--positive)] text-[9px] font-bold text-[color:var(--surface)]'
                    : active
                      ? 'mt-px flex size-4 shrink-0 items-center justify-center rounded-full border-2 border-[color:var(--brand)] text-[9px]'
                      : 'tabular mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-[color:var(--border)] text-[9px] text-[color:var(--text-muted)]'
                }
              >
                {finished ? '✓' : active ? '' : i + 1}
              </span>
              <span className="flex min-w-0 flex-col">
                <span
                  className={
                    active
                      ? 'text-[12px] font-medium'
                      : finished
                        ? 'text-[12px] text-[color:var(--text-muted)]'
                        : 'text-[12px] text-[color:var(--text-faint)]'
                  }
                >
                  {entry.label}
                </span>
                {(active || !finished) && (
                  <span className="text-[11px] leading-snug text-[color:var(--text-faint)]">
                    {active ? 'Approve this in your wallet' : entry.note}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
