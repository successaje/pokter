import assert from 'node:assert/strict';
import test from 'node:test';

import { campaignEvidence } from '../src/lib/campaign/evidence';
import type { CampaignProgressReport } from '../src/lib/campaign/progress-server';

const wallet = '0x1111111111111111111111111111111111111111';
const contract = '0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE';

function report(): CampaignProgressReport {
  return {
    address: wallet,
    observedAt: '2026-11-02T12:00:00.000Z',
    commerceContracts: { 56: '0xEa4DAa3100A767e86FDed867729ae7446476EBA6', 97: contract },
    identityRegistries: { 56: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432', 97: '0x8004A818BFB912233c491871b3d84c89A494BD9e' },
    coverage: [{ chainId: 56, throughJob: 100, updatedAt: '2026-11-02T11:00:00.000Z' }, { chainId: 97, throughJob: 200, updatedAt: '2026-11-01T23:00:00.000Z' }],
    hires: {
      distinctAgents: 1, total: 1, marketplaces: ['Pokter'], marketplacesStatus: 'not-met', unattributed: 0, recent: [],
      records: [{ chainId: 97, commerceContract: contract, jobId: '199', status: 'COMPLETED', provider: wallet, marketplace: 'Pokter', agent: { chainId: 56, tokenId: '7', name: 'Example' }, hireTxHash: null, settleTxHash: null }],
    },
    build: [{ chainId: 56, tokenId: '7', name: 'Example', inWindow: true, registeredAt: '2026-10-22T10:00:00.000Z' }],
    adoption: { chainId: 56, tokenId: '7', name: 'Example', independentWallets: 0, actions: 1, activeDays: 1, actionsBlockedReason: null, unreadJobs: 1, completedHires: [{ chainId: 97, jobId: '198', client: wallet, hireTxHash: null, settleTxHash: null }], ownActions: [{ chainId: 97, jobId: '198', submittedAt: '2026-10-23T10:00:00.000Z' }] },
  };
}

test('the export exposes sources and gaps without claiming campaign qualification', () => {
  const evidence = campaignEvidence(report());
  assert.equal(evidence.indexStatus, 'stale');
  assert.equal(evidence.registration.verifiedByPokter, false);
  assert.equal(evidence.hires.jobs[0].hireTransactionUrl, null);
  assert.equal(evidence.hires.jobs[0].contractReadUrl, `https://testnet.bscscan.com/address/${contract}#readContract`);
  assert.equal(evidence.registeredAgents?.[0].registryReadUrl, 'https://bscscan.com/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432#readContract');
  assert.equal(evidence.adoption?.outsideOwnerWallets, 0);
  assert.equal(evidence.adoption?.unreadJobs, 1);
  assert.equal(evidence.adoption?.submissions[0].reference?.jobId, '198');
  assert.ok(evidence.limits.some((limit) => limit.includes('cannot verify that their funds are independent')));
});
