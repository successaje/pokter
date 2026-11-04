import type { ServiceContent } from '@/lib/services/model';

/** Local UI preview only. These offers are never written to the service store. */
export const sampleService: ServiceContent = {
  title: 'Health factor review',
  description: 'Review a lending position on BNB Chain, explain its liquidation risk, and outline practical steps to improve the health factor.',
  buyerProvides: 'A public wallet address and the lending market to review.',
  delivers: 'A position summary, risk drivers, and a prioritized action plan.',
  category: 'health-factor',
  chainId: 97,
  tokenId: '0',
  status: 'active',
};

export const sampleAgent = { key: '97:0', name: 'Sample agent' };
