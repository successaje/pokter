import { NextRequest, NextResponse } from 'next/server';
import {
  buildSubmitCall,
  encodeErc8183Manifest,
  erc8183ManifestHash,
  getErc8183Job,
  verifyErc8183ManifestText,
  type Erc8183DeliverableManifest,
} from '@altananetwork/sdk';
import { createPublicClient, getAddress, http, isHash, isHex, stringToHex, verifyMessage, type Hex } from 'viem';

import { ALTANA_NETWORK } from '@/lib/altana/client';
import { BUILDER_SESSION_COOKIE, builderSessionOwner } from '@/lib/builders/store';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import {
  consumeDeliveryChallenge,
  createDeliveryChallenge,
  readDeliverable,
  readDeliveryChallenge,
  writeDeliverable,
} from '@/lib/erc8183/deliverables';
import { getJobStore } from '@/lib/erc8183/store';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { getAgent } from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';

export const dynamic = 'force-dynamic';

function deliveryUrl(jobId: string, deliverable: Hex) {
  const url = new URL(`/api/seller/deliverables/${jobId}`, process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:4311');
  url.searchParams.set('hash', deliverable);
  return url.href;
}

async function ownedJob(owner: `0x${string}`, jobId: string) {
  const job = getJobStore().byId(`${ALTANA_NETWORK.chainId}:${jobId}`);
  if (!job) return null;
  const agent = await getAgent((job.agentChainId ?? 56) as ChainId, job.agentTokenId);
  return getAddress(agent.owner_address) === getAddress(owner) ? job : null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rate = consumeRateLimit(`builder-delivery:${requestClientKey(request)}`, { limit: 12, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Delivery request limit reached. Try again shortly.' }, { status: 429 });
  const owner = builderSessionOwner(request.cookies.get(BUILDER_SESSION_COOKIE)?.value);
  if (!owner) return NextResponse.json({ error: 'Builder verification is required.' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 }); }
  const action = String(body.action ?? '');
  const jobId = String(body.jobId ?? '');
  if (!/^\d+$/.test(jobId) || BigInt(jobId) > BigInt(Number.MAX_SAFE_INTEGER)) return NextResponse.json({ error: 'A valid numeric job id is required.' }, { status: 400 });
  const indexed = await ownedJob(owner, jobId).catch(() => null);
  if (!indexed) return NextResponse.json({ error: 'This job is not attributed to a verified agent in this workspace.' }, { status: 403 });

  try {
    const onchain = await getErc8183Job(ALTANA_NETWORK, BigInt(jobId));
    if (getAddress(onchain.provider) !== getAddress(indexed.provider)) {
      return NextResponse.json({ error: 'The indexed provider no longer matches the onchain job.' }, { status: 409 });
    }
    if (action === 'challenge') {
      if (onchain.statusName !== 'FUNDED') return NextResponse.json({ error: `Job is ${onchain.statusName}, not FUNDED.` }, { status: 409 });
      if (onchain.expiredAt <= BigInt(Math.floor(Date.now() / 1000))) return NextResponse.json({ error: 'This job has passed its delivery deadline.' }, { status: 409 });
      const challenge = createDeliveryChallenge(jobId, getAddress(onchain.provider));
      return NextResponse.json({ challengeId: challenge.id, message: challenge.message, provider: challenge.provider });
    }
    if (action === 'prepare') {
      const challenge = readDeliveryChallenge(String(body.challengeId ?? ''));
      const signature = String(body.signature ?? '');
      const content = String(body.content ?? '').trim();
      if (!challenge || challenge.jobId !== jobId || !isHex(signature)) {
        return NextResponse.json({ error: 'The provider challenge expired or is invalid.' }, { status: 409 });
      }
      if (content.length < 3 || content.length > 20_000) {
        return NextResponse.json({ error: 'Deliverable content must be between 3 and 20,000 characters.' }, { status: 400 });
      }
      if (onchain.statusName !== 'FUNDED' || getAddress(challenge.provider) !== getAddress(onchain.provider)) {
        return NextResponse.json({ error: 'The funded job changed after authorization began.' }, { status: 409 });
      }
      if (!(await verifyMessage({ address: onchain.provider, message: challenge.message, signature: signature as Hex }))) {
        return NextResponse.json({ error: 'The signature was not produced by this job provider.' }, { status: 403 });
      }
      if (!consumeDeliveryChallenge(challenge.id)) return NextResponse.json({ error: 'The provider challenge was already used.' }, { status: 409 });
      const addresses = correctedErc8183Addresses(ALTANA_NETWORK.chainId);
      const manifest: Erc8183DeliverableManifest = {
        version: 1,
        job_id: Number(jobId),
        chain_id: ALTANA_NETWORK.chainId,
        contracts: { commerce: addresses.commerce, router: addresses.router, policy: addresses.policy },
        response: { content, content_type: 'text/plain; charset=utf-8' },
        metadata: { producer: 'Pokter verified provider', prepared_at: new Date().toISOString() },
      };
      const manifestText = encodeErc8183Manifest(manifest);
      const createdAt = new Date().toISOString();
      writeDeliverable({ jobId, manifestText, submitTxHash: null, createdAt });
      const deliverable = erc8183ManifestHash(manifest);
      return NextResponse.json({ deliverable, deliverableUrl: deliveryUrl(jobId, deliverable), createdAt });
    }
    if (action === 'confirm') {
      const transactionHash = String(body.transactionHash ?? '');
      if (!isHash(transactionHash)) {
        return NextResponse.json({ error: 'A transaction hash is required.' }, { status: 400 });
      }
      if (onchain.statusName !== 'SUBMITTED') return NextResponse.json({ error: 'The chain does not show a submitted delivery yet.' }, { status: 409 });
      const stored = readDeliverable(jobId);
      if (!stored || !verifyErc8183ManifestText(stored.manifestText, onchain.deliverable)) {
        return NextResponse.json({ error: 'The hosted manifest does not match the onchain delivery hash.' }, { status: 409 });
      }
      const rpc = createPublicClient({ chain: ALTANA_NETWORK.chain, transport: http(ALTANA_NETWORK.publicRpcUrl) });
      const [receipt, transaction] = await Promise.all([
        rpc.getTransactionReceipt({ hash: transactionHash as Hex }),
        rpc.getTransaction({ hash: transactionHash as Hex }),
      ]);
      if (receipt.status !== 'success' || !receipt.to || getAddress(receipt.to) !== getAddress(correctedErc8183Addresses(ALTANA_NETWORK.chainId).commerce)) {
        return NextResponse.json({ error: 'The supplied transaction is not a successful commerce submission.' }, { status: 409 });
      }
      const expectedUrl = deliveryUrl(jobId, onchain.deliverable);
      const expectedCall = buildSubmitCall({
        addresses: correctedErc8183Addresses(ALTANA_NETWORK.chainId), jobId: BigInt(jobId),
        deliverable: onchain.deliverable,
        optParams: stringToHex(JSON.stringify({ deliverable_url: expectedUrl })),
      });
      if (getAddress(transaction.from) !== getAddress(onchain.provider) || transaction.input.toLowerCase() !== expectedCall.data?.toLowerCase()) {
        return NextResponse.json({ error: 'The supplied transaction does not encode this provider delivery.' }, { status: 409 });
      }
      indexed.status = 'SUBMITTED';
      indexed.statusCheckedAt = new Date().toISOString();
      indexed.deliverableUrl = expectedUrl;
      getJobStore().record(indexed);
      writeDeliverable({ ...stored, submitTxHash: transactionHash as Hex });
      return NextResponse.json({ confirmed: true, status: 'SUBMITTED' });
    }
    return NextResponse.json({ error: 'Unknown delivery action.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: `Delivery verification failed: ${(error as Error).message}` }, { status: 502 });
  }
}
