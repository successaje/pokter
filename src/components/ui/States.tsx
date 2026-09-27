import Link from 'next/link';

import { cn } from '@/lib/ui/cn';

/**
 * The vocabulary of "there is nothing to show".
 *
 * These are kept as distinct exports rather than one component with a message
 * prop because they are distinct *claims*, and the product's whole argument is
 * that they must not be collapsed:
 *
 *   - no results      — we asked, the answer was empty
 *   - no evidence     — we have not observed enough yet
 *   - endpoint offline— the agent did not answer us
 *   - unreachable     — we failed to ask
 *
 * "We have no evidence" is not "it performed badly", and "we could not ask" is
 * not "the answer was no". A single generic empty state would quietly merge
 * them, which is the failure mode this codebase exists to avoid.
 */
type Tone = 'neutral' | 'caution';

const TONES: Record<Tone, { container: string; heading: string }> = {
  neutral: {
    container: 'border-[color:var(--border)] bg-[color:var(--surface)]',
    heading: 'text-[color:var(--text)]',
  },
  caution: {
    container: 'border-[color:var(--caution)]/35 bg-[color:var(--caution-dim)]',
    heading: 'text-[color:var(--caution)]',
  },
};

export function StatusState({
  title,
  body,
  tone = 'neutral',
  action,
  className,
}: {
  title: string;
  body: string;
  tone?: Tone;
  action?: { href: string; label: string };
  className?: string;
}) {
  const styles = TONES[tone];

  return (
    <section
      className={cn(
        'rounded-[var(--radius-lg)] border p-5',
        styles.container,
        className,
      )}
    >
      <h2 className={cn('text-[15px] font-semibold', styles.heading)}>{title}</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
        {body}
      </p>
      {action && (
        <Link
          href={action.href}
          className="mt-4 inline-flex min-h-11 items-center rounded-[var(--radius)] bg-[color:var(--brand)] px-4 text-[13px] font-semibold text-[color:var(--brand-ink)] transition-colors hover:bg-[color:var(--brand-hover)]"
        >
          {action.label}
        </Link>
      )}
    </section>
  );
}

/** A search or filter returned nothing. The query is echoed back. */
export function NoResults({ query }: { query?: string }) {
  return (
    <StatusState
      title={query ? `No agent matched “${query}”` : 'No agents matched'}
      body="Try a broader term, or browse by category — the registry may simply not list one for this yet."
      action={{ href: '/agents', label: 'Browse all agents' }}
    />
  );
}

/** Pokter has not observed enough to judge. Not a bad score. */
export function NoEvidence({ agentName }: { agentName?: string }) {
  return (
    <StatusState
      title="Not enough evidence yet"
      body={`Pokter has not observed ${
        agentName ?? 'this agent'
      } often enough to evaluate it. That is an absence of evidence, not a poor result — the verdict will change as probes accumulate.`}
    />
  );
}

/** The agent's own endpoint failed to answer a probe. */
export function EndpointOffline() {
  return (
    <StatusState
      tone="caution"
      title="The agent did not answer"
      body="Its endpoint did not respond to our last check. It may be temporarily down; a failed probe is recorded as evidence either way."
    />
  );
}

/** The device has no usable connection. */
export function NetworkUnavailable() {
  return (
    <StatusState
      tone="caution"
      title="You appear to be offline"
      body="Pokter needs a connection to read live protocol data. Anything shown from here on could be out of date, so actions that move money stay disabled."
    />
  );
}

/** The user has not hired anything yet. */
export function NoActivity() {
  return (
    <StatusState
      title="You haven’t hired an agent yet"
      body="Once you commission work, the job, its deliverable and its settlement all appear here."
      action={{ href: '/agents', label: 'Discover agents' }}
    />
  );
}

/** Nothing selected for side-by-side comparison. */
export function NoComparison() {
  return (
    <StatusState
      title="Nothing to compare yet"
      body="Add agents while browsing and their evidence lines up side by side here."
      action={{ href: '/agents', label: 'Browse agents' }}
    />
  );
}
