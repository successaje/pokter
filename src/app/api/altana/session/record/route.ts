import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { isAddress, parseEther } from 'viem';

import { getSessionStore } from '@/lib/altana/store';
import { ALTANA_NETWORK, IS_TESTNET } from '@/lib/altana/client';
import type { GrantedSession } from '@/lib/altana/types';

export const dynamic = 'force-dynamic';

const PERIODS = new Set(['day', 'week', 'month']);

/**
 * Record a session that was granted in the browser by a passkey wallet.
 *
 * The server signs nothing here — the grant already happened on-chain, signed
 * by a key that never leaves the user's device. This endpoint only indexes it
 * so /my-agents can list it without scanning the chain.
 *
 * Because the caller supplies the details, nothing recorded here is treated as
 * authoritative: the authority is the KeyStore entry, and the UI links to the
 * transaction so a reader can check the claim rather than trust this row.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const walletAddress = String(body.walletAddress ?? '');
  const publicKey = String(body.publicKey ?? '');
  const agentName = String(body.agentName ?? '');
  const agentTokenId = String(body.agentTokenId ?? '');
  const period = String(body.period ?? 'week');
  const spendCapBnb = Number(body.spendCapBnb ?? 0);
  const expiresAt = String(body.expiresAt ?? '');

  if (!isAddress(walletAddress)) {
    return NextResponse.json(
      { error: 'walletAddress must be a valid address.' },
      { status: 400 },
    );
  }

  if (!/^0x[0-9a-fA-F]+$/.test(publicKey)) {
    return NextResponse.json(
      { error: 'publicKey must be hex.' },
      { status: 400 },
    );
  }

  if (!PERIODS.has(period)) {
    return NextResponse.json({ error: 'Unsupported period.' }, { status: 400 });
  }

  if (!Number.isFinite(spendCapBnb) || spendCapBnb <= 0 || spendCapBnb > 1) {
    return NextResponse.json(
      { error: 'spendCapBnb must be between 0 and 1.' },
      { status: 400 },
    );
  }

  const expiry = Date.parse(expiresAt);
  if (Number.isNaN(expiry)) {
    return NextResponse.json(
      { error: 'expiresAt must be an ISO timestamp.' },
      { status: 400 },
    );
  }

  const session: GrantedSession = {
    id: randomUUID(),
    agentChainId: Number(body.agentChainId ?? 56),
    agentTokenId: agentTokenId || 'unknown',
    agentName: agentName || 'Unnamed agent',
    walletAddress,
    publicKey: publicKey as `0x${string}`,
    chainId: ALTANA_NETWORK.chainId,
    isTestnet: IS_TESTNET,
    spendCapWei: parseEther(String(spendCapBnb)).toString(),
    period,
    expiresAt: new Date(expiry).toISOString(),
    grantedAt: new Date().toISOString(),
    grantTxHash: (body.grantTxHash as `0x${string}` | undefined) ?? null,
    revokedAt: null,
    revokeTxHash: null,
  };

  getSessionStore().record(session);
  return NextResponse.json({ session });
}
