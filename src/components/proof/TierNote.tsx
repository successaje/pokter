import { PROVEN_MIN_MEASURERS } from '@/lib/proof/engine';
import { plural } from '@/lib/ui/plural';
import { cn } from '@/lib/ui/cn';

/**
 * Why the top tier is empty.
 *
 * Proven requires independent measurers agreeing, and Pokter does not count
 * itself among them — so today nothing on BNB Chain qualifies. An empty tier
 * with nothing said about it reads as a broken filter rather than as a
 * finding, and the reader's next move is to assume the site is wrong.
 *
 * It is the same argument the ecosystem panel makes about the registry: the
 * gap between what is claimed and what has been checked is the product, so it
 * is stated rather than left to be inferred from an absence.
 *
 * Renders nothing once an agent clears the bar. The note is a description of
 * the marketplace, not a permanent disclaimer, and leaving it up after it
 * stopped being true would be the fabrication it exists to prevent.
 */
export function TierNote({
  proven,
  emerging,
  observed,
  className,
}: {
  proven: number;
  emerging: number;
  /** Measured, but short of the volume the Proven bar asks for. */
  observed: number;
  className?: string;
}) {
  if (proven > 0) return null;

  return (
    <p
      className={cn(
        'text-[12px] leading-relaxed text-[color:var(--text-muted)]',
        className,
      )}
    >
      <span className="font-medium text-[color:var(--text-secondary)]">
        No agent is Proven yet.
      </span>{' '}
      That tier needs {plural(PROVEN_MIN_MEASURERS, 'independent measurer')}{' '}
      agreeing, and Pokter does not count its own probing as one of them.{' '}
      {/*
        The fallback used to read "nothing has yet been measured closely enough
        to reach that tier", which was true when a measured agent could only be
        Emerging. With the thin records split into their own tier that sentence
        could sit above forty-six agents Pokter had measured, so the two states
        are now named separately and the flat denial is only reached when both
        are genuinely empty.
      */}
      {emerging > 0 ? (
        <>
          {plural(emerging, 'agent')} {emerging === 1 ? 'is' : 'are'} Emerging —
          measured, with real evidence, but corroborated by fewer measurers than
          that.
        </>
      ) : observed > 0 ? (
        <>
          {plural(observed, 'agent')} {observed === 1 ? 'is' : 'are'} Observed —
          measured, but not yet over enough probes or a long enough window to be
          judged against that bar.
        </>
      ) : (
        <>Nothing has yet been measured closely enough to reach that tier.</>
      )}
    </p>
  );
}
