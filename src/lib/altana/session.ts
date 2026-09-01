import 'server-only';

import { randomUUID } from 'node:crypto';
import { formatEther, type Hex } from 'viem';

import {
  ALTANA_NETWORK,
  IS_TESTNET,
  adminSigner,
  altanaClient,
} from './client';
import {
  expiryTimestamp,
  toSessionPermissions,
  type PermissionRequest,
} from './permissions';
import { getSessionStore } from './store';
import type { GrantedSession } from './types';

/**
 * Live session signers, held for the lifetime of the process.
 *
 * A granted session's authority lives on-chain, but the *signer* that acts
 * under it is generated at grant time and never persisted — writing an agent's
 * signing key to disk would undo the point of scoping it. A restart therefore
 * loses the ability to execute under an existing session, while leaving the
 * grant itself intact and revocable by public key. Documented rather than
 * hidden; a production deployment would hand the signer to the agent process at
 * grant time instead.
 */
const liveSigners = new Map<string, unknown>();

export interface GrantInput extends PermissionRequest {
  agentChainId: number;
  agentTokenId: string;
  agentName: string;
}

export interface GrantOutcome {
  session: GrantedSession;
  /** True when the relay reported a transaction for the grant. */
  onChain: boolean;
}

/**
 * §32. Grant a scoped, expiring, revocable session.
 *
 * `register: true` writes the session key into Altana's on-chain KeyStore, which
 * is what lets any third party verify the agent's authority without trusting
 * Pokter's database.
 */
export async function grantSession(input: GrantInput): Promise<GrantOutcome> {
  const client = altanaClient();
  const signer = adminSigner();

  const wallet = await client.createWallet({ signer });
  const permissions = toSessionPermissions(input);
  const expiry = expiryTimestamp(input);

  const granted = await client.grantSession({
    wallet,
    signer,
    permissions,
    expiry,
    register: true,
  });

  const id = randomUUID();
  liveSigners.set(id, granted.signer);

  const record: GrantedSession = {
    id,
    agentChainId: input.agentChainId,
    agentTokenId: input.agentTokenId,
    agentName: input.agentName,
    walletAddress: wallet.address,
    publicKey: granted.publicKey,
    chainId: ALTANA_NETWORK.chainId,
    isTestnet: IS_TESTNET,
    spendCapWei: (permissions.spend?.[0]?.limit ?? 0n).toString(),
    period: input.period,
    expiresAt: new Date(expiry * 1000).toISOString(),
    grantedAt: new Date().toISOString(),
    grantTxHash: granted.transactionHash ?? null,
    revokedAt: null,
    revokeTxHash: null,
  };

  getSessionStore().record(record);

  return { session: record, onChain: Boolean(granted.transactionHash) };
}

/**
 * §57. Revoke.
 *
 * Revocation targets the registered public key, so it works even for a session
 * this process did not grant — a restart cannot strand a live permission.
 */
export async function revokeSession(id: string): Promise<GrantedSession> {
  const store = getSessionStore();
  const existing = store.byId(id);

  if (!existing) throw new Error(`No session ${id}`);
  if (existing.revokedAt) return existing;

  const client = altanaClient();
  const signer = adminSigner();
  const wallet = await client.createWallet({ signer });

  const result = await client.revokeSession({
    wallet,
    signer,
    session: existing.publicKey as Hex,
  });

  const revokedAt = new Date().toISOString();
  store.markRevoked(id, result.transactionHash ?? null, revokedAt);
  liveSigners.delete(id);

  return {
    ...existing,
    revokedAt,
    revokeTxHash: result.transactionHash ?? null,
  };
}

/**
 * Whether a session still carries authority.
 *
 * Computed in the data layer rather than during render: it depends on the
 * current time, which makes it impure, and a component that recomputes it on
 * every render can flip state unpredictably mid-paint.
 */
export type SessionState = 'active' | 'expired' | 'revoked';

export function sessionState(session: GrantedSession): SessionState {
  if (session.revokedAt) return 'revoked';
  return Date.parse(session.expiresAt) <= Date.now() ? 'expired' : 'active';
}

export interface SessionView extends GrantedSession {
  state: SessionState;
  /** Milliseconds left at the moment this was read on the server. */
  remainingMs: number;
}

export function listSessions(): SessionView[] {
  const now = Date.now();
  return getSessionStore()
    .all()
    .map((session) => ({
      ...session,
      state: sessionState(session),
      remainingMs: Math.max(0, Date.parse(session.expiresAt) - now),
    }));
}

/** Human-readable spend cap for display. */
export function formatCap(session: GrantedSession): string {
  return `${formatEther(BigInt(session.spendCapWei))} BNB`;
}
