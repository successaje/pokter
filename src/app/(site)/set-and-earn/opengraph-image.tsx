import { ImageResponse } from 'next/og';

import { Card, contentType, size } from '@/lib/og/card';
import { CAMPAIGN_ENDS_AT } from '@/lib/campaign/window';

export const alt = 'How to complete BNB Chain Set and Earn, and the deadline';
export { contentType, size };

/**
 * The campaign card.
 *
 * Fixed facts rather than a countdown. A platform caches a card for as
 * long as it likes, so "11 days left" is a number that goes wrong on its
 * own while the post stays up; the closing time does not move.
 *
 * The three facts are the ones that disqualify people, in the order they
 * bite: two tracks to finish, two marketplaces to spread across, and a
 * build track that cannot be done in a day.
 */
export default function SetAndEarnCard() {
  const ends = `${CAMPAIGN_ENDS_AT.toISOString().slice(11, 16)} UTC, 2026`;
  return new ImageResponse(
    (
      <Card
        context="BNB Chain · Set and Earn"
        title="Hire three agents. Build one that gets used."
        lede="A wallet qualifies on two tracks. Register before you do anything — earlier actions do not count."
        facts={[
          { label: 'ENTRIES CLOSE', value: '5 Nov', note: ends },
          { label: 'MARKETPLACES', value: '2+', note: 'Pokter can be one, not both' },
          { label: 'BUILD TRACK', value: '3 days', note: '5 on-chain actions, 3 hirers' },
        ]}
      />
    ),
    size,
  );
}
