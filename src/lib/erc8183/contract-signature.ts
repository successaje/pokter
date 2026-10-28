import 'server-only';

import { BaseError, ContractFunctionRevertedError, ContractFunctionZeroDataError, getAddress, parseAbi } from 'viem';

import { registryClient } from '@/lib/registry/onchain';

import type { ContractSignatureCheck } from './negotiation';

const ERC1271_MAGIC_VALUE = '0x1626ba7e';
const ERC1271_ABI = parseAbi(['function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)']);

/**
 * ERC-1271 on the chain the quote is for, as BNB's agent SDK checks it
 * (`quoteVerify.ts`): the wallet must have code, and `isValidSignature`
 * must return the magic value. A revert is the wallet saying no. When the
 * quote names a verifying contract, the call is made from it, as the SDK
 * does, for accounts whose session keys are scoped to a checker.
 *
 * An unreachable chain is not a yes: the check returns false and the quote
 * is refused, to be asked again on the next pass.
 */
export function contractSignatureCheck(chainId: number, verifyingContract?: unknown): ContractSignatureCheck {
  return async ({ wallet, digests, signature }) => {
    const client = registryClient(chainId);
    if (!client) return false;
    const code = await client.getCode({ address: wallet }).catch(() => null);
    if (!code || code === '0x') return false;
    let account: `0x${string}` | undefined;
    try {
      account = typeof verifyingContract === 'string' ? getAddress(verifyingContract) : undefined;
    } catch {
      return false;
    }
    for (const digest of digests) {
      try {
        const result = await client.readContract({ address: wallet, abi: ERC1271_ABI, functionName: 'isValidSignature', args: [digest, signature], ...(account ? { account } : {}) });
        if (String(result).toLowerCase() === ERC1271_MAGIC_VALUE) return true;
      } catch (error) {
        const refused = error instanceof BaseError && Boolean(error.walk((cause) => cause instanceof ContractFunctionRevertedError || cause instanceof ContractFunctionZeroDataError));
        if (!refused) return false;
      }
    }
    return false;
  };
}
