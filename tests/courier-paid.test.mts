import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { courierPaidTest } from '../src/lib/erc8183/courier-paid';
import { summariseEconomicHistory } from '../src/lib/erc8183/economic-history';
import type { HiredJob } from '../src/lib/erc8183/types';

/*
 * A job paid to a Pokter wallet is the courier's only when that wallet is
 * not the agent's own registered wallet. Pokter's own agents are registered
 * to a Pokter wallet, and their jobs are their paid work.
 */

const POKTER = '0x93847647d7eb72a69E162117df6a8697dF53EDda' as const;
const OUTSIDE = '0x00000000000000000000000000000000000000b2' as const;
const team = new Set([POKTER.toLowerCase()]);
const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

function job(id: string, agentTokenId: string, provider: `0x${string}`): HiredJob {
  return {
    id, jobId: id, chainId: 97, isTestnet: true, agentChainId: 97, agentTokenId, agentName: `Agent ${agentTokenId}`, provider,
    client: OUTSIDE, task: 't', budgetRaw: '1', expiredAt: '2026-10-14T00:00:00.000Z', hiredAt: '2026-10-10T00:00:00.000Z',
    hireTxHash: null, status: 'COMPLETED', statusCheckedAt: '2026-10-11T00:00:00.000Z', deliverableUrl: null, settleTxHash: null,
  };
}

test('a Pokter agent paid to its own registered wallet is not a courier job; an agent the courier stood in for is', async () => {
  const reads: string[] = [];
  const wallets: Record<string, { answered: boolean; wallet: string | null }> = {
    '2599': { answered: true, wallet: POKTER },
    '2238': { answered: true, wallet: '0x00000000000000000000000000000000000000c3' },
    '2237': { answered: true, wallet: null },
    '1838': { answered: false, wallet: null },
  };
  const jobs = [job('1', '2599', POKTER), job('2', '2599', POKTER), job('3', '2238', POKTER), job('4', '2237', POKTER), job('5', '1838', POKTER), job('6', '7', OUTSIDE)];
  const paidToCourier = await courierPaidTest(jobs, team, async (chainId, tokenId) => {
    reads.push(`${chainId}:${tokenId}`);
    return wallets[tokenId];
  });
  assert.deepEqual(jobs.map(paidToCourier), [false, false, true, true, true, false]);
  assert.deepEqual(reads.sort(), ['97:1838', '97:2237', '97:2238', '97:2599'], 'one read per agent with a Pokter-paid job, none for the others');
});

test('a registry that does not answer in time leaves the job the courier’s', async () => {
  const paidToCourier = await courierPaidTest([job('1', '2599', POKTER)], team, () => Promise.reject(new Error('rate limited')));
  assert.equal(paidToCourier(job('1', '2599', POKTER)), true);
});

test('the proof page, Discover and the home page all count couriers by this rule', () => {
  assert.match(code('app/(site)/proof/page.tsx'), /const courier = await courierPaidTest\(visible\.map\(\(row\) => row\.job\), team, registeredWalletRead\);/);
  assert.match(code('lib/erc8183/outside-activity.ts'), /const paidToCourier = await courierPaidTest\(answeredAtAll, team, registeredWalletRead\);/);
  assert.match(code('features/home/data.ts'), /const paidToCourier = await courierPaidTest\(carried, team, registeredWalletRead\);/);
  assert.match(code('app/(site)/discover/page.tsx'), /const activity = await outsideActivity\(\);/);
  for (const path of ['app/(site)/proof/page.tsx', 'lib/erc8183/outside-activity.ts', 'features/home/data.ts']) {
    assert.doesNotMatch(code(path), /team\.has\(job\.provider\.toLowerCase\(\)\)/, `${path} no longer counts every Pokter-paid job as the courier's`);
  }
});

test('a mainnet agent’s paid work leaves out the testnet trial its escrow paid to the courier', async () => {
  /*
   * A mainnet agent with two mainnet jobs paid to its own registered
   * wallet, and a free testnet trial the courier carried for it and was
   * paid for. Its profile said three paid jobs; its hire page, counting one
   * chain, said two.
   */
  const OWN = '0x00000000000000000000000000000000000000d4' as const;
  const mainnet = (id: string): HiredJob => ({ ...job(id, '5001', OWN), chainId: 56, isTestnet: false, agentChainId: 56 });
  const trial: HiredJob = { ...job('3', '5001', POKTER), agentChainId: 56 };
  const jobs = [mainnet('1'), mainnet('2'), trial];
  const reads: string[] = [];
  const courierPaid = await courierPaidTest(jobs, team, async (chainId, tokenId) => {
    reads.push(`${chainId}:${tokenId}`);
    return { answered: true, wallet: OWN };
  });
  assert.deepEqual(reads, ['56:5001'], 'the agent’s own registry, not the escrow chain’s');
  assert.deepEqual(jobs.map(courierPaid), [false, false, true]);
  const paid = summariseEconomicHistory(jobs.filter((j) => !courierPaid(j)));
  assert.equal(paid.jobs, 2);
  assert.equal(paid.delivered, 2);
  assert.equal(paid.completed, 2);
});

test('the profile, its score, Compare and delivery times read paid work by this rule', () => {
  const credited = code('lib/agent/credited-history.ts');
  assert.match(credited, /const courierPaid = await courierPaidTest\(jobs, teamAddressSet\(\), registeredWalletRead\);\s*const paid = jobs\.filter\(\(job\) => !courierPaid\(job\)\);\s*return \{\s*history: agentHistory\(paid, now\),/);
  /* Its buyers are counted over the same jobs as its paid work. */
  assert.match(credited, /outsideBuyers: outsideBuyerJobs\(paid, \{ isLifecycleDemo \}\),/);
  const marketplace = code('lib/marketplace.ts');
  assert.match(marketplace, /score: computeScore\(\{ agent, category, proof, attestations, record, live, history: paidWork\.history \}\),/);
  assert.match(marketplace, /const \{ history: economicHistory \} = await agentPaidWork\(getJobStore\(\)\.byAgent\(chainId, tokenId\)\);/);
  assert.match(code('lib/agent/delivery-times.ts'), /\.filter\(\(job\) => job\.status !== 'OPEN' && !courierPaid\(job\)\)/);
  const profile = code('app/(site)/agents/[chainId]/[tokenId]/page.tsx');
  assert.match(profile, /label: 'Paid jobs',\s*value: String\(p\.paidWork\.jobs\),/);
  assert.match(profile, /label="Jobs funded"\s*value=\{p\.paidWork\.jobs\}/);
  assert.match(profile, /\$\{p\.paidWork\.delivered\} of \$\{p\.paidWork\.jobs - p\.paidWork\.pending - p\.paidWork\.refused\}/);
  assert.match(profile, /through Pokter’s courier, not counted/, 'left out, and said');
  /* The full history only counts the rows listed, which include the courier's. */
  assert.equal(profile.match(/p\.history\.jobs\b/g)?.length, 2);
  assert.match(profile, /\{p\.jobHistory\.length === p\.history\.jobs \? 'All of them' : `Newest \$\{p\.jobHistory\.length\} of \$\{p\.history\.jobs\}`\}/);
  assert.doesNotMatch(profile, /p\.history\.(delivered|completed|pending)\b/, 'no paid-work figure reads the full history');
});
