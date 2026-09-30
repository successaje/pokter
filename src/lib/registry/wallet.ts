'use client';

import { getAddress, stringToHex, type Address, type Hex } from 'viem';

type InjectedProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function injectedProvider(): InjectedProvider {
  const injected = (globalThis as unknown as { ethereum?: InjectedProvider }).ethereum;
  if (!injected) throw new Error('NO_WALLET');
  return injected;
}

/**
 * Connect for identity verification without requesting a network switch.
 * Ownership is an address comparison against data Pokter has already read;
 * connecting here must never prepare or imply a transaction.
 */
export async function connectIdentityWallet(): Promise<Address> {
  const accounts = (await injectedProvider().request({
    method: 'eth_requestAccounts',
  })) as Address[];
  if (!accounts?.length) throw new Error('NO_ACCOUNT');
  return getAddress(accounts[0]);
}

export function hasIdentityWallet(): boolean {
  try {
    injectedProvider();
    return true;
  } catch {
    return false;
  }
}

export async function signIdentityMessage(address: Address, message: string): Promise<Hex> {
  const signature = await injectedProvider().request({
    method: 'personal_sign',
    params: [stringToHex(message), address],
  });
  if (typeof signature !== 'string' || !signature.startsWith('0x')) throw new Error('INVALID_SIGNATURE');
  return signature as Hex;
}
