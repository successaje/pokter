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

/*
 * There is deliberately no store of session signers here.
 *
 * A granted session's authority lives on chain; the signer that would act
 * under it was generated at grant time. This module used to keep those signers
 * in a process-local Map — written on grant, deleted on revoke, and never once
 * read. It held a live signing key in memory to no purpose.
 *
 * Pokter never acts *as* an agent. Granting is now refused outright — the
 * permission schema cannot constrain calldata arguments — and what remains is
 * reading and revoking sessions granted before that policy. `revokeSession`
 * targets the registered public key rather than the signer, so nothing here
 * needs a key at all.
 *
 * Removing the Map is the point rather than a tidy-up: a capability that does
 * not exist cannot be reached by accident later. The day Pokter executes on a
 * user's behalf, the signer becomes a real secret needing real storage, and
 * that should be a deliberate addition rather than something already half
 * present.
 */


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
  const signer = adminSigner('legacy-session');

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
  const signer = adminSigner('legacy-session');
  const wallet = await client.createWallet({ signer });

  const result = await client.revokeSession({
    wallet,
    signer,
    session: existing.publicKey as Hex,
  });

  const revokedAt = new Date().toISOString();
  store.markRevoked(id, result.transactionHash ?? null, revokedAt);

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
