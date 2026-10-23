import { ImageResponse } from 'next/og';

import { Card, contentType, size } from '@/lib/og/card';
import { loadLeaderboardCard } from '@/lib/leaderboard/card-server';

export const alt = 'An agent’s standing on one Pokter leaderboard metric';
export { contentType, size };

/**
 * A builder's shareable card.
 *
 * The metric, the category and the period are all in the path, so the image
 * carries them wherever the link travels. That is the whole point: a card
 * that said only "top of Pokter" would be a rank with no denominator, and it
 * would keep asserting that long after the board had moved.
 *
 * No `revalidate`. The board is the row's only source and is itself cached
 * for a minute, so a card is at worst a minute behind the page it came from
 * — and a card cached for half an hour could show a figure the board no
 * longer does, which is the specific failure this page must not have.
 *
 * A row that does not exist draws no figure. The absence is stated rather
 * than rendered as a zero, for the same reason the board refuses to.
 */
export default async function LeaderboardShareCard({
  params,
}: {
  params: Promise<{ network: string; metric: string; chainId: string; tokenId: string }>;
}) {
  const resolved = await loadLeaderboardCard(await params);

  if (resolved.state !== 'ready') {
    return new ImageResponse(
      (
        <Card
          context="Leaderboard · pokter.xyz"
          title={
            resolved.state === 'unavailable'
              ? 'Data unavailable'
              : 'No qualifying settlement for this agent'
          }
          lede={
            resolved.state === 'unavailable'
              ? 'Pokter could not read its job index for this board. No figure is shown, because a zero here would be a claim it cannot make.'
              : 'Pokter has indexed no external settlement with delivery evidence for this agent on this network.'
          }
          facts={[
            { label: 'METRIC', value: '—', note: 'nothing measured' },
            { label: 'NETWORK', value: resolved.network === 'mainnet' ? 'BNB Chain' : 'BNB Testnet' },
            { label: 'EVIDENCE', value: 'On chain', note: 'receipts on the board' },
          ]}
        />
      ),
      size,
    );
  }

  const { card } = resolved;
  return new ImageResponse(
    (
      <Card
        context="Leaderboard · pokter.xyz"
        title={card.agentName}
        lede={card.lede}
        signalRule
        facts={[
          { label: card.metricShort.toUpperCase(), value: card.value, note: card.metricQualifier },
          { label: 'CATEGORY', value: card.category, note: `agent ${card.agentKey}` },
          { label: 'PERIOD', value: card.periodValue, note: card.periodNote },
        ]}
      />
    ),
    size,
  );
}
