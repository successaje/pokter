import { pad, toEventSelector, type Address, type TransactionReceipt } from 'viem';

const REGISTERED_EVENT = {
  type: 'event',
  name: 'Registered',
  inputs: [
    { name: 'agentId', type: 'uint256', indexed: true },
    { name: 'agentURI', type: 'string', indexed: false },
    { name: 'owner', type: 'address', indexed: true },
  ],
} as const;
const REGISTERED_TOPIC = toEventSelector(REGISTERED_EVENT);

/** Recover the mint assigned to one exact owner by one exact registry. */
export function registeredAgentIdFromReceipt(
  receipt: Pick<TransactionReceipt, 'logs'>,
  registry: Address,
  owner: Address,
): bigint | undefined {
  const registryLower = registry.toLowerCase();
  const ownerTopic = pad(owner.toLowerCase() as Address, { size: 32 }).toLowerCase();
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== registryLower) continue;
    if (log.topics[0]?.toLowerCase() !== REGISTERED_TOPIC.toLowerCase()) continue;
    if (log.topics[2]?.toLowerCase() !== ownerTopic) continue;
    if (log.topics[1]) return BigInt(log.topics[1]);
  }
  return undefined;
}
