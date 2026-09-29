import { NextResponse } from 'next/server';

import {
  listSessions,
  revokeSession,
} from '@/lib/altana/session';
import { AltanaNotConfiguredError, IS_TESTNET } from '@/lib/altana/client';
import { requireDemoWriteAccess } from '@/lib/security/demo-write';

export const dynamic = 'force-dynamic';
/** Granting writes on-chain through the relay; it needs room to confirm. */
export const maxDuration = 120;

export async function GET(request: Request): Promise<NextResponse> {
  const denied = requireDemoWriteAccess(request);
  if (denied) return denied;
  return NextResponse.json({ sessions: listSessions(), isTestnet: IS_TESTNET });
}

/** Refuse to grant a session. Kept as a route so the refusal is explicit. */
export async function POST(request: Request): Promise<NextResponse> {
  const denied = requireDemoWriteAccess(request);
  if (denied) return denied;

  /*
   * Fail before parsing user-controlled grant parameters or touching a signer.
   * The current Altana permission schema cannot constrain calldata arguments,
   * so no category has a safe standing-authority path. Keeping the historical
   * revoke route live lets old testnet sessions still be closed.
   */
  return NextResponse.json(
    {
      error:
        'Delegated wallet sessions are disabled until recipient, asset, position and amount constraints are enforced on-chain.',
    },
    { status: 409 },
  );
}

/** Revoke a session. */
export async function DELETE(request: Request): Promise<NextResponse> {
  const denied = requireDemoWriteAccess(request);
  if (denied) return denied;

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
