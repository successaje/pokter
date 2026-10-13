import { NextResponse } from 'next/server';

import { EVIDENCE_AGENT, evidenceCard } from '@/lib/evidence/agent';
import { deliverEvidenceJob } from '@/lib/evidence/deliver';
import { signEvidenceQuote } from '@/lib/evidence/negotiate';
import { siteOrigin } from '@/lib/evidence/origin';
import { evidenceFor, parseAgentRef } from '@/lib/evidence/report';
import { EVIDENCE_CHAINS, evidenceChain, quoteChainFor } from '@/lib/evidence/refs';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import type { ChainId } from '@/lib/scan/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

/**
 * The evidence agent's A2A endpoint: negotiate, then answer.
 *
 * Two skills over one JSON-RPC method, which is what the A2A shape gives
 * you. `negotiate` returns terms priced in the escrow token of whichever
 * chain the caller settles on; `agent_evidence` returns the report.
 *
 * Deliberately readable without a funded job. Pokter's own argument is
 * that a claim you cannot check is worth nothing, so an evidence service
 * that refused to demonstrate itself before payment would be arguing
 * against itself. The quote exists because marketplaces expect one, not
 * because the data is withheld.
 */
function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function rpcError(id: unknown, code: number, message: string, status = 400) {
  return NextResponse.json({ jsonrpc: '2.0', id, error: { code, message } }, { status });
}

function reply(id: unknown, data: unknown) {
  return NextResponse.json({
    jsonrpc: '2.0',
    id,
    result: {
      kind: 'message',
      role: 'agent',
      messageId: crypto.randomUUID(),
      parts: [{ kind: 'data', data }],
    },
  });
}

/**
 * A GET here returns the card, rather than 405.
 *
 * The A2A convention is that a registry's service endpoint points at the
 * agent card, and the card names the JSON-RPC url. Register the JSON-RPC
 * url by mistake and a prober's opening GET gets "method not allowed",
 * which it reports as an endpoint that does not answer and an agent with
 * no skills — a listing failure that looks like a broken agent and is
 * actually one wrong field.
 *
 * That mistake was made registering this very agent, which is reason
 * enough to make either URL work. Answering with the card costs nothing
 * and is true: this is where the agent lives, and the card says what it
 * can do.
 */
export async function GET(request: Request): Promise<NextResponse> {
  return NextResponse.json(evidenceCard(siteOrigin(), evidenceChain(new URL(request.url).searchParams.get('chain')) ?? undefined), {
    headers: { 'cache-control': 'public, max-age=300' },
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`evidence:${requestClientKey(request)}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Evidence request limit reached.' },
      { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected JSON-RPC JSON.' }, { status: 400 });
  }

  const id = body.id ?? null;
  if (body.jsonrpc !== '2.0' || body.method !== 'message/send') {
    return rpcError(id, -32601, 'Only message/send is supported.');
  }

  const params = object(body.params);
  const message = object(params?.message);
  const parts = Array.isArray(message?.parts) ? message.parts : [];
  const data = parts.map((part) => object(object(part)?.data)).find(Boolean) ?? {};
  const text = parts
    .map((part) => object(part))
    .find((part) => part?.kind === 'text')?.text;

  const skill = String(data.skill ?? EVIDENCE_AGENT.skillId);

  if (skill === 'negotiate' || skill === 'quote') {
    /*
     * Priced against the caller's own escrow chain, and signed.
     *
     * Unsigned terms would fail Pokter's own listing check and every
     * other marketplace that follows the same convention: a price is only
     * a price when it recovers to the registered agent wallet. The chain
     * comes from the request because one agent listed across marketplaces
     * that settle differently cannot hold a single currency.
     */
    const chainId = quoteChainFor({
      chainId: data.chain_id ?? data.chainId,
      escrowChains: data.escrow_chains,
      endpointChain: new URL(request.url).searchParams.get('chain'),
    });
    const askedTerms = object(data.terms);
    try {
      const quote = await signEvidenceQuote({
        chainId,
        taskDescription: String(data.task_description ?? text ?? 'Quote an evidence report.'),
        deliverables:
          typeof askedTerms?.deliverables === 'string' ? askedTerms.deliverables : undefined,
        qualityStandards:
          typeof askedTerms?.quality_standards === 'string'
            ? askedTerms.quality_standards
            : undefined,
      });
      return reply(id, {
        ...quote,
        note: 'Pokter reports what it measured. It does not rank agents and does not assess whether an agent’s work is correct.',
      });
    } catch (error) {
      /*
       * Most likely the operator key is absent, or this purpose is not
       * permitted on mainnet. Said plainly rather than as a refusal to
       * quote, because the two mean different things to a caller.
       */
      return rpcError(
        id,
        -32603,
        `Cannot sign a quote right now: ${(error as Error).message}`,
        503,
      );
    }
  }

  if (skill === 'notify_funded') {
    /*
     * Pokter says a job naming this agent has been funded. Nothing in
     * the message is trusted: `deliverEvidenceJob` re-reads the escrow
     * and refuses anything that is not funded, does not name this
     * agent's own wallet as provider, or carries no readable brief.
     */
    const jobId = String(data.job_id ?? data.jobId ?? '');
    /*
     * No default chain here, unlike a quote.
     *
     * Quoting falls back to this agent's first chain because the worst
     * case is a price in the wrong currency, which the buyer can read
     * before paying. Delivering sends a transaction, so an unnamed or
     * unrecognised chain is refused rather than guessed at: the guess
     * would spend gas looking for somebody else's job number on a chain
     * nobody asked about.
     */
    const chainId =
      evidenceChain(data.chain_id ?? data.chainId) ??
      evidenceChain(new URL(request.url).searchParams.get('chain'));
    if (chainId === null) {
      return reply(id, {
        accepted: false,
        job_id: jobId,
        reason: `Name the escrow chain the job was funded on (${EVIDENCE_CHAINS.join(' or ')}). A delivery is a transaction and is not sent on a guess.`,
      });
    }
    try {
      const outcome = await deliverEvidenceJob(chainId, jobId);
      if (outcome.status === 'refused') {
        return reply(id, { accepted: false, job_id: jobId, reason: outcome.reason });
      }
      return reply(id, {
        accepted: true,
        job_id: outcome.jobId,
        deliverable_url: outcome.deliverableUrl,
        transaction_hash: outcome.status === 'delivered' ? outcome.transactionHash : null,
        already_delivered: outcome.status === 'already-delivered',
      });
    } catch (error) {
      /*
       * A failure here may have spent gas, so it is reported as a
       * failure to deliver rather than a refusal to try.
       */
      return rpcError(id, -32603, `Delivery did not complete: ${(error as Error).message}`, 503);
    }
  }

  if (skill !== EVIDENCE_AGENT.skillId) {
    return rpcError(id, -32601, `Unknown skill "${skill}".`);
  }

  const raw = String(data.agent ?? data.agent_id ?? data.query ?? text ?? '').trim();
  if (!raw) {
    return rpcError(
      id,
      -32602,
      'Name an agent, for example "56/303779" or "eip155:97:2554".',
    );
  }

  const ref = parseAgentRef(raw, EVIDENCE_CHAINS[0] as ChainId);
  if (!ref) {
    return rpcError(
      id,
      -32602,
      `Could not read "${raw}" as an agent on chain ${EVIDENCE_CHAINS.join(' or ')}.`,
    );
  }

  try {
    const report = await evidenceFor(ref.chainId, ref.tokenId, siteOrigin().origin);
    return reply(id, report);
  } catch {
    /*
     * An agent Pokter cannot find is a fact about the registry, reported
     * as such. Returning an error here would let a caller read "not
     * found" as "failed", which is the conflation this service exists
     * to undo.
     */
    return reply(id, {
      found: false,
      agent: { chainId: ref.chainId, tokenId: ref.tokenId },
      source: `No ERC-8004 record for #${ref.tokenId} on chain ${ref.chainId}, or the registry did not answer.`,
      caveats: [
        'Absence of a record is not a judgement about an agent. It means Pokter has nothing to report.',
      ],
    });
  }
}
