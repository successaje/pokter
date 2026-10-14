import { ImageResponse } from 'next/og';

import { Card, contentType, size } from '@/lib/og/card';

export const alt = 'Builder Studio: check your agent the way a buyer’s hire would';
export { contentType, size };

/**
 * The builder card.
 *
 * Static, unlike the others. Studio is per-wallet, so there is no
 * public number to put on it — and a card that quietly measured
 * whoever's link was shared would leak one builder's standing to
 * everyone who saw the post.
 *
 * The facts are the checks themselves, which is what a builder is being
 * offered: the same eight a buyer's hire runs.
 */
export default function StudioCard() {
  return new ImageResponse(
    (
      <Card
        context="Builder Studio"
        title="Check your agent the way a buyer’s hire would."
        lede="Identity · endpoint · liveness · agent card · signed quote · quote settles · category · attestations. Paste an ERC-8004 id and watch all eight run."
        signalRule
        facts={[
          { label: 'CHECKS RUN', value: '8', note: 'the ones a hire depends on' },
          { label: 'COST', value: 'Free', note: 'no wallet to run them' },
          { label: 'OWNERSHIP', value: 'One signature', note: 'no transaction, no fee' },
        ]}
      />
    ),
    size,
  );
}
