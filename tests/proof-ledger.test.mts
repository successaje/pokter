import assert from 'node:assert/strict';
import test from 'node:test';
import { filterLedger, ledgerRows, summarizeLedger, type LedgerFilters } from '../src/lib/proof/ledger';
import type { HiredJob } from '../src/lib/erc8183/types';

const team = '0x0000000000000000000000000000000000000001';
const outside = '0x0000000000000000000000000000000000000002';
const provider = '0x0000000000000000000000000000000000000003';
function job(chainId: number, jobId: string, status: HiredJob['status'], client: string | undefined, budgetRaw = '100', agentName = 'Risk Desk'): HiredJob {
  return {
    id: `${chainId}:${jobId}`, chainId, jobId, isTestnet: chainId === 97,
    agentChainId: chainId, agentTokenId: '7', agentName,
    provider: provider as HiredJob['provider'], client: client as HiredJob['client'], task: 'Public task',
    budgetRaw, expiredAt: '2026-11-09T00:00:00Z', hiredAt: '2026-11-03T00:00:00Z',
    hireTxHash: null, status, statusCheckedAt: '2026-11-05T00:00:00Z',
    deliverableUrl: null, settleTxHash: null,
  };
}
const all: LedgerFilters = { network: 'all', funder: 'all', status: 'all', metric: null, q: '', agent: null };

test('every summary number opens exactly its qualifying rows, except distinct-wallet count', () => {
  const jobs = [
    job(56, '1', 'COMPLETED', outside),
    job(97, '1', 'COMPLETED', outside),
    job(97, '2', 'COMPLETED', team),
    job(97, '3', 'EXPIRED', provider),
    job(97, '4', 'COMPLETED', outside),
    job(97, '5', 'OPEN', outside),
    job(97, '6', 'REJECTED', outside),
  ];
  const rows = ledgerRows(jobs, new Set([team]), (j) => j.jobId === '4');
  const summary = summarizeLedger(rows);
  assert.equal(summary.jobs, 7);
  assert.equal(summary.funded, 5);
  assert.equal(summary.submitted, 3);
  assert.equal(summary.settled, 4);
  assert.equal(summary.outsideWallets, 1);
  assert.equal(summary.outsideJobs, 2);
  assert.equal(filterLedger(rows, { ...all, metric: 'funded' }).length, summary.funded);
  assert.equal(filterLedger(rows, { ...all, metric: 'submitted' }).length, summary.submitted);
  assert.equal(filterLedger(rows, { ...all, metric: 'settled' }).length, summary.settled);
  assert.equal(filterLedger(rows, { ...all, metric: 'outside-wallets' }).length, summary.outsideJobs);
  assert.equal(filterLedger(rows, { ...all, metric: 'team' }).length, summary.team);
  assert.equal(filterLedger(rows, { ...all, metric: 'self' }).length, summary.self);
  assert.equal(filterLedger(rows, { ...all, metric: 'demo' }).length, summary.demos);
});

test('wallet search, job ID search and network filters use the same records', () => {
  const rows = ledgerRows([job(56, '42', 'FUNDED', outside), job(97, '42', 'FUNDED', team)], new Set([team]), () => false);
  assert.equal(filterLedger(rows, { ...all, network: 'mainnet', q: '42' }).length, 1);
  assert.equal(filterLedger(rows, { ...all, q: outside.toUpperCase() }).length, 1);
  assert.equal(filterLedger(rows, { ...all, funder: 'team' }).length, 1);
});
