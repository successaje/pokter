import { NextResponse } from 'next/server';
import { getAddress } from 'viem';

import { decisionToSign } from '@/lib/briefs/decision-request';
import { DECISION_DOMAIN, shellWord, walletSignRequest, walletTypedData } from '@/lib/briefs/decision-typed';
import { requestHired } from '@/lib/briefs/hired-status';
import { getBriefStore } from '@/lib/briefs/store';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * A poster's decision on their request as EIP-712 typed data, for a wallet
 * that signs nothing else, as an Agentic Wallet does (`decisionToSign`):
 * choose a proposal, take the choice back, or withdraw the request.
 *
 * Unsigned. The answer carries the typed data, the exact
 * `baw sign-message preview` command, and the route and body the
 * signature then goes to. Pokter records nothing here; the deciding route
 * checks the signature against the same typed data when it arrives.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const rate = consumeRateLimit(`brief-decision:${requestClientKey(request)}`, { limit: 20, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Expected a JSON body: { action, wallet, bidId }.' }, { status: 400 });
  const store = getBriefStore();
  const brief = store.get(id);
  if (!brief) return NextResponse.json({ error: 'No such request.' }, { status: 404 });

  const decision = decisionToSign(brief, store.bidsFor(id), { action: body.action, wallet: body.wallet, bidId: body.bidId }, { hired: requestHired });
  if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: decision.status });
  const wallet = getAddress(brief.poster);
  const message = walletSignRequest(wallet, decision.typed);
  return NextResponse.json({
    action: decision.action,
    typedData: walletTypedData(decision.typed),
    message,
    preview: `baw sign-message preview --binanceChainId ${DECISION_DOMAIN.chainId} --signType EIP712 --message ${shellWord(message)} --json`,
    submit: decision.submit,
    signBy: decision.signBy,
    then: `Once the wallet has signed, POST ${decision.submit.path} with submit.body, adding signature and signatureRecovery exactly as the wallet returned them.${decision.signBy ? ` The signature counts only until ${decision.signBy}.` : ''}`,
  });
}
