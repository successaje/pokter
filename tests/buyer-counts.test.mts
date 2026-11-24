import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buyerCounts, buyerNote } from '../src/lib/agent/buyers';
import { outsideBuyerJobs, summariseEconomicHistory } from '../src/lib/erc8183/economic-history';
import type { HiredJob } from '../src/lib/erc8183/types';

/*
 * A profile says who paid for an agent's work, and how far those buyers are
 * from independent: whether they came back, and whether they run agents on
 * Pokter themselves. Outside Pokter's declared wallets is not independent.
 */

const TEAM = '0x93847647d7eb72a69E162117df6a8697dF53EDda';
const SELLER = '0x00000000000000000000000000000000000000a1';
const A = '0x00000000000000000000000000000000000000B1';
const B = '0x00000000000000000000000000000000000000b2';
const C = '0x00000000000000000000000000000000000000b3';
const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

let next = 0;
function job(client: string | undefined, status: HiredJob['status'] = 'COMPLETED', provider: string = SELLER): HiredJob {
  next += 1;
  return {
    id: String(next), jobId: String(next), chainId: 97, isTestnet: true, agentChainId: 97, agentTokenId: '7', agentName: 'Agent',
    provider: provider as `0x${string}`, client: client as `0x${string}` | undefined, task: 't', budgetRaw: '1',
    expiredAt: '2026-10-14T00:00:00.000Z', hiredAt: '2026-10-10T00:00:00.000Z', hireTxHash: '0x01', status,
    statusCheckedAt: '2026-10-11T00:00:00.000Z', deliverableUrl: null, settleTxHash: null,
  };
}

test('outside buyers are the wallets behind the outside-team figures, by the same rules', () => {
  const demo = job(C);
  const jobs = [
    job(A), job(A.toLowerCase(), 'EXPIRED'), job(B, 'FUNDED'),
    job(TEAM), job(undefined), job(SELLER), job(C, 'OPEN'), demo,
  ];
  const isLifecycleDemo = (row: HiredJob) => row === demo;
  const perWallet = outsideBuyerJobs(jobs, { isLifecycleDemo });
  /* Pokter's wallet, an unknown funder, the seller itself, an unfunded job and a demonstration are not outside demand. */
  assert.deepEqual([...perWallet], [[A.toLowerCase(), 2], [B, 1]]);
  const history = summariseEconomicHistory(jobs, Date.parse('2026-10-12T00:00:00.000Z'), { isLifecycleDemo });
  assert.equal(perWallet.size, history.outsideTeam.uniqueBuyers);
  assert.equal([...perWallet.values()].reduce((sum, n) => sum + n, 0), history.outsideTeam.jobs);
});

test('the counts say who came back and who runs an agent here, and null where the listing was not read', () => {
  const perWallet = new Map([[A.toLowerCase(), 3], [B, 1], [C, 2]]);
  assert.deepEqual(buyerCounts(perWallet, { listedOwners: new Set([B]), owner: SELLER }), {
    wallets: 3, jobs: 6, returning: 2, ownAgent: 1, ownerAmong: false, agentId: null,
  });
  /* The agent's own owner buying it is counted as running an agent here, listed or not, and named. */
  assert.deepEqual(buyerCounts(perWallet, { listedOwners: new Set([B]), owner: A }), {
    wallets: 3, jobs: 6, returning: 2, ownAgent: 2, ownerAmong: true, agentId: null,
  });
  /* Not read is not none. */
  const unread = buyerCounts(perWallet, { listedOwners: null, owner: null });
  assert.equal(unread.ownAgent, null);
  assert.equal(unread.ownerAmong, null);
  assert.deepEqual(buyerCounts(new Map(), { listedOwners: new Set(), owner: SELLER }), { wallets: 0, jobs: 0, returning: 0, ownAgent: 0, ownerAmong: false, agentId: null });
});

test('the profile note says both facts, the weakening one in watch, and an unread listing as unread', () => {
  const text = (parts: ReturnType<typeof buyerNote>) => parts.map((part) => part.text).join(' · ');
  assert.equal(text(buyerNote({ wallets: 4, jobs: 6, returning: 2, ownAgent: 0, ownerAmong: false, agentId: null })), '2 came back · none owns a listed agent');
  assert.equal(text(buyerNote({ wallets: 1, jobs: 1, returning: 0, ownAgent: 0, ownerAmong: false, agentId: null })), 'Has not come back · owns no listed agent');
  const operators = buyerNote({ wallets: 5, jobs: 5, returning: 0, ownAgent: 3, ownerAmong: false, agentId: null });
  assert.equal(text(operators), 'None came back · 3 own a listed agent');
  assert.equal(operators[1].tone, 'watch');
  assert.match(operators[1].title ?? '', /not independent of the marketplace/);
  assert.equal(text(buyerNote({ wallets: 2, jobs: 2, returning: 0, ownAgent: 1, ownerAmong: false, agentId: null })), 'None came back · 1 owns a listed agent');
  assert.equal(text(buyerNote({ wallets: 2, jobs: 3, returning: 1, ownAgent: 1, ownerAmong: true, agentId: null })), '1 came back · 1 is this agent’s owner');
  assert.equal(text(buyerNote({ wallets: 3, jobs: 3, returning: 0, ownAgent: 2, ownerAmong: true, agentId: null })), 'None came back · 2 own a listed agent, one of them this agent’s owner');
  const unread = buyerNote({ wallets: 2, jobs: 2, returning: 0, ownAgent: null, ownerAmong: null, agentId: null });
  assert.equal(text(unread), 'None came back · agent owners not read');
  assert.equal(unread[1].tone, 'neutral');
  assert.deepEqual(buyerNote({ wallets: 0, jobs: 0, returning: 0, ownAgent: 0, ownerAmong: false, agentId: null }), []);
});

test('buyers holding an Agent ID are counted as distinct people, and an unread registry as unread', () => {
  const perWallet = new Map([['0xAa00000000000000000000000000000000000001', 2], ['0xbb00000000000000000000000000000000000002', 1], ['0xcc00000000000000000000000000000000000003', 1]]);
  const holders = new Set(['0xaa00000000000000000000000000000000000001', '0xcc00000000000000000000000000000000000003']);
  assert.equal(buyerCounts(perWallet, { listedOwners: new Set(), owner: null, agentIdHolders: holders }).agentId, 2, 'matched however the wallet is cased');
  assert.equal(buyerCounts(perWallet, { listedOwners: new Set(), owner: null, agentIdHolders: new Set() }).agentId, 0);
  assert.equal(buyerCounts(perWallet, { listedOwners: new Set(), owner: null, agentIdHolders: null }).agentId, null);
  assert.equal(buyerCounts(perWallet, { listedOwners: new Set(), owner: null }).agentId, null);

  const text = (parts: ReturnType<typeof buyerNote>) => parts.map((part) => part.text).join(' · ');
  const verified = buyerNote({ wallets: 3, jobs: 4, returning: 1, ownAgent: 0, ownerAmong: false, agentId: 2 });
  assert.equal(text(verified), '1 came back · none owns a listed agent · 2 hold an Agent ID');
  assert.equal(verified[2].tone, 'neutral');
  assert.match(verified[2].title ?? '', /each wallet holding one is a different person/);
  assert.equal(text(buyerNote({ wallets: 1, jobs: 1, returning: 0, ownAgent: 0, ownerAmong: false, agentId: 1 })), 'Has not come back · owns no listed agent · holds an Agent ID');
  assert.equal(text(buyerNote({ wallets: 4, jobs: 4, returning: 0, ownAgent: 0, ownerAmong: false, agentId: 1 })), 'None came back · none owns a listed agent · 1 holds an Agent ID');
  /* Most buyers hold none yet: absence is unverified, not suspect, so it is not said. */
  assert.equal(text(buyerNote({ wallets: 4, jobs: 4, returning: 0, ownAgent: 0, ownerAmong: false, agentId: 0 })), 'None came back · none owns a listed agent');
  assert.equal(text(buyerNote({ wallets: 4, jobs: 4, returning: 0, ownAgent: 0, ownerAmong: false, agentId: null })), 'None came back · none owns a listed agent');
});

test('the dossier, profile and API carry the counts, from the leaderboard’s owner set', () => {
  const marketplace = code('lib/marketplace.ts');
  assert.match(marketplace, /buyers: buyerCounts\(paidWork\.outsideBuyers, \{ listedOwners, owner: currentOwner \?\? agent\.owner_address \?\? null, agentIdHolders \}\),/);
  assert.match(marketplace, /const \[feedbackPage, live, paidWork, listedOwners\] = await Promise\.all\(\[/);
  /* Both registry chains, lower-cased, as the leaderboard builds `listedOwners`. */
  assert.match(marketplace, /listSearchableWithStatus\(\{ limit: 400 \}\);\s*\/\*[^*]*\*\/\s*if \(unreachable\) throw/);
  assert.match(code('lib/leaderboard/server.ts'), /listSearchableWithStatus\(\{ limit: 400 \}\)/);

  const page = code('app/(site)/agents/[chainId]/[tokenId]/page.tsx');
  assert.match(page, /label="Outside buyers"\s*value=\{p\.buyers\.wallets\}/);
  assert.match(page, /buyerNote\(p\.buyers\)/);
  assert.match(page, /<div className="grid grid-cols-2 gap-4 sm:grid-cols-3">/, 'six figures in rows of three');
  assert.doesNotMatch(page, /lg:grid-cols-5/);

  const route = code('app/api/v1/agents/[chainId]/[tokenId]/route.ts');
  assert.match(route, /buyers: \{\s*outside: dossier\.buyers\.wallets,\s*jobs: dossier\.buyers\.jobs,\s*returning: dossier\.buyers\.returning,\s*ownListedAgent: dossier\.buyers\.ownAgent,\s*includesOwner: dossier\.buyers\.ownerAmong,/);
});

test('the API change is recorded as an addition, and dated once it shipped', async () => {
  /*
   * This asserted `release === null` while the change was waiting for a
   * deploy, so that nothing could be dated on a guess — the release number is
   * assigned by the deploy, and a guessed one is wrong the moment anything
   * else ships first. It went live in v665 on 11 November 2026, confirmed by
   * reading `buyers` back from the production endpoint rather than by trusting
   * a release timestamp. The guard now holds the other half: an entry that has
   * been dated keeps both halves and never silently loses them.
   */
  const { API_CHANGES } = await import('../src/lib/api/changes');
  const entry = API_CHANGES.find((change) => change.details.join(' ').includes('`ownListedAgent`'));
  assert.ok(entry);
  assert.equal(entry.kind, 'added');
  assert.equal(entry.date, '2026-11-11');
  assert.equal(entry.release, 'v665');
  assert.deepEqual(entry.surfaces, ['GET /api/v1/agents/{chainId}/{tokenId}', 'MCP get_agent']);
});
