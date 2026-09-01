import Link from 'next/link';

/**
 * The product's position, stated plainly.
 *
 * Placed near the exit deliberately. Everything above it is evidence; this is
 * the rule that produced the evidence, and it is the one claim on the page
 * that is not a measurement — so it says what Pokter refuses to do rather than
 * what it can.
 */
const CREED = [
  { verb: 'We measure', object: 'availability.' },
  { verb: 'We verify', object: 'attestations.' },
  { verb: 'We track', object: 'evidence.' },
  { verb: 'We don’t manufacture', object: 'performance.', negative: true },
];

export function Philosophy() {
  return (
    <section className="flex flex-col gap-8 rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--bg-subtle)] px-6 py-12 sm:px-10 sm:py-16">
      <div className="flex max-w-3xl flex-col gap-4">
        <p className="text-[11px] font-medium uppercase tracking-widest text-[color:var(--text-muted)]">
          What we will not do
        </p>
        <h2 className="display text-2xl sm:text-4xl">
          Pokter doesn’t pretend to know{' '}
          <span className="swash">what it can’t know.</span>
        </h2>
      </div>

      <ul className="flex flex-col gap-1">
        {CREED.map((line, index) => (
          <li
            key={line.object}
            style={{ animationDelay: `${index * 110}ms` }}
            className="reveal flex items-baseline gap-2.5 text-lg sm:text-2xl"
          >
            <span
              aria-hidden
              className="text-[color:var(--text-faint)]"
              style={{ color: line.negative ? 'var(--negative)' : undefined }}
            >
              {line.negative ? '✕' : '✓'}
            </span>
            <span className="text-[color:var(--text-muted)]">{line.verb}</span>
            <span
              className="font-medium"
              style={{ color: line.negative ? 'var(--negative)' : 'var(--text)' }}
            >
              {line.object}
            </span>
          </li>
        ))}
      </ul>

      <p className="max-w-2xl text-sm leading-relaxed text-[color:var(--text-secondary)]">
        Nobody publishes whether an agent makes money, so no score here claims
        to. Two of the five scoring dimensions are permanently marked{' '}
        <span className="font-medium text-[color:var(--text)]">not measured</span>{' '}
        for that reason, and the coverage travels with every score we show.{' '}
        <Link href="/methodology" className="underline underline-offset-2">
          The methodology says so in full
        </Link>
        .
      </p>
    </section>
  );
}
