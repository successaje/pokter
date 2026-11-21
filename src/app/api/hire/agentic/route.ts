import { NextResponse } from 'next/server';
import { buildHireCalls } from '@altananetwork/sdk';
import { createPublicClient, getAddress, isAddress, type Address } from 'viem';
import { bsc } from 'viem/chains';

import { POST as jobsIndexRoute } from '@/app/api/jobs/index/route';
import { POST as notifyFundedRoute } from '@/app/api/notify-funded/route';
import { POST as quoteForBriefRoute } from '@/app/api/hire/quote/route';
import type { PreparedHire } from '@/lib/assistant/hire-request';
import { readTransport } from '@/lib/chain/rpc';
import { publicReadUrls } from '@/lib/chain/transport';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { getJobStore } from '@/lib/erc8183/store';
import { AGENTIC_CHAIN_ID, nextAgenticCall, type AgenticNext, type AgenticQuote, type AgenticReader, type AgenticTerms } from '@/lib/hire/agentic';
import { logAndPublic } from '@/lib/api/public-error';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 40;

/**
 * The next call of a prepared hire, for a wallet that signs one call at a
 * time after its owner sees a preview: an Agentic Wallet, driven through
 * its CLI by the owner's own assistant (`lib/hire/agentic.ts`).
 *
 * Unsigned, and for the owner's own wallet to preview and approve. Pokter
 * holds no key and sends nothing: the wallet simulates each call and shows
 * its owner what it does before they approve it. Kept off the MCP tool list
 * on purpose, so no tool there ever returns a transaction.
 *
 * Read from the chain on every request, so asking again after a call landed
 * moves to the next one, and asking again after one failed offers it again.
 * Once the job is funded, Pokter indexes it against the request and tells
 * the agent, through the same routes the browser hire uses.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`hire-agentic:${requestClientKey(request)}`, { limit: 30, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Wait a moment and try again.' }, { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const key = typeof body?.requestKey === 'string' ? body.requestKey : '';
  const wallet = typeof body?.wallet === 'string' ? body.wallet : '';
  const jobId = typeof body?.jobId === 'string' || typeof body?.jobId === 'number' ? String(body.jobId) : null;
  const searchFrom = typeof body?.searchFrom === 'string' || typeof body?.searchFrom === 'number' ? String(body.searchFrom) : null;
  if (!/^phr_[0-9a-f]{32}$/.test(key) || !isAddress(wallet, { strict: false }) || (jobId !== null && !/^\d{1,18}$/.test(jobId)) || (searchFrom !== null && !/^\d{1,18}$/.test(searchFrom))) {
    return NextResponse.json({ error: 'requestKey (from prepare_hire) and wallet are required; jobId and searchFrom are optional numbers.' }, { status: 400 });
  }

  const record = getJobStore().preparedHire(key);
  if (!record) return NextResponse.json({ error: 'No prepared hire has that key. Prepare the hire first.' }, { status: 404 });
  if (record.chainId !== AGENTIC_CHAIN_ID) {
    return NextResponse.json(stopped(`This hire was prepared to fund on chain ${record.chainId}. An Agentic Wallet funds hires on BNB Smart Chain mainnet (56): prepare it again for chain 56.`));
  }
  let prepared: PreparedHire;
  try {
    prepared = JSON.parse(record.request) as PreparedHire;
  } catch {
    return NextResponse.json({ error: 'The prepared hire could not be read. Prepare it again.' }, { status: 409 });
  }

  const terms: AgenticTerms = {
    agent: { chainId: record.agentChainId, tokenId: record.agentTokenId, name: prepared.agent.name, category: prepared.agent.category },
    provider: getAddress(record.provider),
    providerLabel: prepared.terms.provider.label,
    task: record.task,
    token: { address: getAddress(record.token), symbol: prepared.terms.token.symbol, decimals: prepared.terms.token.decimals },
    amountRaw: BigInt(record.amountRaw),
    owner: record.owner && isAddress(record.owner, { strict: false }) ? getAddress(record.owner) : null,
    jobId: record.jobId,
  };
  const addresses = correctedErc8183Addresses(AGENTIC_CHAIN_ID);
  const passed: Record<string, string> = Object.fromEntries(
    ['fly-client-ip', 'x-forwarded-for', 'user-agent', 'x-forwarded-host', 'x-forwarded-proto'].flatMap((header) =>
      request.headers.get(header) ? [[header, request.headers.get(header) as string]] : [],
    ),
  );
  const inner = (path: string, payload: unknown) =>
    new Request(new URL(path, new URL(request.url).origin).href, { method: 'POST', headers: { ...passed, 'content-type': 'application/json' }, body: JSON.stringify(payload) });

  try {
    const next = await nextAgenticCall({
      terms,
      wallet: getAddress(wallet),
      addresses: addresses as never,
      reader: chainReader(addresses as never),
      freshQuote: () => freshQuote(terms, inner),
      buildDefaultCalls: buildHireCalls as never,
      jobId: jobId ? BigInt(jobId) : null,
      searchFrom: searchFrom ? BigInt(searchFrom) : null,
    });
    if (next.state === 'call') {
      return NextResponse.json({
        ...next,
        call: { binanceChainId: String(AGENTIC_CHAIN_ID), ...next.call },
        preview: `baw contract-call preview --binanceChainId ${AGENTIC_CHAIN_ID} --from ${getAddress(wallet)} --to ${next.call.to} --value 0 --inputData ${next.call.data} --json`,
      });
    }
    if (next.state === 'funded' && !record.jobId) {
      /* The first time this request is seen funded: index it against the request and tell the agent, as the browser does. */
      const indexed = await jobsIndexRoute(inner('/api/jobs/index', { chainId: AGENTIC_CHAIN_ID, jobId: next.jobId, requestKey: key }));
      const notified = await notifyFundedRoute(
        inner('/api/notify-funded', { agentChainId: record.agentChainId, tokenId: record.agentTokenId, jobId: next.jobId, provider: record.provider, escrowChainId: AGENTIC_CHAIN_ID }),
      );
      return NextResponse.json({ ...next, indexed: indexed.ok, agentNotified: notified.ok });
    }
    return NextResponse.json(next);
  } catch (error) {
    return NextResponse.json({ error: `The next call could not be worked out: ${logAndPublic('hire/agentic', error)}` }, { status: 502 });
  }
}

function stopped(reason: string): AgenticNext {
  return { state: 'stopped', jobId: null, reason };
}

/* The agent's price for exactly the prepared brief, asked afresh through the route every hire uses. */
async function freshQuote(terms: AgenticTerms, inner: (path: string, payload: unknown) => Request): Promise<AgenticQuote | { error: string }> {
  const response = await quoteForBriefRoute(
    inner('/api/hire/quote', { chainId: terms.agent.chainId, tokenId: terms.agent.tokenId, task: terms.task, category: terms.agent.category, escrowChainId: AGENTIC_CHAIN_ID, preferredToken: terms.token.address }),
  );
  const body = (await response.json().catch(() => ({}))) as {
    quote?: { negotiationHash: string; providerSignature: string; priceRaw: string; currency: string; expiresAt: string | null; domain: { chainId: number; verifyingContract: string } | null; anchor?: Record<string, unknown> | null };
    escrowChainId?: number;
    task?: string;
    error?: string;
  };
  if (!response.ok || !body.quote) return { error: body.error ?? 'The agent did not return a signed price for this brief. Nothing was sent.' };
  const q = body.quote;
  const expiresAt = q.expiresAt ? Math.floor(Date.parse(q.expiresAt) / 1000) : undefined;
  const domain = q.domain ? { chainId: q.domain.chainId, verifyingContract: getAddress(q.domain.verifyingContract) } : undefined;
  return {
    quote: { negotiationHash: q.negotiationHash, providerSignature: q.providerSignature, priceRaw: q.priceRaw, expiresAt, domain, anchor: q.anchor ?? undefined },
    intent: {
      provider: terms.provider,
      task: body.task ?? terms.task,
      amountRaw: q.priceRaw,
      currency: q.currency as Address,
      chainId: body.escrowChainId ?? domain?.chainId ?? Number.NaN,
      verifyingContract: domain?.verifyingContract ?? null,
      expiresAt: expiresAt ?? null,
      negotiationHash: q.negotiationHash,
    },
  };
}

const COMMERCE_ABI = [
  { name: 'jobCounter', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'jobPaymentToken', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
  {
    name: 'getJob', type: 'function', stateMutability: 'view', inputs: [{ name: 'jobId', type: 'uint256' }],
    outputs: [{ type: 'tuple', components: [
      { name: 'id', type: 'uint256' }, { name: 'client', type: 'address' }, { name: 'provider', type: 'address' }, { name: 'evaluator', type: 'address' },
      { name: 'description', type: 'string' }, { name: 'budget', type: 'uint256' }, { name: 'expiredAt', type: 'uint256' }, { name: 'status', type: 'uint8' },
      { name: 'hook', type: 'address' }, { name: 'submittedAt', type: 'uint256' }, { name: 'deliverable', type: 'bytes32' },
    ] }],
  },
] as const;
const ROUTER_ABI = [{ name: 'jobPolicy', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] }] as const;
const POLICY_ABI = [{ name: 'disputeWindow', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint64' }] }] as const;
const ERC20_ABI = [
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

function chainReader(addresses: { commerce: Address; router: Address; policy: Address }): AgenticReader {
  const client = createPublicClient({ chain: bsc, transport: readTransport(AGENTIC_CHAIN_ID, publicReadUrls(AGENTIC_CHAIN_ID, process.env.BSC_MAINNET_RPC_URL)) });
  return {
    jobCounter: () => client.readContract({ address: addresses.commerce, abi: COMMERCE_ABI, functionName: 'jobCounter' }),
    job: (jobId) => client.readContract({ address: addresses.commerce, abi: COMMERCE_ABI, functionName: 'getJob', args: [jobId] }),
    jobPolicy: (jobId) => client.readContract({ address: addresses.router, abi: ROUTER_ABI, functionName: 'jobPolicy', args: [jobId] }),
    jobToken: (jobId) => client.readContract({ address: addresses.commerce, abi: COMMERCE_ABI, functionName: 'jobPaymentToken', args: [jobId] }),
    allowance: (token, owner, spender) => client.readContract({ address: token, abi: ERC20_ABI, functionName: 'allowance', args: [owner, spender] }),
    balance: (token, owner) => client.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [owner] }),
    disputeWindow: async () => Number(await client.readContract({ address: addresses.policy, abi: POLICY_ABI, functionName: 'disputeWindow' })),
  };
}
