import assert from 'node:assert/strict';
import test from 'node:test';

import { hireForProposal } from '../src/lib/briefs/hired';

const poster = '0xAbC0000000000000000000000000000000000001';
const want = { poster, chainId: 97, agentChainId: 97, agentTokenId: '2554', placedAt: '2026-10-20T10:00:00Z' };
const job = (over: Partial<Parameters<typeof hireForProposal>[0][number]> = {}) => ({
  jobId: '1600',
  chainId: 97,
  agentChainId: 97,
  agentTokenId: '2554',
  client: poster.toLowerCase(),
  hiredAt: '2026-10-21T09:00:00Z',
  status: 'FUNDED' as const,
  ...over,
});

test('a job by the poster, for the chosen agent, on the request network, after the proposal, is the hire', () => {
  assert.deepEqual(hireForProposal([job()], want), { jobId: '1600', chainId: 97, status: 'FUNDED', returned: false });
});

test('the poster address matches whatever its case', () => {
  assert.ok(hireForProposal([job({ client: poster.toUpperCase().replace('0X', '0x') })], want));
});

test('another buyer, agent, network, or a job from before the proposal is not the hire', () => {
  assert.equal(hireForProposal([job({ client: '0x0000000000000000000000000000000000000002' })], want), null);
  assert.equal(hireForProposal([job({ agentTokenId: '2555' })], want), null);
  assert.equal(hireForProposal([job({ chainId: 56 })], want), null);
  assert.equal(hireForProposal([job({ agentChainId: 56 })], want), null);
  assert.equal(hireForProposal([job({ hiredAt: '2026-10-19T09:00:00Z' })], want), null);
});

test('a job indexed without an agent chain is a mainnet agent, as the index reads it', () => {
  assert.ok(hireForProposal([job({ agentChainId: undefined })], { ...want, agentChainId: 56 }));
  assert.equal(hireForProposal([job({ agentChainId: undefined })], want), null);
});

test('the newest match wins, and a refunded one is reported so the card can offer the hire again', () => {
  const older = job({ jobId: '1600', hiredAt: '2026-10-20T12:00:00Z', status: 'EXPIRED' });
  const newer = job({ jobId: '1650', hiredAt: '2026-10-21T12:00:00Z', status: 'SUBMITTED' });
  assert.equal(hireForProposal([older, newer], want)?.jobId, '1650');
  assert.equal(hireForProposal([older], want)?.returned, true);
  assert.equal(hireForProposal([job({ status: 'REJECTED' })], want)?.returned, true);
  assert.equal(hireForProposal([job({ status: 'COMPLETED' })], want)?.returned, false);
});
