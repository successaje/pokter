import { NextResponse } from 'next/server';
import { isAddress } from 'viem';

import {
  hireAgent,
  listJobs,
  refreshJob,
  settleJob,
  InsufficientPaymentTokenError,
} from '@/lib/erc8183/hire';
import { AltanaNotConfiguredError, IS_TESTNET } from '@/lib/altana/client';

export const dynamic = 'force-dynamic';
/** Hiring batches five contract calls through the relay and waits for FUNDED. */
export const maxDuration = 180;

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ jobs: listJobs(), isTestnet: IS_TESTNET });
}

/** Commission a job against an ERC-8183 seller. */
export async function POST(request: Request): Promise<NextResponse> {
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

  try {
    const job = await hireAgent({
      provider,
      task,
      agentName: agentName || 'Unnamed agent',
      agentTokenId: agentTokenId || 'unknown',
      budgetU,
    });
    return NextResponse.json({ job });
  } catch (error) {
    if (error instanceof InsufficientPaymentTokenError) {
      return NextResponse.json(
        { error: error.message, held: error.held, required: error.required },
        { status: 402 },
      );
    }
    if (error instanceof AltanaNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: `Hire failed: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}

/** Refresh a job's status from chain, or settle it. */
export async function PATCH(request: Request): Promise<NextResponse> {
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
