import { NextResponse } from 'next/server';

import { ALTANA_NETWORK } from '@/lib/altana/client';
import { demoSellerAddress } from '@/lib/erc8183/demo-seller';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  return NextResponse.json({
    name: 'Pokter Delivery Agent',
    description:
      'A testnet seller that proves the ERC-8183 funded-job, delivery and settlement lifecycle.',
    url: new URL('/api/seller/a2a', url).href,
    version: '1.0.0',
    protocolVersion: '0.3.0',
    capabilities: { streaming: false, pushNotifications: false },
    provider: { organization: 'Pokter', url: url.origin },
    skills: [
      {
        id: 'notify_funded',
        name: 'Submit funded job deliverable',
        description:
          'Verifies a funded ERC-8183 job assigned to this seller and submits a canonical execution receipt.',
        tags: ['erc-8183', 'escrow', 'bnb-chain'],
      },
    ],
    metadata: {
      chain_id: ALTANA_NETWORK.chainId,
      seller_wallet: await demoSellerAddress(),
      testnet: ALTANA_NETWORK.chainId === 97,
    },
  });
}
