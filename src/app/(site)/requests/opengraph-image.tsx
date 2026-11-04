import { ImageResponse } from 'next/og';

import { Card, contentType, size } from '@/lib/og/card';

export const alt = 'Pokter Requests: buyers post work, builders propose, hiring is a separate wallet step';
export { contentType, size };

export default function RequestsCard() {
  return new ImageResponse(
    <Card
      context="Requests · pokter.xyz"
      title="The work comes first."
      lede="Post what you need. Builders can propose an agent and a signed price. You choose whether to hire."
      signalRule
      facts={[
        { label: '01 · POST', value: 'The task', note: 'before choosing an agent' },
        { label: '02 · PROPOSE', value: 'An offer', note: 'agent, price and timing' },
        { label: '03 · HIRE', value: 'Your call', note: 'wallet approval is separate' },
      ]}
    />,
    size,
  );
}
