import { NextResponse } from 'next/server';
import { isAddress } from 'viem';

import { encodePokterJobEnvelope } from '@/lib/erc8183/job-envelope';

import {
  hireAgent,
  listJobs,
  refreshJob,
  settleJob,
  InsufficientPaymentTokenError,
  BriefNotDeliverableError,
} from '@/lib/erc8183/hire';
import { AltanaNotConfiguredError, IS_TESTNET } from '@/lib/altana/client';
import { requireDemoWriteAccess } from '@/lib/security/demo-write';
import { registryIdentityFrom } from '@/lib/hire/registry-identity';
import { briefRefusalBody } from '@/lib/erc8183/skill-request';

export const dynamic = 'force-dynamic';
/** Hiring batches five contract calls through the relay and waits for FUNDED. */
export const maxDuration = 180;

export async function GET(request: Request): Promise<NextResponse> {
  const denied = requireDemoWriteAccess(request);
  if (denied) return denied;
  return NextResponse.json({ jobs: listJobs(), isTestnet: IS_TESTNET });
}

/** Commission a job against an ERC-8183 seller. */
export async function POST(request: Request): Promise<NextResponse> {
  const denied = requireDemoWriteAccess(request);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const provider = String(body.provider ?? '');
  const task = String(body.task ?? '');
  const agentName = String(body.agentName ?? '');
  const agentTokenId = String(body.agentTokenId ?? '');
  const budgetU = Number(body.budgetU ?? 0);

  if (!isAddress(provider)) {
    return NextResponse.json(
      { error: 'provider must be a valid address.' },
      { status: 400 },
    );
  }

  // The kernel caps descriptions at 4096 bytes; reject here so the failure is
  // legible rather than arriving as an opaque revert.
  if (!task || Buffer.byteLength(task, 'utf8') > 4096) {
    return NextResponse.json(
      { error: 'task is required and must be at most 4096 bytes.' },
      { status: 400 },
    );
  }

  if (!Number.isFinite(budgetU) || budgetU <= 0 || budgetU > 5) {
    return NextResponse.json(
      { error: 'budgetU must be between 0 and 5.' },
      { status: 400 },
    );
  }

  /*
   * The description that goes on chain.
   *
   * Written as a `pokter-job` envelope whenever the caller names a real
   * ERC-8004 registration, because a raw description is not readable by
   * any agent Pokter lists: the house agents refuse a funded job with
   * "The job carries no readable brief", and nothing indexes it. This
   * route could therefore only ever hire a seller that reads raw text,
   * which is not what an operator-funded testnet hire is for.
   *
   * The raw fallback stays for exactly that seller — the unregistered
   * reference one, hired with a non-numeric token id.
   */
  const identity = registryIdentityFrom(body);
  let description: string | undefined;
  if (identity) {
    try {
      description = encodePokterJobEnvelope({
        identityChainId: identity.identityChainId,
        agentTokenId,
        agentName: agentName || undefined,
        category: String(body.category ?? '').trim() || 'Uncategorised',
        provider,
        task,
      });
    } catch (error) {
      return NextResponse.json({ error: `Envelope rejected: ${(error as Error).message}` }, { status: 400 });
    }
    /*
     * The kernel's 4096-byte cap applies to what actually goes on chain,
     * which is now the envelope rather than the task. Checking only the
     * task would let a brief just under the limit become a description
     * just over it, and arrive as an opaque revert.
     */
    if (Buffer.byteLength(description, 'utf8') > 4096) {
      return NextResponse.json(
        { error: 'The brief is too long once wrapped for on-chain storage. Shorten it.' },
        { status: 400 },
      );
    }
  }

  try {
    const job = await hireAgent({
      provider,
      task,
      description,
      agentName: agentName || 'Unnamed agent',
      agentTokenId: agentTokenId || 'unknown',
      budgetU,
      /*
       * The registration the envelope was written for, passed on.
       *
       * Without it the row stores a NULL registry chain — the defect
       * `HireInput` documents — and `hireAgent` cannot read the agent's
       * skills, so the brief preflight could not run on the very path that
       * funded job 1585. The same `identity` both uses, so the envelope's
       * registration and the preflight's are one registration.
       */
      ...(identity ? { agentChainId: identity.identityChainId } : {}),
    });
    return NextResponse.json({ job });
  } catch (error) {
    if (error instanceof BriefNotDeliverableError) {
      /* The brief is the thing to fix, so it is an input refusal and not a
         gateway failure — the same shape the quote route returns. */
      return NextResponse.json(
        briefRefusalBody({ message: error.message, code: error.code, skill: error.skill, candidates: error.candidates, questions: error.questions }),
        { status: 400 },
      );
    }
    if (error instanceof InsufficientPaymentTokenError) {
      return NextResponse.json(
        { error: error.message, held: error.held, required: error.required },
        { status: 402 },
      );
    }
    if (error instanceof AltanaNotConfiguredError) {
      // The message names secrets; it belongs in the log, not the reply.
      console.error(error.message);
      return NextResponse.json({ error: 'Escrow is not configured on this server.' }, { status: 503 });
    }
    return NextResponse.json(
      { error: `Hire failed: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}

/** Refresh a job's status from chain, or settle it. */
export async function PATCH(request: Request): Promise<NextResponse> {
  const denied = requireDemoWriteAccess(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const action = url.searchParams.get('action') ?? 'refresh';

  if (!id) {
    return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  }

  try {
    if (action === 'refresh') {
      return NextResponse.json({ job: await refreshJob(id) });
    }
    if (action === 'approve' || action === 'dispute') {
      return NextResponse.json({ job: await settleJob(id, action) });
    }
    return NextResponse.json(
      { error: 'action must be refresh, approve or dispute.' },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: `${action} failed: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}
