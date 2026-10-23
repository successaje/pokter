import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import type { Address } from 'viem';

import {
  automationTokensOf,
  BUILDER_SESSION_COOKIE,
  builderSessionOwner,
  liveAutomationTokenCount,
  revokeAutomationTokenFor,
  saveAutomationToken,
} from '@/lib/builders/store';
import {
  AUTOMATION_SCOPES,
  DEFAULT_TOKEN_DAYS,
  expiryFromDays,
  MAX_TOKENS_PER_OWNER,
  readScopes,
  tokenState,
} from '@/lib/builders/automation-token';
import { mintAutomationToken } from '@/lib/builders/automation-secret';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Minting and revoking the credential a provider's own assistant holds.
 *
 * Every action here needs the browser session, which needs a wallet
 * signature — so an automation token can only ever be created by somebody
 * who has just proved they own the identity, at a keyboard. A token cannot
 * mint another token: that would make a leaked one permanent, and the whole
 * point of this credential is that it is the weaker one.
 *
 * The secret is in the mint response and nowhere else. It is never written
 * to the database in the clear, never returned by the listing, and never
 * logged. If it is lost, the token is revoked and another is minted.
 */

function listing(owner: Address) {
  return automationTokensOf(owner).map((token) => ({
    id: token.id,
    label: token.label,
    hint: token.hint,
    scopes: token.scopes,
    createdAt: token.createdAt,
    expiresAt: token.expiresAt,
    revokedAt: token.revokedAt,
    lastUsedAt: token.lastUsedAt,
    state: tokenState(token).label,
  }));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const owner = builderSessionOwner(request.cookies.get(BUILDER_SESSION_COOKIE)?.value);
  if (!owner) return NextResponse.json({ error: 'Builder verification is required.' }, { status: 401 });
  return NextResponse.json({ owner, scopes: AUTOMATION_SCOPES, tokens: listing(owner) });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rate = consumeRateLimit(`builder-automation:${requestClientKey(request)}`, { limit: 10, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many automation requests just now. Try again shortly.' }, { status: 429 });
  const owner = builderSessionOwner(request.cookies.get(BUILDER_SESSION_COOKIE)?.value);
  if (!owner) return NextResponse.json({ error: 'Builder verification is required.' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  if (body.action === 'revoke') {
    const id = String(body.id ?? '');
    if (!id) return NextResponse.json({ error: 'A token id is required.' }, { status: 400 });
    /* Scoped to this wallet inside the statement, because a token id is
       printed on a page and is not a secret. `false` means it was already
       revoked, or is not this wallet's — the page says "already revoked"
       rather than claiming it has just done something. */
    const revoked = revokeAutomationTokenFor(owner, id);
    return NextResponse.json({ revoked, tokens: listing(owner) });
  }

  if (body.action === 'mint') {
    const scopes = readScopes(body.scopes);
    if (!scopes) {
      return NextResponse.json(
        {
          error: `Pick at least one scope, from: ${AUTOMATION_SCOPES.map((s) => s.id).join(', ')}. There is no scope for signing a transaction or moving funds, and there cannot be one — Pokter holds no key that could use it.`,
        },
        { status: 400 },
      );
    }
    const days = body.days === undefined ? DEFAULT_TOKEN_DAYS : Number(body.days);
    const expiresAt = expiryFromDays(days);
    if (!expiresAt) return NextResponse.json({ error: 'The lifetime must be a whole number of days, at most 90.' }, { status: 400 });
    const label = String(body.label ?? '').trim().slice(0, 60) || 'Automation token';
    if (liveAutomationTokenCount(owner) >= MAX_TOKENS_PER_OWNER) {
      return NextResponse.json(
        { error: `This wallet already holds ${MAX_TOKENS_PER_OWNER} live automation tokens. Revoke one before minting another.` },
        { status: 409 },
      );
    }
    const minted = mintAutomationToken();
    const createdAt = new Date().toISOString();
    saveAutomationToken({
      id: randomUUID(),
      tokenHash: minted.tokenHash,
      ownerAddress: owner,
      label,
      hint: minted.hint,
      scopes,
      createdAt,
      expiresAt,
    });
    /*
     * The one response that carries the secret. `no-store` so no proxy or
     * browser cache keeps a copy of it, which is the ordinary precaution
     * for a credential shown once.
     */
    return NextResponse.json(
      {
        token: minted.token,
        shownOnce: 'This is the only time Pokter will show this token. Put it in an environment variable or a config file your assistant reads. Do not paste it into a chat, a commit or an issue.',
        label,
        scopes,
        expiresAt,
        tokens: listing(owner),
      },
      { status: 201, headers: { 'cache-control': 'no-store' } },
    );
  }

  return NextResponse.json({ error: 'Unknown automation action.' }, { status: 400 });
}
