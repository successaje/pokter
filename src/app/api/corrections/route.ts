import { NextResponse } from 'next/server';

import { MCP_REVISION_RULE, planMcpRevisionCorrections } from '@/lib/history/corrections';
import { getProbeStore } from '@/lib/history/store';
import { getAgent } from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Plan, and only on request apply, corrections to Pokter's own probe history.
 *
 * Operator-only, behind the sweep's secret. A dry run is the default and
 * writes nothing: it lists, per agent, the rows the rule would mark, why
 * any agent is left alone, and its answered/probes before and after. Only
 * `{"apply": true}` writes, and then only correction marks: no probe row is
 * edited or deleted, so applying is reversible by deleting the marks.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.SWEEP_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { rule?: unknown; apply?: unknown };
  if (body.rule !== MCP_REVISION_RULE.id) {
    return NextResponse.json({ error: `Unknown rule. The only rule is "${MCP_REVISION_RULE.id}".` }, { status: 400 });
  }

  const store = getProbeStore();
  const rows = store.correctableMcpRows();
  const candidates = [...new Set(rows.filter((row) => !row.ok && row.status === 400 && !row.corrected).map((row) => `${row.chainId}:${row.tokenId}`))];

  // What each candidate's registry record declares, read now.
  const declared = new Map<string, string | null>();
  const unreadable: string[] = [];
  for (const key of candidates) {
    const [chainId, tokenId] = key.split(':');
    const agent = await getAgent(Number(chainId) as ChainId, tokenId).catch(() => null);
    if (!agent) {
      unreadable.push(key);
      continue;
    }
    const version = (agent.services?.mcp as { version?: unknown } | undefined)?.version;
    declared.set(key, typeof version === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(version) ? version : null);
  }

  // An agent whose record could not be read is left out of the plan, not guessed.
  const plans = planMcpRevisionCorrections(rows.filter((row) => !unreadable.includes(`${row.chainId}:${row.tokenId}`)), declared);
  const corrections = plans.flatMap((plan) => plan.corrections);
  const applied = body.apply === true ? store.applyCorrections(corrections) : 0;

  return NextResponse.json({
    rule: MCP_REVISION_RULE,
    mode: body.apply === true ? 'applied' : 'dry-run',
    rowsToCorrect: corrections.length,
    applied,
    unreadable,
    agents: plans.map(({ corrections: list, ...plan }) => ({ ...plan, corrections: list.length, firstProbeId: list[0]?.probeId ?? null })),
  });
}
