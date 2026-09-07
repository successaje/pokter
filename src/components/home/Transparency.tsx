import Link from 'next/link';

/**
 * What worked and what did not.
 *
 * A landing page that lists only successes is a claim; one that names its
 * failures is a report. Every line here is drawn from docs/integrations, where
 * each is written up with the exact error, and the fix where there was one.
 */
const OUTCOMES: {
  name: string;
  status: 'working' | 'partial';
  worked: string;
  didnt: string | null;
  /** Where a finding was reported, when we did more than notice it. */
  report?: { label: string; href: string };
}[] = [
  {
    name: 'Altana sessions',
    status: 'working',
    worked:
      'Scoped session granted, registered in the on-chain KeyStore and revoked. Five confirmed transactions on BSC testnet.',
    didnt:
      'The SDK documents an injected-wallet signer it does not implement, so grants are still signed by an operator key rather than the visitor’s wallet.',
  },
  {
    name: 'ERC-8183 escrow',
    status: 'working',
    worked:
      'Jobs created, registered, funded and escrowed from the product itself, in one atomic batch.',
    didnt:
      'SDK 0.8.0 shipped a stale policy address, so every hire reverted with an undecodable selector until we diffed it against the reference implementation. We reported it — and the maintainers had already fixed it in 0.9.0 the day before. We upgraded; our workaround is now inert.',
    report: {
      label: 'Reported, and already fixed · altana-sdk#84',
      href: 'https://github.com/altananetwork/altana-sdk/issues/84',
    },
  },
  {
    name: '8004scan',
    status: 'working',
    worked:
      'Agent identity, capabilities and attestations, decoded to the measurer and methodology behind each figure.',
    didnt:
      'Semantic search misses agents whose name is the keyword, so retrieval had to become hybrid.',
  },
  {
    name: 'Agent delivery',
    status: 'partial',
    worked: 'Escrow funded and visible on-chain, awaiting the seller.',
    didnt:
      'Funded jobs sit unfulfilled: the seller runtime has no poller, and its endpoint is not discoverable in the registry, so we cannot notify it.',
  },
];

export function Transparency() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex max-w-2xl flex-col gap-2">
        <p className="text-[11px] font-medium uppercase tracking-widest text-[color:var(--text-muted)]">
          Transparency
        </p>
        <h2 className="text-xl font-medium tracking-tight sm:text-2xl">
          What worked, and what fought back.
        </h2>
        <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
          Each integration is written up with the exact error it produced. A page
          that lists only successes is a claim; one that names its failures is a
          report.
        </p>
      </div>

      <ul className="grid gap-px overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--border)] sm:grid-cols-2">
        {OUTCOMES.map((outcome) => (
          <li
            key={outcome.name}
            className="flex flex-col gap-3 bg-[color:var(--surface)] p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[13px] font-medium">{outcome.name}</h3>
              <span
                className="rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                style={{
                  borderColor:
                    outcome.status === 'working'
                      ? 'color-mix(in srgb, var(--positive) 35%, transparent)'
                      : 'color-mix(in srgb, var(--caution) 35%, transparent)',
                  background:
                    outcome.status === 'working'
                      ? 'var(--positive-dim)'
                      : 'var(--caution-dim)',
                  color:
                    outcome.status === 'working'
                      ? 'var(--positive)'
                      : 'var(--caution)',
                }}
              >
                {outcome.status}
              </span>
            </div>

            <p className="flex gap-2 text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
              <span aria-hidden className="text-[color:var(--positive)]">
                ✓
              </span>
              {outcome.worked}
            </p>

            {outcome.didnt && (
              <p className="flex gap-2 text-[11px] leading-relaxed text-[color:var(--text-muted)]">
                <span aria-hidden className="text-[color:var(--caution)]">
                  ⚠
                </span>
                {outcome.didnt}
              </p>
            )}

            {/*
              Where the finding was not just ours to work around. Noticing a
              bug and reporting it are different things, and only the second
              one helps the next person to hit it.
            */}
            {outcome.report && (
              <Link
                href={outcome.report.href}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-auto w-fit text-[11px] text-[color:var(--info)] underline decoration-dotted underline-offset-2"
              >
                {outcome.report.label} ↗
              </Link>
            )}
          </li>
        ))}
      </ul>

      <p className="text-[11px] text-[color:var(--text-faint)]">
        Full write-ups, including the transactions and the error strings, are in{' '}
        <Link
          href="https://github.com/successaje/pokter/tree/main/docs/integrations"
          className="underline underline-offset-2"
        >
          docs/integrations
        </Link>
        .
      </p>
    </section>
  );
}
