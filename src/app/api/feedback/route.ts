import { NextResponse } from 'next/server';
import { getErc8183Job } from '@altananetwork/sdk';
import { getAddress, isAddress, isHex, type Hex } from 'viem';

import { signedByWallet, walletCanBeChecked } from '@/lib/wallet/signed-by';
import { ALTANA_NETWORK, altanaNetworkFor } from '@/lib/altana/client';
import { logAndPublic } from '@/lib/api/public-error';
import { decodePokterJobEnvelope } from '@/lib/erc8183/job-envelope';
import { getJobStore } from '@/lib/erc8183/store';
import { feedbackMessage, normaliseFeedback, validFeedbackContent } from '@/lib/feedback/model';
import { getFeedbackStore } from '@/lib/feedback/store';
import { jobChainParam } from '@/lib/jobs/href';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Private feedback on a delivered job. Write-only for buyers: there is no
 * public read, so an answer never becomes a public review. Pokter reads
 * them behind the operator secret.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.SWEEP_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  return NextResponse.json({ feedback: getFeedbackStore().all() });
}

export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`feedback:${requestClientKey(request)}`, { limit: 10, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many answers from this connection. Try again shortly.' }, { status: 429 });

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 }); }

  const jobId = String(body.jobId ?? '');
  const buyer = String(body.buyer ?? '');
  const signature = String(body.signature ?? '');
  const content = body.content;
  if (!/^\d+$/.test(jobId) || !isAddress(buyer) || !isHex(signature) || !validFeedbackContent(content)) {
    return NextResponse.json({ error: 'The feedback is invalid.' }, { status: 400 });
  }
  const chainId = jobChainParam(body.chainId === undefined ? undefined : String(body.chainId)) ?? ALTANA_NETWORK.chainId;

  try {
    const job = await getErc8183Job(altanaNetworkFor(chainId), BigInt(jobId));
    // Asked once the work is in: delivered and awaiting review, or settled.
    if (job.statusName !== 'SUBMITTED' && job.statusName !== 'COMPLETED') {
      return NextResponse.json({ error: 'Feedback opens once the agent has delivered.' }, { status: 409 });
    }
    if (getAddress(job.client) !== getAddress(buyer)) {
      return NextResponse.json({ error: 'Only the wallet that funded this job can answer for it.' }, { status: 403 });
    }
    const message = feedbackMessage({ chainId, jobId, content });
    /*
     * A passkey wallet is a smart account, so its signature is ERC-1271
     * and nothing recovers from it. viem's bare `verifyMessage` says so
     * itself — "Only supports Externally Owned Accounts" — which is why
     * a passkey buyer could fill this in and be told their own signature
     * was invalid. `signedByWallet` asks the account, the way the
     * notification and publisher routes already do.
     */
    if (!(await walletCanBeChecked(chainId, getAddress(buyer), signature as Hex))) {
      return NextResponse.json(
        { error: 'This wallet has no code on chain yet, so it cannot prove a signature. Fund or use it once, then try again.' },
        { status: 409 },
      );
    }
    if (!(await signedByWallet(chainId, getAddress(buyer), message, signature as Hex))) {
      return NextResponse.json({ error: 'The buyer signature is invalid.' }, { status: 403 });
    }
    const envelope = decodePokterJobEnvelope(job.description);
    const indexed = envelope ? null : getJobStore().all().find((j) => j.chainId === chainId && j.jobId === jobId) ?? null;
    const identity = envelope
      ? { chainId: envelope.identity.chainId, tokenId: envelope.identity.tokenId }
      : indexed ? { chainId: indexed.agentChainId ?? 56, tokenId: indexed.agentTokenId } : null;
    const saved = getFeedbackStore().upsert({
      chainId,
      jobId,
      buyer: getAddress(buyer),
      agentChainId: identity?.chainId ?? null,
      agentTokenId: identity?.tokenId ?? null,
      ...normaliseFeedback(content),
    });
    return NextResponse.json({ saved: { answered: saved.answered, followUp: saved.followUp, updatedAt: saved.updatedAt } });
  } catch (error) {
    return NextResponse.json({ error: `The answer could not be saved: ${logAndPublic('feedback', error)}` }, { status: 502 });
  }
}
