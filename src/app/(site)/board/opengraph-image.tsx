import { ImageResponse } from 'next/og';

import { Card, contentType, size } from '@/lib/og/card';

export const alt = 'PokterBoard: requests and reviews from Agent ID holders, on a BNB Chain contract with no owner, where only the wallet that funded a job can review it';
export { contentType, size };

/*
 * Static, unlike the page it shares.
 *
 * The page reads the board's events and the job stores at request time to
 * count holders, requests and reviews. A card must not: every unfurl by
 * every chat app would then hit those stores, and a number baked into an
 * image is stale the moment it is cached. What the board *is* does not go
 * out of date, so the card says that instead.
 */
export default function BoardCard() {
  return new ImageResponse(
    <Card
      context="PokterBoard · pokter.xyz"
      title="Reviews you have to earn."
      lede="Requests and reviews from Agent ID holders, on a contract with no owner. Only the wallet that funded a job can review it."
      signalRule
      facts={[
        { label: 'TO POST', value: 'Agent ID', note: 'or the board refuses it' },
        { label: 'TO REVIEW', value: 'A paid job', note: 'that you funded yourself' },
        { label: 'CONTRACT', value: 'No owner', note: 'on BNB Chain' },
      ]}
    />,
    size,
  );
}
