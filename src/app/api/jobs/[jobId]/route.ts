import { NextResponse } from 'next/server';
import { getErc8183DeliverableUrl, getErc8183Job } from '@altananetwork/sdk';

import { ALTANA_NETWORK, IS_TESTNET } from '@/lib/altana/client';
import { decodePokterJobEnvelope } from '@/lib/erc8183/job-envelope';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import type { HiredJob } from '@/lib/erc8183/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

/**
 * One job, read from chain by its id.
 *
 * The activity page has always told people that "an escrowed job hired
 * elsewhere can be recovered from chain by its job ID" and never gave them
 * anything to type it into. Records live in this browser's storage, so a
 * hire made on a phone is invisible on a laptop, and the only way back was
 * to be told there was no way back.
 *
 * Read-only and public, because the data is: ERC-8183 jobs are on a public
 * chain and anyone can already read this with a node. What the endpoint
 * does not do is decide whose job it is — it returns the funding wallet and
 * lets the caller compare, so the page can refuse to file somebody else's
 * job under your activity without pretending that is a secrecy boundary.
 *
 * Rate-limited because each call is an RPC round trip on infrastructure we
 * share with the sweep.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
): Promise<NextResponse> {
  const limited = consumeRateLimit(`job-lookup:${requestClientKey(request)}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!limited.allowed) {
    return NextResponse.json(
      { error: 'Too many lookups. Wait a moment and try again.' },
      { status: 429, headers: { 'retry-after': String(limited.retryAfterSeconds) } },
    );
  }

  const { jobId } = await context.params;
  if (!/^\d{1,18}$/.test(jobId)) {
    return NextResponse.json(
      { error: 'A job ID is a number, like 1372.' },
      { status: 400 },
    );
  }

  try {
    const onchain = await getErc8183Job(ALTANA_NETWORK, BigInt(jobId));

    /*
     * An id nobody has used reads back as a zero struct rather than an
     * error, so "no such job" and "someone else's job" arrive looking
     * identical. They are not: one is a typo and the other is a real job
     * that is not ours to hand over, and telling somebody their mistyped
     * id "exists on this contract" sends them looking for a job that was
     * never there.
     */
    const exists =
      onchain.client !== '0x0000000000000000000000000000000000000000';
    if (!exists) {
      return NextResponse.json(
        { error: `No job ${jobId} exists on this contract. Check the number.` },
        { status: 404 },
      );
    }

    const envelope = decodePokterJobEnvelope(onchain.description);

    /*
     * Jobs from other projects share this contract — 37 of the 41 expired
     * ones on it are not Pokter's. Importing one would put a job Pokter
     * cannot describe, track or settle into somebody's activity list.
     */
    if (!envelope) {
      return NextResponse.json(
        {
          error:
            'That job exists on this contract but was not commissioned through Pokter, so there is nothing here to recover.',
        },
        { status: 404 },
      );
    }

    const now = new Date().toISOString();
    const deliverableUrl = ['SUBMITTED', 'COMPLETED'].includes(onchain.statusName)
      ? await getErc8183DeliverableUrl(ALTANA_NETWORK, BigInt(jobId)).catch(
          () => null,
        )
      : null;

    /*
     * Built the same shape the backfill endpoint builds, from the same two
     * sources — the chain for state and the immutable envelope for
     * identity. Nothing the caller sent is trusted beyond the id.
     *
     * `hiredAt` is unknown from chain: the contract records when a job
     * expires, not when it was funded, and the window is a fixed 24h, so
     * the expiry minus that window is the funding moment.
     */
    const job: HiredJob = {
      id: `${ALTANA_NETWORK.chainId}:${jobId}`,
      jobId,
      chainId: ALTANA_NETWORK.chainId,
      isTestnet: IS_TESTNET,
      agentChainId: envelope.identity.chainId,
      agentTokenId: envelope.identity.tokenId,
      agentName: envelope.identity.name ?? `Agent #${envelope.identity.tokenId}`,
      providerLabel: envelope.providerLabel,
      provider: onchain.provider,
      task: envelope.task,
      budgetRaw: onchain.budget.toString(),
      expiredAt: new Date(Number(onchain.expiredAt) * 1000).toISOString(),
      hiredAt: new Date(
        Number(onchain.expiredAt) * 1000 - 24 * 60 * 60 * 1000,
      ).toISOString(),
      hireTxHash: null,
      status: onchain.statusName,
      statusCheckedAt: now,
      deliverableUrl: deliverableUrl ?? null,
      settleTxHash: null,
    };

    return NextResponse.json({ job, client: onchain.client });
  } catch (error) {
    return NextResponse.json(
      { error: `That job could not be read: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}
