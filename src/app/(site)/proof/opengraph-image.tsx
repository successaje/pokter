import { ImageResponse } from 'next/og';

import { Card, contentType, size } from '@/lib/og/card';

export const alt = 'Pokter Proof: funded jobs, deliveries and on-chain receipts by network and funder';
export { contentType, size };

export default function ProofCard() {
  return new ImageResponse(
    <Card
      context="Proof · pokter.xyz"
      title="Show the receipts."
      lede="Follow each hire from funding to delivery, with its network, funder and on-chain record in view."
      signalRule
      facts={[
        { label: 'FUNDED', value: 'On chain', note: 'one job per hire' },
        { label: 'DELIVERED', value: 'Checked', note: 'against its submitted hash' },
        { label: 'FUNDING', value: 'Labelled', note: 'team or outside buyer' },
      ]}
    />,
    size,
  );
}
