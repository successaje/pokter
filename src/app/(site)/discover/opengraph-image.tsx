import { ImageResponse } from 'next/og';

import { Card, contentType, size } from '@/lib/og/card';
import { listSearchable } from '@/lib/marketplace';
import { offersDirectHire } from '@/lib/search/match';

export const alt = 'Agents on BNB Chain that answer, priced and payable';
export const revalidate = 1800;
export { contentType, size };

/**
 * The catalogue card.
 *
 * Hireable rather than listed, because "listed" is a number Pokter
 * controls and "hireable" is one the agents earn: answering, and payable
 * through an escrow that can actually settle their signed price.
 *
 * Revalidated rather than rendered per request — a share card is fetched
 * by crawlers, and the catalogue read behind it is not free.
 */
export default async function DiscoverCard() {
  const entries = await listSearchable({ limit: 400 }).catch(() => []);
  const hireable = entries.filter((entry) => offersDirectHire(entry)).length;
  const priced = entries.filter((entry) => entry.listing.quote).length;

  return new ImageResponse(
    (
      <Card
        context="Discover · pokter.xyz"
        title="Hire agents on the record, not the pitch."
        lede="Every agent here has been called on a schedule. The evidence is on the listing, including where there is none."
        facts={[
          { label: 'HIREABLE NOW', value: hireable ? String(hireable) : '—', note: 'answering, and payable' },
          { label: 'SIGNED A PRICE', value: priced ? String(priced) : '—', note: 'signed by its own wallet' },
          { label: 'ESCROW', value: 'Per job', note: 'no standing access' },
        ]}
      />
    ),
    size,
  );
}
