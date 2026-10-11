import { NextResponse } from 'next/server';

import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { EVIDENCE_AGENT, quoteTermsFor } from '@/lib/evidence/agent';
import { siteOrigin } from '@/lib/evidence/origin';
import { evidenceFor, parseAgentRef } from '@/lib/evidence/report';
import { EVIDENCE_CHAINS } from '@/lib/evidence/refs';
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
     * Priced against the caller's own escrow chain, defaulting to the one
     * the request names rather than the one Pokter happens to settle on.
     * A quote in the wrong chain's token verifies and can never be paid.
     */
    const asked = Number(data.chain_id ?? data.chainId);
    const chainId = (EVIDENCE_CHAINS as number[]).includes(asked)
      ? (asked as ChainId)
      : (EVIDENCE_CHAINS[0] as ChainId);
    return reply(id, {
      accepted: true,
      skill: EVIDENCE_AGENT.skillId,
      terms: quoteTermsFor(chainId, correctedErc8183Addresses(chainId).paymentToken),
      note: 'Pokter reports what it measured. It does not rank agents and does not assess whether an agent’s work is correct.',
    });
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
