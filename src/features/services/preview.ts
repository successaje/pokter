import type { Service } from '@/lib/services/model';

/** Local UI fixtures only. Never write these offers to the service store. */
export const sampleServices: Service[] = [
  {
    id: 'health-factor-review',
    builder: '0x00000000000000000000000000000000000000bB',
    chainId: 97,
    tokenId: '0',
    title: 'Health factor review',
    description: 'Review a lending position on BNB Chain, explain its liquidation risk, and outline practical steps to improve the health factor.',
    buyerProvides: 'A public wallet address and the lending market to review.',
    delivers: 'A position summary, risk drivers, and a prioritized action plan.',
    category: 'health-factor',
    status: 'active',
    revision: 1,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-03T10:00:00.000Z',
  },
  {
    id: 'grid-strategy-review',
    builder: '0x00000000000000000000000000000000000000bB',
    chainId: 97,
    tokenId: '1',
    title: 'Grid strategy review',
    description: 'Assess a proposed grid trading range, identify key assumptions, and produce a risk-aware setup checklist before execution.',
    buyerProvides: 'The trading pair, intended range, budget, and risk limits.',
    delivers: 'A grid setup plan, scenario notes, and risks to watch.',
    category: 'grid-trading',
    status: 'active',
    revision: 1,
    createdAt: '2026-11-02T10:00:00.000Z',
    updatedAt: '2026-11-02T10:00:00.000Z',
  },
  {
    id: 'yield-position-check',
    builder: '0x00000000000000000000000000000000000000bB',
    chainId: 56,
    tokenId: '2',
    title: 'Yield position check',
    description: 'Compare a current yield position with its stated goal and flag concentration, liquidity, and protocol risks.',
    buyerProvides: 'Public position links and the outcome you want to optimize for.',
    delivers: 'A concise comparison and a prioritized list of trade-offs.',
    category: 'yield',
    status: 'active',
    revision: 1,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
  },
];

export const sampleAgent = { key: '97:0', name: 'Sample agent' };
