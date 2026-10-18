import assert from 'node:assert/strict';
import test from 'node:test';

import { mainnetFirstPerAgent } from '../src/lib/agents/distinct';

/**
 * The home strip's rule, in the order `loadHome` applies it: rank the
 * registrations, then take one row per agent preferring mainnet.
 *
 * The shelf showed "Test tokens · BNB Testnet" on all four cards under a
 * hero reading "Live on BNB Chain Mainnet". Every mainnet listing begins
 * with no completed jobs, so it lost the `paid.completed` sort to its own
 * testnet twin, and the twin is what the buyer saw.
 */
type Row = { owner: string; name: string; chainId: number; tokenId: string; completed: number; priced: boolean };

const identity = (r: Row) => ({ owner_address: r.owner, name: r.name, chain_id: r.chainId, token_id: r.tokenId });

const rank = (rows: Row[]) =>
  [...rows].sort((a, b) => Number(b.priced) - Number(a.priced) || b.completed - a.completed);

const shelf = (rows: Row[]) => {
  const { items } = mainnetFirstPerAgent(rank(rows), identity);
  const owners = new Set<string>();
  return items.filter((r) => (owners.has(r.owner) ? false : (owners.add(r.owner), true))).slice(0, 4);
};

const pair = (owner: string, name: string, testnetCompleted: number): Row[] => [
  { owner, name, chainId: 97, tokenId: `t-${name}`, completed: testnetCompleted, priced: true },
  { owner, name, chainId: 56, tokenId: `m-${name}`, completed: 0, priced: true },
];

test('an agent on both chains is shown as its mainnet registration', () => {
  const picked = shelf(pair('0xowner', 'Mandate Grid-1', 9));
  assert.equal(picked.length, 1, 'one agent, not two cards');
  assert.equal(picked[0].chainId, 56, 'the mainnet row is the one shown');
});

test('the testnet twin still earns the rank, it just is not the row', () => {
  /*
   * Grouping before sorting would drop the agent down the strip, because
   * the mainnet row carries none of the delivery history. It must keep the
   * place its best registration earned.
   */
  const rows = [
    ...pair('0xbusy', 'Busy', 40),
    ...pair('0xquiet', 'Quiet', 1),
  ];
  const picked = shelf(rows);
  assert.deepEqual(picked.map((r) => r.name), ['Busy', 'Quiet'], 'ranked by the busy twin');
  assert.deepEqual(picked.map((r) => r.chainId), [56, 56], 'both shown on mainnet');
});

test('a testnet-only agent is still shown, on testnet', () => {
  // The fix must not hide agents that have no mainnet registration.
  const rows: Row[] = [{ owner: '0xsolo', name: 'Testnet Only', chainId: 97, tokenId: '1', completed: 3, priced: true }];
  const picked = shelf(rows);
  assert.equal(picked.length, 1);
  assert.equal(picked[0].chainId, 97);
});

test('one card per operator survives the grouping', () => {
  const rows = [
    ...pair('0xsame', 'First', 10),
    ...pair('0xsame', 'Second', 8),
  ];
  assert.equal(shelf(rows).length, 1, 'same owner, one slot');
});

test('four slots, and distinct agents fill them', () => {
  const rows = ['a', 'b', 'c', 'd', 'e'].flatMap((o, i) => pair(`0x${o}`, `Agent ${o}`, 10 - i));
  const picked = shelf(rows);
  assert.equal(picked.length, 4);
  assert.equal(new Set(picked.map((r) => r.owner)).size, 4);
  assert.ok(picked.every((r) => r.chainId === 56), 'all shown as mainnet');
});
