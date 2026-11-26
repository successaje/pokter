import assert from 'node:assert/strict';
import test from 'node:test';

import { escrowCustody, registryCustody } from '../src/lib/erc8183/custody';

/*
 * The addresses the pages pass in, standing in for the SDK's table, which no
 * test can import. Only their identity matters here: this module decides who
 * governs each contract, never what the contracts are.
 */
const ADDRESSES = {
  commerce: '0xEa4DAa3100A767e86FDed867729ae7446476EBA6',
  router: '0x51895229E12F9876011789B04f8698af06cCD6DA',
  policy: '0x9C01845705b3078Aa2e8cfF7520a6376FD766dE5',
  registry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
};

test('the contract holding the funds is declared replaceable, with the key that can replace it', () => {
  const commerce = escrowCustody(56, ADDRESSES).find((c) => c.name === 'ERC-8183 commerce');
  assert.ok(commerce, 'the commerce contract is missing from the escrow custody list');
  assert.equal(commerce.address, ADDRESSES.commerce);
  /* Read from chain: `owner()` on the mainnet commerce proxy, which is what
     `upgradeToAndCall` is authorised against. */
  assert.equal(commerce.admin, '0x5057b09A4b510ccaf7e3fb3038Ba60713E62B1fc');
});

test('the router shares the escrow key, and the dispute policy has no key at all', () => {
  const rows = escrowCustody(56, ADDRESSES);
  const commerce = rows.find((c) => c.name === 'ERC-8183 commerce');
  const router = rows.find((c) => c.name === 'Evaluator router');
  const policy = rows.find((c) => c.name === 'Optimistic policy');
  assert.ok(commerce && router && policy);
  assert.equal(router.admin, commerce.admin);
  /*
   * The risk disclosure says the rules a dispute is decided under cannot be
   * rewritten. That sentence is only true while this is null.
   */
  assert.equal(policy.admin, null);
});

test('on mainnet the registry is governed separately from the escrow', () => {
  const registry = registryCustody(56, ADDRESSES);
  const commerce = escrowCustody(56, ADDRESSES).find((c) => c.name === 'ERC-8183 commerce');
  assert.ok(commerce?.admin);
  assert.equal(registry.address, ADDRESSES.registry);
  assert.equal(registry.admin, '0xF223968Dd0c66472E31043acAcCcF5D1464D644b');
  /* Agent identity and the escrow are not the same party's to change. A page
     that treated one admin as covering both would be wrong about both. */
  assert.notEqual(registry.admin, commerce.admin);
});

test('every escrow chain declares custody for every contract rendered', () => {
  for (const chainId of [56, 97] as const) {
    const rows = [...escrowCustody(chainId, ADDRESSES), registryCustody(chainId, ADDRESSES)];
    assert.equal(rows.length, 4, `chain ${chainId} does not declare all four contracts`);
    for (const row of rows) {
      assert.ok(row.address, `chain ${chainId} ${row.name} has no address`);
      /* null is a claim ("nothing can replace this"); undefined would be a gap
         the developers page renders as no claim at all. */
      assert.notEqual(row.admin, undefined, `chain ${chainId} ${row.name} states no custody`);
    }
  }
});

test('testnet custody is its own, so one chain never speaks for the other', () => {
  const mainnet = escrowCustody(56, ADDRESSES)[0];
  const testnet = escrowCustody(97, ADDRESSES)[0];
  assert.notEqual(mainnet.admin, testnet.admin);
});
