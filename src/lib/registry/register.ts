'use client';

import {
  BNB,
  BNB_TESTNET,
  buildErc8004RegisterCall,
  buildErc8004SetAgentUriCall,
  encodeErc8004AgentUri,
  erc8183Addresses,
  getErc8004Agent,
  withErc8004Registration,
  type Erc8004RegistrationFile,
} from '@altananetwork/sdk';
import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  http,
  type Address,
  type Hex,
} from 'viem';
import { bsc, bscTestnet } from 'viem/chains';

import { registeredAgentIdFromReceipt } from './registration-receipt';

export type RegistryChainId = 56 | 97;
export type RegistrationStep =
  | 'connecting'
  | 'switching-network'
  | 'registering'
  | 'confirming-registration'
  | 'publishing-profile'
  | 'verifying'
  | 'done';

export interface RegistrationRecovery {
  chainId: RegistryChainId;
  registrationHash?: Hex;
  agentId?: string;
}

export interface RegistrationProgress extends RegistrationRecovery {
  step: RegistrationStep;
  profileHash?: Hex;
}

export interface RegisterIdentityInput {
  chainId: RegistryChainId;
  file: Erc8004RegistrationFile;
  recovery?: RegistrationRecovery;
  onProgress?: (progress: RegistrationProgress) => void;
}

type InjectedProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function injectedProvider(): InjectedProvider {
  const injected = (globalThis as unknown as { ethereum?: InjectedProvider }).ethereum;
  if (!injected) throw new Error('Install or open an injected wallet to publish an identity.');
  return injected;
}

function chainFor(chainId: RegistryChainId) {
  return chainId === 56 ? bsc : bscTestnet;
}

function networkFor(chainId: RegistryChainId) {
  return chainId === 56 ? BNB : BNB_TESTNET;
}

async function ensureChain(provider: InjectedProvider, chainId: RegistryChainId): Promise<void> {
  const current = Number(await provider.request({ method: 'eth_chainId' }));
  if (current === chainId) return;
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${chainId.toString(16)}` }],
    });
  } catch {
    throw new Error(`Switch your wallet to ${chainId === 56 ? 'BNB Chain' : 'BNB Testnet'} and try again.`);
  }
  if (Number(await provider.request({ method: 'eth_chainId' })) !== chainId) {
    throw new Error('The wallet did not switch to the selected identity network.');
  }
}

/**
 * Publish an ERC-8004 identity from an injected EOA wallet.
 *
 * Registration is deliberately two-phase because the final registration file
 * must contain the token id assigned by the first transaction. Recovery state
 * lets the UI resume phase two without ever minting a duplicate identity.
 */
export async function registerIdentityFromWallet(input: RegisterIdentityInput): Promise<{
  owner: Address;
  agentId: bigint;
  registrationHash?: Hex;
  profileHash?: Hex;
}> {
  if (input.recovery && input.recovery.chainId !== input.chainId) {
    throw new Error('The saved registration belongs to a different network.');
  }
  const report = input.onProgress ?? (() => {});
  const provider = injectedProvider();
  report({ step: 'connecting', chainId: input.chainId, ...input.recovery });
  const accounts = await provider.request({ method: 'eth_requestAccounts' }) as Address[];
  if (!accounts.length) throw new Error('No wallet account was selected.');
  const owner = getAddress(accounts[0]);
  report({ step: 'switching-network', chainId: input.chainId, ...input.recovery });
  await ensureChain(provider, input.chainId);

  const chain = chainFor(input.chainId);
  const wallet = createWalletClient({ chain, transport: custom(provider) });
  const read = createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0]) });
  const registry = erc8183Addresses(input.chainId).registry;
  let registrationHash = input.recovery?.registrationHash;
  let agentId = input.recovery?.agentId ? BigInt(input.recovery.agentId) : undefined;

  if (agentId === undefined) {
    const initialUri = encodeErc8004AgentUri({ ...input.file, registrations: [] });
    if (!registrationHash) {
      report({ step: 'registering', chainId: input.chainId });
      const call = buildErc8004RegisterCall(input.chainId, initialUri);
      registrationHash = await wallet.sendTransaction({
        account: owner,
        chain,
        to: call.to as Address,
        data: call.data as Hex,
      });
    }
    report({ step: 'confirming-registration', chainId: input.chainId, registrationHash });
    const receipt = await read.waitForTransactionReceipt({ hash: registrationHash });
    if (receipt.status !== 'success') throw new Error('The identity registration transaction reverted.');
    agentId = registeredAgentIdFromReceipt(receipt, registry, owner);
    if (agentId === undefined) {
      throw new Error('Registration confirmed, but the new agent ID was not present in the registry receipt. Do not register again; inspect the transaction first.');
    }
  }

  const completedFile = withErc8004Registration(input.file, agentId, input.chainId);
  const completedUri = encodeErc8004AgentUri(completedFile);
  const current = await getErc8004Agent(networkFor(input.chainId), agentId);
  if (getAddress(current.owner) !== owner) {
    throw new Error('The connected wallet does not own the saved ERC-8004 identity. Switch accounts before resuming.');
  }
  // The update may have landed even if the browser closed before it observed
  // the receipt. Treat the exact on-chain record as completion instead of
  // asking the owner to pay for an identical second transaction.
  if (current.agentUri === completedUri) {
    report({
      step: 'done', chainId: input.chainId, registrationHash,
      agentId: agentId.toString(),
    });
    return { owner, agentId, registrationHash, profileHash: undefined };
  }
  report({
    step: 'publishing-profile', chainId: input.chainId,
    registrationHash, agentId: agentId.toString(),
  });
  const updateCall = buildErc8004SetAgentUriCall(input.chainId, agentId, completedUri);
  const profileHash = await wallet.sendTransaction({
    account: owner,
    chain,
    to: updateCall.to as Address,
    data: updateCall.data as Hex,
  });
  const updateReceipt = await read.waitForTransactionReceipt({ hash: profileHash });
  if (updateReceipt.status !== 'success') throw new Error('The profile publication transaction reverted. You can safely resume without minting again.');

  report({
    step: 'verifying', chainId: input.chainId, registrationHash,
    agentId: agentId.toString(), profileHash,
  });
  const published = await getErc8004Agent(networkFor(input.chainId), agentId);
  if (getAddress(published.owner) !== owner || published.agentUri !== completedUri) {
    throw new Error('The registry did not return the exact owner and profile that were published.');
  }
  report({
    step: 'done', chainId: input.chainId, registrationHash,
    agentId: agentId.toString(), profileHash,
  });
  return { owner, agentId, registrationHash, profileHash };
}
