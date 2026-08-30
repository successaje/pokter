import type { Attestation } from '@/lib/proof/attestation';

const BSCSCAN_TX = 'https://bscscan.com/tx/';

/**
 * Third-party evidence, rendered as receipts. Every row links to the
 * transaction that carries it — a number the user cannot trace is a number we
 * should not be showing.
 */
export function EvidencePanel({ attestations }: { attestations: Attestation[] }) {
  if (attestations.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[color:var(--border)] p-5 text-xs leading-relaxed text-[color:var(--muted-dim)]">
        No third-party measurer has published an attestation for this agent. That
        is not a low score — it means nobody independent has checked it yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {attestations.map((attestation) => (
        <li
          key={attestation.id}
          className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-3.5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="text-xs font-medium">
              {attestation.measuredBy ?? 'Unnamed measurer'}
              <span className="ml-2 font-normal text-[color:var(--muted-dim)]">
                {attestation.dimension}
                {attestation.window ? ` · ${attestation.window}` : ''}
              </span>
            </span>
            <span className="tabular text-xs">
              {attestation.ratio === null
                ? '—'
                : `${(attestation.ratio * 100).toFixed(1)}%`}
            </span>
          </div>

          {attestation.method && (
            <p className="tabular mt-1.5 text-[11px] text-[color:var(--muted-dim)]">
              {attestation.method.answered ?? '?'}/{attestation.method.probes ?? '?'}{' '}
              probes answered
              {attestation.method.medianMs != null &&
                ` · median ${attestation.method.medianMs}ms`}
              {attestation.method.protocol && ` · ${attestation.method.protocol}`}
            </p>
          )}

          {attestation.reasoning && (
            <p className="mt-2 text-[11px] leading-relaxed text-[color:var(--muted)]">
              {attestation.reasoning}
            </p>
          )}

          {attestation.transactionHash && (
            <a
              href={`${BSCSCAN_TX}${attestation.transactionHash}`}
              target="_blank"
              rel="noreferrer noopener"
              className="tabular mt-2 inline-block text-[11px] text-[color:var(--muted-dim)] underline decoration-dotted underline-offset-4 hover:text-[color:var(--foreground)]"
            >
              {attestation.transactionHash.slice(0, 18)}…
              {attestation.blockNumber ? ` · block ${attestation.blockNumber}` : ''}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
