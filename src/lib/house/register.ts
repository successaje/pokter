import 'server-only';

import {
  buildErc8004RegisterCall,
  buildErc8004SetAgentUriCall,
  encodeErc8004AgentUri,
  erc8183Addresses,
  getErc8004Agent,
  withErc8004Registration,
} from '@altananetwork/sdk';
import { createPublicClient, createWalletClient, formatEther, http, parseAbi, type Address, type Hex } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';

import { altanaNetworkFor } from '@/lib/altana/client';
import { getJobStore } from '@/lib/erc8183/store';
import { getProbeStore } from '@/lib/history/store';
import { siteOrigin } from '@/lib/evidence/origin';
import { registeredAgentIdFromReceipt } from '@/lib/registry/registration-receipt';

import { houseAccount } from './keys';
import { houseRegistrationFile } from './registration-file';
import type { HouseAgentDefinition, HouseChainId } from './types';

/** Enough BNB for the two registration transactions with headroom. */
const MIN_GAS_WEI = 500_000_000_000_000n; // 0.0005 BNB

const cursorName = (slug: string, chainId: HouseChainId) => `house-registration:${slug}:${chainId}`;

/** The registry entry Pokter recorded for a house agent on a chain, if any. */
export function recordedRegistration(slug: string, chainId: HouseChainId): string | null {
  return getJobStore().readCursor(cursorName(slug, chainId));
}

export type HouseRegistration =
  | { status: 'registered' | 'already-registered'; agentId: string; owner: Address; transactions: Hex[] }
  | { status: 'needs-funding'; owner: Address; balanceBnb: string; neededBnb: string };

/**
 * Register a house agent on one chain, from its own wallet.
 *
 * The same two steps Studio takes from a browser: mint with the profile,
 * then publish the profile with its own registration id. Run on the server
 * because the key exists only there. The new id is recorded the moment the
 * mint confirms, so an interrupted run resumes at the second step instead
 * of minting a duplicate, and a repeated call changes nothing.
 */
export async function registerHouseAgent(definition: HouseAgentDefinition, chainId: HouseChainId): Promise<HouseRegistration> {
  const account = houseAccount(definition);
  const network = altanaNetworkFor(chainId);
  const chain = chainId === 56 ? bsc : bscTestnet;
  const read = createPublicClient({ chain, transport: http(network.publicRpcUrl) });
  const wallet = createWalletClient({ account, chain, transport: http(network.publicRpcUrl) });
  const registry = erc8183Addresses(chainId).registry as Address;
  const store = getJobStore();
  const file = houseRegistrationFile(definition, chainId, siteOrigin());
  const transactions: Hex[] = [];

  let agentIdText = store.readCursor(cursorName(definition.slug, chainId));
  if (!agentIdText) {
    const owned = await read.readContract({ address: registry, abi: parseAbi(['function balanceOf(address) view returns (uint256)']), functionName: 'balanceOf', args: [account.address] });
    if (owned > 0n) {
      throw new Error(`${account.address} already owns an identity on chain ${chainId} that Pokter has no record of. Refusing to mint another; record its id first.`);
    }
    const balance = await read.getBalance({ address: account.address });
    if (balance < MIN_GAS_WEI) {
      return { status: 'needs-funding', owner: account.address, balanceBnb: formatEther(balance), neededBnb: formatEther(MIN_GAS_WEI) };
    }
    const mint = buildErc8004RegisterCall(chainId, encodeErc8004AgentUri({ ...file, registrations: [] }));
    const mintHash = await wallet.sendTransaction({ to: mint.to as Address, data: mint.data as Hex });
    transactions.push(mintHash);
    const receipt = await read.waitForTransactionReceipt({ hash: mintHash });
    if (receipt.status !== 'success') throw new Error('The registration transaction reverted.');
    const minted = registeredAgentIdFromReceipt(receipt, registry, account.address);
    if (minted === undefined) throw new Error(`Registration ${mintHash} confirmed without an id in its receipt. Inspect it before trying again.`);
    agentIdText = minted.toString();
    store.writeCursor(cursorName(definition.slug, chainId), agentIdText);
  }

  /*
   * Enrolled for the scheduled checks on every path, a repeat included. The
   * sweep measures listed, tracked and enrolled agents; a new registration
   * is none of those until it is enrolled, so the first five sat at "Not
   * checked yet", and therefore never "Priced", until this ran.
   */
  getProbeStore().enroll([{ chainId, tokenId: agentIdText }]);

  const agentId = BigInt(agentIdText);
  const completedUri = encodeErc8004AgentUri(withErc8004Registration(file, agentId, chainId));
  const current = await getErc8004Agent(network, agentId);
  if (current.agentUri === completedUri) {
    return { status: transactions.length ? 'registered' : 'already-registered', agentId: agentIdText, owner: account.address, transactions };
  }
  const update = buildErc8004SetAgentUriCall(chainId, agentId, completedUri);
  const updateHash = await wallet.sendTransaction({ to: update.to as Address, data: update.data as Hex });
  transactions.push(updateHash);
  const updated = await read.waitForTransactionReceipt({ hash: updateHash });
  if (updated.status !== 'success') throw new Error('Publishing the profile reverted. Run again to resume; nothing will be minted twice.');
  return { status: 'registered', agentId: agentIdText, owner: account.address, transactions };
}
