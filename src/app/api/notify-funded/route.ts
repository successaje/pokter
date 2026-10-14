import { NextResponse } from 'next/server';
import { getErc8183Job } from '@altananetwork/sdk';

import { ALTANA_NETWORK, altanaNetworkFor } from '@/lib/altana/client';
import { isEscrowChain } from '@/lib/network/escrow';
import { isDemoSeller, submitDemoDeliverable } from '@/lib/erc8183/demo-seller';
import { noticeSeller } from '@/lib/erc8183/seller-notice';
import { BSC_MAINNET, type ChainId } from '@/lib/scan/types';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 25;



/** Verify FUNDED on-chain, then notify the matching seller over A2A. */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`notify:${requestClientKey(request)}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Notification limit reached. Try again shortly.' },
      {
        status: 429,
        headers: { 'retry-after': String(rate.retryAfterSeconds) },
      },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: 'Expected a JSON body.' },
      { status: 400 },
    );
  }

  /*
   * POK-035. The registry chain and the escrow chain are separate facts.
   *
   * This used to take one `chainId`, require it to equal the escrow chain,
   * and then use the same value to look up the agent in the ERC-8004
   * registry. Pokter indexes mainnet agents and escrows on testnet, so the
   * value that satisfied the guard was the one guaranteed to 404 the lookup,
   * and no marketplace agent could be delivered at all.
   *
   * The escrow chain was then a server fact, because there was only one.
   * Hires are now funded per agent on the escrow that can pay its price, so
   * the caller names it as `escrowChainId`, separately from the registry
   * chain. It is not trusted: nothing is sent unless the job read from that
   * chain is funded and names this provider, and Pokter's own seller only
   * ever delivers on testnet.
   */
  // No fallback to `chainId`: every existing caller sent the escrow chain
  // there, which is precisely the value that cannot resolve an agent.
  const agentChainId = Number(body.agentChainId ?? BSC_MAINNET) as ChainId;
  const tokenId = String(body.tokenId ?? '');
  const jobId = String(body.jobId ?? '');
  const provider = String(body.provider ?? '').toLowerCase();
  const escrowChainId = body.escrowChainId === undefined ? ALTANA_NETWORK.chainId : Number(body.escrowChainId);
  if (!isEscrowChain(escrowChainId)) {
    return NextResponse.json(
      { error: 'escrowChainId must be an escrow chain Pokter funds hires on.' },
      { status: 400 },
    );
  }

  if (agentChainId !== 56 && agentChainId !== 97) {
    return NextResponse.json(
      { error: 'agentChainId must be 56 or 97.' },
      { status: 400 },
    );
  }
  if (
    !/^\d+$/.test(tokenId) ||
    !/^\d+$/.test(jobId) ||
    !/^0x[0-9a-f]{40}$/.test(provider)
  ) {
    return NextResponse.json(
      { error: 'A numeric token id and job id and a provider address are required.' },
      { status: 400 },
    );
  }
  if (BigInt(jobId) > BigInt(Number.MAX_SAFE_INTEGER)) {
    return NextResponse.json(
      { error: 'This seller only accepts numeric job identifiers.' },
      { status: 400 },
    );
  }

  try {
    const job = await getErc8183Job(altanaNetworkFor(escrowChainId), BigInt(jobId));
    if (job.provider.toLowerCase() !== provider) {
      return NextResponse.json(
        { error: 'The funded job does not name the requested provider.' },
        { status: 409 },
      );
    }
    if (job.statusName !== 'FUNDED') {
      return NextResponse.json(
        { error: `Job is ${job.statusName}, not FUNDED.` },
        { status: 409 },
      );
    }

    if (await isDemoSeller(provider)) {
      if (escrowChainId !== 97) {
        return NextResponse.json(
          { error: 'Pokter’s delivery agent works only on testnet jobs.' },
          { status: 409 },
        );
      }
      const delivery = await submitDemoDeliverable(jobId);
      return NextResponse.json({
        ...delivery,
        notifiedAt: new Date().toISOString(),
      });
    }

    const notice = await noticeSeller({ agentChainId, tokenId, jobId, provider, escrowChainId });
    if (notice.status === 'unreachable') {
      return NextResponse.json(
        { error: `Seller notification failed: ${notice.reason ?? 'no answer'}`, status: notice.status, reason: notice.reason },
        { status: 502 },
      );
    }
    return NextResponse.json({
      status: notice.status,
      reason: notice.reason,
      jobId,
      notifiedAt: notice.lastAt,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Seller notification failed: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}
