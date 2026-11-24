import 'server-only';

import { isHex, type Address, type Hex, type TypedDataDefinition } from 'viem';

import { signedByWallet, typedDataSignedByWallet } from '@/lib/wallet/signed-by';

import type { DecisionTypedData } from './decision-typed';

/**
 * How a poster's decision arrives: the plain message a browser wallet
 * signs, or the same decision as EIP-712 typed data (`format: 'eip712'`)
 * from a wallet that signs nothing else, as an Agentic Wallet does.
 */
export type DecisionSignature = { format: 'text' | 'eip712'; signature: Hex };

/**
 * A signature as an Agentic Wallet returns one: `signature` is r and s as
 * 128 hex characters with no `0x`, and `signatureRecovery` the recovery id,
 * `00` or `01` (27 or 28 are read as already offset). A whole 65-byte
 * signature, with or without `0x`, is taken as it is.
 */
export function joinSignature(signature: string, recovery?: unknown): Hex | null {
  const hex = signature.startsWith('0x') ? signature.slice(2) : signature;
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
  if (hex.length === 130) return `0x${hex}`;
  if (hex.length !== 128 || (typeof recovery !== 'string' && typeof recovery !== 'number')) return null;
  const id = typeof recovery === 'number' ? recovery : /^(0x)?[0-9a-fA-F]{1,2}$/.test(recovery) ? Number.parseInt(recovery.replace(/^0x/, ''), 16) : Number.NaN;
  const v = id === 0 || id === 1 ? 27 + id : id;
  if (v !== 27 && v !== 28) return null;
  return `0x${hex}${v.toString(16)}`;
}

/** The signature in a decision's body, in either format, or null when there is none to check. */
export function readDecisionSignature(body: Record<string, unknown>): DecisionSignature | null {
  const raw = typeof body.signature === 'string' ? body.signature : '';
  if (body.format === 'eip712') {
    const joined = joinSignature(raw, body.signatureRecovery);
    return joined ? { format: 'eip712', signature: joined } : null;
  }
  if (body.format !== undefined && body.format !== 'text') return null;
  return isHex(raw) && raw.length > 2 ? { format: 'text', signature: raw } : null;
}

/** Whether the poster made this decision: the plain message for a text signature, the typed data for an EIP-712 one. */
export function posterDecided(chainId: number, poster: Address, decision: { text: string; typed: DecisionTypedData }, signed: DecisionSignature): Promise<boolean> {
  return signed.format === 'eip712'
    ? typedDataSignedByWallet(chainId, poster, decision.typed as unknown as TypedDataDefinition, signed.signature)
    : signedByWallet(chainId, poster, decision.text, signed.signature);
}
