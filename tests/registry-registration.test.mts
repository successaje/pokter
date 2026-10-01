import assert from 'node:assert/strict';
import test from 'node:test';

import { pad, toEventSelector, type Address, type Hex } from 'viem';

import { registeredAgentIdFromReceipt } from '../src/lib/registry/registration-receipt';

const event = {
  type: 'event', name: 'Registered',
  inputs: [
    { name: 'agentId', type: 'uint256', indexed: true },
    { name: 'agentURI', type: 'string', indexed: false },
    { name: 'owner', type: 'address', indexed: true },
  ],
} as const;
const registry = '0x1111111111111111111111111111111111111111' as Address;
const owner = '0x2222222222222222222222222222222222222222' as Address;
const other = '0x3333333333333333333333333333333333333333' as Address;

function log(address: Address, agentId: bigint, eventOwner: Address) {
  return {
    address,
    topics: [
      toEventSelector(event),
      `0x${agentId.toString(16).padStart(64, '0')}` as Hex,
      pad(eventOwner, { size: 32 }),
    ],
    data: '0x' as Hex,
  };
}

test('registration recovery accepts only the selected registry and owner', () => {
  const receipt = { logs: [
    log(other, 7n, owner),
    log(registry, 8n, other),
    log(registry, 9n, owner),
  ] } as Parameters<typeof registeredAgentIdFromReceipt>[0];
  assert.equal(registeredAgentIdFromReceipt(receipt, registry, owner), 9n);
});

test('registration recovery never guesses when the receipt has no exact event', () => {
  const receipt = { logs: [log(registry, 9n, other)] } as Parameters<typeof registeredAgentIdFromReceipt>[0];
  assert.equal(registeredAgentIdFromReceipt(receipt, registry, owner), undefined);
});
