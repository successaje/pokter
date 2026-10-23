import assert from 'node:assert/strict';
import test from 'node:test';

import {
  agentKey,
  confirmOwnedAgents,
  notOwnedNote,
  ownershipUnavailableNote,
  type OwnerConfirmation,
} from '../src/lib/builders/provider-ownership';

/*
 * The defect this module exists to prevent, as it shipped:
 *
 * The four provider read tools — `provider_status`, `find_requests`,
 * `list_work`, `report_earnings` — never confirmed ownership at all.
 * `confirmAgentOwner` was reached only from `prepare_proposal` and
 * `prepare_deliverable`. The reads took `providerFleet`, which is the union
 * of the 8004scan catalogue and the verified-publishers table, and
 * `jobsForAgents` matched jobs on `agentChainId:agentTokenId` with no owner
 * filter at all. The signature table had no TTL, so a row answered forever.
 *
 * So: wallet A verifies agent 97:42, mints a ninety-day token with
 * jobs:read and earnings:read, transfers the agent to wallet B, and buyers
 * fund jobs for B. A's token kept reading B's funded briefs with the
 * buyer's task text, budget, deadline, provider wallet and deliverable URL,
 * B's released and in-escrow totals, and — needing no scope at all — B's
 * outstanding job ids. That scenario is the last test in this file.
 */

const A = '0xAAAA000000000000000000000000000000000000';
const B = '0xBBBB000000000000000000000000000000000000';

const mine: OwnerConfirmation = { ok: true, owner: A };
const theirs: OwnerConfirmation = {
  ok: false,
  unavailable: false,
  reason: `The registry names ${B} as the owner of agent 97:42, not this automation token’s wallet.`,
};
const unreadable: OwnerConfirmation = {
  ok: false,
  unavailable: true,
  reason: 'The ERC-8004 registry on chain 97 did not answer.',
};

const agent = (chainId: number, tokenId: string, name: string | null = null) => ({ chainId, tokenId, name });

test('an identity is spelled one way everywhere', () => {
  assert.equal(agentKey({ chainId: 97, tokenId: '42' }), '97:42');
});

test('agents the registry confirms are kept, with their catalogue fields', async () => {
  const fleet = await confirmOwnedAgents([agent(97, '42', 'Vitals'), agent(56, '7', 'Centreline')], async () => mine);
  assert.deepEqual(fleet.agents.map((a) => a.name), ['Vitals', 'Centreline'], 'the candidate is returned, not a copy of its key');
  assert.deepEqual(fleet.notOwned, []);
  assert.deepEqual(fleet.ownershipUnavailable, []);
});

test('an agent transferred away is dropped and named', async () => {
  const fleet = await confirmOwnedAgents([agent(97, '42'), agent(56, '7')], async (chainId) =>
    chainId === 97 ? theirs : mine,
  );
  assert.deepEqual(fleet.agents.map(agentKey), ['56:7'], 'the transferred agent is not in the fleet');
  assert.deepEqual(fleet.notOwned, ['97:42']);
  assert.deepEqual(fleet.ownershipUnavailable, []);
});

/*
 * Fail closed, and this is the half worth having a test for: the easy
 * mistake is to carry the agent through on the catalogue's or the
 * signature's word when the registry cannot be reached, which is exactly
 * what the old code did for every read.
 */
test('an agent whose ownership could not be read is withheld, not carried through', async () => {
  const fleet = await confirmOwnedAgents([agent(97, '42'), agent(56, '7')], async (chainId) =>
    chainId === 97 ? unreadable : mine,
  );
  assert.deepEqual(fleet.agents.map(agentKey), ['56:7']);
  assert.deepEqual(fleet.ownershipUnavailable, ['97:42']);
  assert.deepEqual(fleet.notOwned, [], 'an unreadable registry is not a statement that the wallet does not own it');
});

test('a registry read that throws is treated as unavailable, not as confirmation', async () => {
  const fleet = await confirmOwnedAgents([agent(97, '42')], async () => {
    throw new Error('ECONNRESET');
  });
  assert.deepEqual(fleet.agents, []);
  assert.deepEqual(fleet.ownershipUnavailable, ['97:42']);
});

test('one sick chain withholds one agent, not the whole fleet', async () => {
  const fleet = await confirmOwnedAgents(
    [agent(97, '1'), agent(97, '2'), agent(56, '3')],
    async (chainId, tokenId) => {
      if (chainId === 97 && tokenId === '2') throw new Error('rate limited');
      return mine;
    },
  );
  assert.deepEqual(fleet.agents.map(agentKey), ['97:1', '56:3']);
  assert.deepEqual(fleet.ownershipUnavailable, ['97:2']);
});

test('every candidate is checked, and each against its own chain', async () => {
  const asked: string[] = [];
  await confirmOwnedAgents([agent(97, '42'), agent(56, '7')], async (chainId, tokenId) => {
    asked.push(`${chainId}:${tokenId}`);
    return mine;
  });
  assert.deepEqual(asked.sort(), ['56:7', '97:42']);
});

test('an empty fleet needs no reads and reports nothing withheld', async () => {
  let reads = 0;
  const fleet = await confirmOwnedAgents([], async () => {
    reads += 1;
    return mine;
  });
  assert.equal(reads, 0);
  assert.deepEqual(fleet, { agents: [], ownershipUnavailable: [], notOwned: [] });
});

/*
 * A withheld job reported as no job is "you have nothing outstanding",
 * which is a false claim about somebody's work and money. Both notes have
 * to name the agents and say which of the two things happened.
 */
test('the notes say which failure it was and name the agents', () => {
  const unavailable = ownershipUnavailableNote(['97:42', '56:7']);
  assert.match(unavailable, /97:42, 56:7/);
  assert.match(unavailable, /withheld/);
  assert.match(unavailable, /not an answer about what this wallet owns or is owed/);
  const gone = notOwnedNote(['97:42']);
  assert.match(gone, /no longer names this wallet as the owner of 97:42/);
  assert.match(gone, /a past verification signature does not carry it over a transfer/);
});

/*
 * The release-blocking scenario, end to end at this layer. A's candidate
 * fleet still holds 97:42 — the catalogue may be stale and the signature
 * row is A's own — and the registry is the only thing that says otherwise.
 */
test('a former owner’s fleet is empty once the registry names the new owner', async () => {
  const candidates = [agent(97, '42', 'Vitals')];
  const fleet = await confirmOwnedAgents(candidates, async () => theirs);
  assert.deepEqual(fleet.agents, [], 'nothing downstream can match a job to an agent that is not here');
  assert.deepEqual(fleet.notOwned, ['97:42']);
  assert.match(notOwnedNote(fleet.notOwned), /97:42/);
});
