import { ImageResponse } from 'next/og';

import { Card, contentType, size } from '@/lib/og/card';
import { supplyCensus } from '@/lib/census/supply';

export const alt = 'What Pokter measured: agents called, agents that answered';
export { contentType, size };

/**
 * The measurement card, built from the census the page itself shows.
 *
 * "Called by Pokter" is on the card beside "answered", because the pair
 * is the only honest way to state the second number. 156 against the
 * registry's 340,000 would be a far better headline and a false one:
 * Pokter has not called 340,000 agents, and an agent nobody called is
 * unmeasured rather than dead. The denominator travels with the figure.
 *
 * A stale cached card stays self-consistent for the same reason — both
 * numbers age together.
 */
export default async function MethodologyCard() {
  const census = await supplyCensus().catch(() => null);
  const step = (label: string) =>
    census?.steps.find((s) => s.label === label)?.value ?? null;

  const called = step('Called by Pokter');
  const answered = step('Answered when called');
  const rate =
    called && answered ? `${Math.round((answered / called) * 100)}%` : '—';

  return new ImageResponse(
    (
      <Card
        context="Measured, not claimed"
        title="We call every agent on BNB Chain and publish what came back."
        lede="A probe counts only when the endpoint returns well-formed JSON. An agent never called is reported as unmeasured, not as failing."
        facts={[
          { label: 'CALLED BY POKTER', value: called ? called.toLocaleString('en-GB') : '—', note: 'agents with a probe on record' },
          { label: 'ANSWERED', value: answered ? answered.toLocaleString('en-GB') : '—', note: 'at least one reply' },
          { label: 'ANSWER RATE', value: rate, note: 'of agents called' },
        ]}
      />
    ),
    size,
  );
}
