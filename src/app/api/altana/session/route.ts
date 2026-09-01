import { NextResponse } from 'next/server';

import {
  grantSession,
  listSessions,
  revokeSession,
} from '@/lib/altana/session';
import { AltanaNotConfiguredError, IS_TESTNET } from '@/lib/altana/client';
import type { SpendPeriod } from '@/lib/altana/permissions';

export const dynamic = 'force-dynamic';
/** Granting writes on-chain through the relay; it needs room to confirm. */
export const maxDuration = 120;

const PERIODS: SpendPeriod[] = ['day', 'week', 'month'];

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ sessions: listSessions(), isTestnet: IS_TESTNET });
}

/** Grant a scoped session to an agent. */
export async function POST(request: Request): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const agentTokenId = String(body.agentTokenId ?? '');
  const agentName = String(body.agentName ?? '');
  const category = String(body.category ?? '');
  const period = String(body.period ?? 'week') as SpendPeriod;
  const spendCapBnb = Number(body.spendCapBnb ?? 0);
  const expiryDays = Number(body.expiryDays ?? 7);

  if (!agentTokenId || !agentName || !category) {
    return NextResponse.json(
      { error: 'agentTokenId, agentName and category are required.' },
      { status: 400 },
    );
  }

  // Bounds are enforced server-side as well as in the UI: a spend cap is a
  // safety control, and a control that only exists in the browser is not one.
  if (!Number.isFinite(spendCapBnb) || spendCapBnb <= 0 || spendCapBnb > 1) {
    return NextResponse.json(
      { error: 'spendCapBnb must be between 0 and 1.' },
      { status: 400 },
    );
  }

  if (!PERIODS.includes(period)) {
    return NextResponse.json(
      { error: `period must be one of ${PERIODS.join(', ')}.` },
      { status: 400 },
    );
  }

  if (!Number.isInteger(expiryDays) || expiryDays < 1 || expiryDays > 30) {
    return NextResponse.json(
      { error: 'expiryDays must be a whole number between 1 and 30.' },
      { status: 400 },
    );
  }

  try {
    const outcome = await grantSession({
      agentChainId: Number(body.agentChainId ?? 56),
      agentTokenId,
      agentName,
      category,
      spendCapBnb,
      period,
      expiryDays,
    });
    return NextResponse.json(outcome);
  } catch (error) {
    if (error instanceof AltanaNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    // Surfaced verbatim: the relay's own message is what makes an integration
    // failure diagnosable, and §33 requires documenting it rather than hiding it.
    return NextResponse.json(
      { error: `Grant failed: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}

/** Revoke a session. */
export async function DELETE(request: Request): Promise<NextResponse> {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  }

  try {
    return NextResponse.json({ session: await revokeSession(id) });
  } catch (error) {
    if (error instanceof AltanaNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: `Revoke failed: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}
