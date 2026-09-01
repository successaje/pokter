'use client';

import Link from 'next/link';
import { useState } from 'react';

import type { ProofSummary } from '@/lib/proof/engine';
import type { LiveReading } from '@/lib/proof/prober';

/**
 * The rule the marketplace is named after, enforced in the UI.
 *
 * Hire is unreachable until the agent has cleared two independent bars: it holds
 * a verdict that permits hiring, and it answered our live probe just now. A
 * strong historical record does not excuse an endpoint that is down right now,
 * and a responsive endpoint does not excuse a failing record.
 */
export function HireGate({
  proof,
  live,
  agentName,
  hireHref,
}: {
  proof: ProofSummary;
  live: LiveReading;
  agentName: string;
  /** Where Hire leads once both bars are cleared. */
  hireHref: string;
}) {
  const [acknowledged, setAcknowledged] = useState(false);

  const answeredNow = live.ratio !== null && live.ratio > 0;
  const blockers: string[] = [];

  if (!proof.hirable) {
    blockers.push(
      proof.verdict === 'unproven'
        ? 'No verifiable record exists for this agent.'
        : 'This agent is failing the measurers that check it.',
    );
  }
  if (!answeredNow) {
    blockers.push(
      live.protocol === 'none'
        ? 'It publishes no endpoint we can reach.'
        : 'It did not answer a single live probe just now.',
    );
  }

  const blocked = blockers.length > 0;

  if (blocked) {
    return (
      <section className="flex flex-col gap-2 rounded-xl border border-[color:var(--negative)]/30 bg-[color:var(--negative)]/5 p-5">
        <h2 className="text-sm font-medium text-[color:var(--negative)]">
          Hiring is blocked
        </h2>
        <ul className="flex list-disc flex-col gap-1 pl-4 text-xs leading-relaxed text-[color:var(--text-muted)]">
          {blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
        <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--text-faint)]">
          This is not a judgement about whether {agentName} is good. It is a
          statement that nothing here can currently be verified, and Proving
          Ground will not hand your wallet to something it cannot check.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-[color:var(--border-strong)] bg-[color:var(--surface)] p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">Ready to hire</h2>
        <p className="text-xs leading-relaxed text-[color:var(--text-muted)]">
          {agentName} answered {live.answered} of {live.probes.length} probes just
          now
          {proof.score !== null &&
            ` and measures ${(proof.score * 100).toFixed(0)}% across ${proof.probes} probe(s) of published evidence`}
          .
          {proof.verdict === 'emerging' &&
            ' Its record is real but thin — treat it as a first trial, not a settled track record.'}
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-[color:var(--text-muted)]">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
          className="mt-0.5 size-3.5 shrink-0 accent-[color:var(--positive)]"
        />
        I have read the evidence above, including how the measurers could be
        wrong.
      </label>

      {acknowledged ? (
        <Link
          href={hireHref}
          className="w-fit rounded-lg bg-[color:var(--positive)] px-4 py-2 text-xs font-medium text-[color:var(--bg)] transition hover:opacity-90"
        >
          Review permissions
        </Link>
      ) : (
        <button
          type="button"
          disabled
          className="w-fit cursor-not-allowed rounded-lg border border-[color:var(--border-strong)] px-4 py-2 text-xs font-medium text-[color:var(--text-faint)]"
        >
          Review permissions
        </button>
      )}

      <p className="text-[11px] leading-relaxed text-[color:var(--text-faint)]">
        Nothing is granted yet. The next screen shows exactly what this agent
        would be allowed to call, and what it would be blocked from.
      </p>
    </section>
  );
}
