'use client';

import { plural } from '@/lib/ui/plural';
import Link from 'next/link';
import { useState } from 'react';

import type { ProofSummary } from '@/lib/proof/engine';
import type { LiveReading } from '@/lib/proof/prober';

/**
 * The rule the marketplace is named after, enforced in the UI.
 *
 * The normal hire path requires two independent bars: a recommendable evidence
 * verdict and a successful live probe. Falling short opens an explicit risk
 * path rather than silently making the decision for the user.
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
  /** Where Hire leads after the normal review or explicit risk acceptance. */
  hireHref: string;
}) {
  const [acknowledged, setAcknowledged] = useState(false);

  const answeredNow = live.ratio !== null && live.ratio > 0;
  const warnings: string[] = [];

  if (!proof.recommendedForHire) {
    warnings.push(
      proof.verdict === 'unproven'
        ? 'No verifiable record exists for this agent.'
        : 'This agent is failing the measurers that check it.',
    );
  }
  if (!answeredNow) {
    warnings.push(
      live.protocol === 'none'
        ? 'It publishes no endpoint we can reach.'
        : 'It did not answer a single live probe just now.',
    );
  }

  const needsRiskAcceptance = warnings.length > 0;

  if (needsRiskAcceptance) {
    return (
      <section className="flex flex-col gap-3 rounded-xl border border-[color:var(--caution)]/35 bg-[color:var(--caution-dim)] p-5">
        <h2 className="text-sm font-medium text-[color:var(--caution)]">
          Explicit risk acceptance required
        </h2>
        <ul className="flex list-disc flex-col gap-1 pl-4 text-xs leading-relaxed text-[color:var(--text-muted)]">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
        <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--text-faint)]">
          Pokter does not recommend proceeding while these warnings remain. You
          can continue only after reviewing them and explicitly accepting the
          additional risk.
        </p>
        <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-[color:var(--text-muted)]">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
            className="mt-0.5 size-3.5 shrink-0 accent-[color:var(--brand)]"
          />
          I understand the evidence warning for {agentName} and explicitly
          accept the additional risk.
        </label>
        {acknowledged ? (
          <Link
            href={hireHref}
            className="w-fit rounded-lg border border-[color:var(--caution)]/50 px-4 py-2 text-xs font-medium text-[color:var(--caution)] transition hover:border-[color:var(--caution)]"
          >
            Continue to permissions
          </Link>
        ) : (
          <button
            type="button"
            disabled
            className="w-fit cursor-not-allowed rounded-lg border border-[color:var(--border-strong)] px-4 py-2 text-xs font-medium text-[color:var(--text-faint)]"
          >
            Continue to permissions
          </button>
        )}
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
            ` and measures ${(proof.score * 100).toFixed(0)}% across ${plural(proof.probes, 'probe')} of published evidence`}
          .
          {/*
            The two shortfalls say different things and had one sentence
            between them. "Real but thin" described the case that is now
            `observed`; a `reliable` agent has been examined properly and is
            simply uncorroborated, which is a different thing to tell someone
            about to spend money — and an `emerging` one is examined and
            patchy, which is a third thing again.
          */}
          {proof.verdict === 'observed' &&
            ' Its record is real but thin — treat it as a first trial, not a settled track record.'}
          {proof.verdict === 'reliable' &&
            ' It answers nearly every probe Pokter sends, but nobody independent has corroborated it.'}
          {proof.verdict === 'emerging' &&
            ' It misses some of the probes Pokter sends, and nobody independent has corroborated it.'}
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

      <p className="text-[12px] leading-relaxed text-[color:var(--text-faint)]">
        Nothing is granted yet. The next screen shows exactly what this agent
        would be allowed to call, and what it would be blocked from.
      </p>
    </section>
  );
}
