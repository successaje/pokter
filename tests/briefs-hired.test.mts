import assert from 'node:assert/strict';
import test from 'node:test';

import { hireForProposal } from '../src/lib/briefs/hired';

const poster = '0xAbC0000000000000000000000000000000000001';
/* Testnet $U, and a price of 1 $U: the job below is that money, for less. */
const TEST_U = '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565';
const want = { poster, chainId: 97, agentChainId: 97, agentTokenId: '2554', placedAt: '2026-10-20T10:00:00Z', paymentToken: TEST_U, priceRaw: '1000000000000000000' };
const job = (over: Partial<Parameters<typeof hireForProposal>[0][number]> = {}) => ({
  jobId: '1600',
  chainId: 97,
  agentChainId: 97,
  agentTokenId: '2554',
  client: poster.toLowerCase(),
  hiredAt: '2026-10-21T09:00:00Z',
  status: 'FUNDED' as const,
  paymentToken: TEST_U as string | null,
  budgetRaw: '1000000000000000000',
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

test('a request card and its page say the same status, in this order of precedence', async () => {
  const { requestStatus } = await import('../src/lib/briefs/model');
  const now = Date.parse('2026-10-21T12:00:00Z');
  const at = (state: 'open' | 'awarded' | 'cancelled', closesAt: string | null = null, hired = false) => requestStatus({ state, closesAt, hired }, now);
  assert.deepEqual(at('open'), { label: 'Taking proposals', tone: 'open' });
  assert.deepEqual(at('open', '2026-10-28T00:00:00Z'), { label: 'Taking proposals', tone: 'open' });
  assert.deepEqual(at('open', '2026-10-15T00:00:00Z'), { label: 'Proposals closed', tone: 'ended' });
  assert.deepEqual(at('awarded'), { label: 'Agent chosen', tone: 'chosen' });
  assert.deepEqual(at('awarded', null, true), { label: 'Agent hired', tone: 'chosen' });
  assert.deepEqual(at('cancelled', null, true), { label: 'Withdrawn', tone: 'ended' });
});
