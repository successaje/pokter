/**
 * Probe rows Pokter mismeasured, identified by rule, never deleted.
 *
 * Until 15 October the MCP probe sent `mcp-protocol-version: 2026-07-28` to
 * every MCP agent. An agent implementing an earlier revision answers 400 to
 * that, so three working HeyAnon agents (#43129, #45381, #45650 on chain 56)
 * were recorded as not answering across 262 probes each: a figure Pokter
 * measured itself, and wrong.
 *
 * A correction marks a row as Pokter's error and says why; the raw row
 * stays. Reads that feed availability and scores leave corrected rows out,
 * and the agent page says how many were excluded and why.
 *
 * The rule is narrow on purpose. A 400 can be the agent rejecting a bad
 * request, which is evidence about the agent, so a row is attributed to
 * Pokter only when all of this holds:
 *  - the agent's registry record declares an MCP revision other than the
 *    one the old probe sent, so the old probe asserted the wrong one;
 *  - the row is an MCP probe that got a 400;
 *  - the agent has answered the fixed probe since, which is what shows the
 *    400s were the header and not the agent. Before that first answer, every
 *    such 400 is corrected; an agent that has not answered since stays as
 *    measured: unknown is kept unknown.
 */

export interface CorrectableProbe {
  id: number;
  chainId: number;
  tokenId: string;
  protocol: string;
  ok: boolean;
  status: number | null;
  probedAt: string;
  corrected: boolean;
}

export interface ProbeCorrection {
  probeId: number;
  rule: string;
  reason: string;
}

export interface CorrectionRule {
  id: string;
  /** When the fixed probe was committed; corrected rows precede the agent's first answer after it. */
  fixedAt: string;
  /** What the old probe sent. */
  assertedVersion: string;
  reason: string;
}

export const MCP_REVISION_RULE: CorrectionRule = {
  id: 'mcp-revision-2026-10-15',
  fixedAt: '2026-10-15T09:32:00Z',
  assertedVersion: '2026-07-28',
  reason:
    'Pokter’s MCP probe sent protocol revision 2026-07-28 to an agent that declares an earlier one, and the agent refused the header with a 400. Fixed on 15 October; the agent has answered the corrected probe since.',
};

export interface AgentCorrectionPlan {
  chainId: number;
  tokenId: string;
  declaredVersion: string | null;
  /** Why nothing is corrected, when nothing is. */
  skipped: string | null;
  corrections: ProbeCorrection[];
  before: { probes: number; answered: number };
  after: { probes: number; answered: number };
}

/**
 * The corrections a rule makes, per agent, without writing anything.
 *
 * `declared` maps "chainId:tokenId" to the MCP revision the registry
 * record names (null when it names none).
 */
export function planMcpRevisionCorrections(
  rows: readonly CorrectableProbe[],
  declared: ReadonlyMap<string, string | null>,
  rule: CorrectionRule = MCP_REVISION_RULE,
): AgentCorrectionPlan[] {
  const byAgent = new Map<string, CorrectableProbe[]>();
  for (const row of rows) {
    if (row.protocol !== 'mcp') continue;
    const key = `${row.chainId}:${row.tokenId}`;
    byAgent.set(key, [...(byAgent.get(key) ?? []), row]);
  }

  const plans: AgentCorrectionPlan[] = [];
  for (const [key, agentRows] of byAgent) {
    const live = agentRows.filter((row) => !row.corrected);
    const refusals = live.filter((row) => !row.ok && row.status === 400);
    if (refusals.length === 0) continue;
    const [chainId, tokenId] = key.split(':');
    const declaredVersion = declared.get(key) ?? null;
    const count = (list: CorrectableProbe[]) => ({ probes: list.length, answered: list.filter((row) => row.ok).length });
    const plan = (skipped: string | null, corrections: ProbeCorrection[]): AgentCorrectionPlan => {
      const ids = new Set(corrections.map((c) => c.probeId));
      return { chainId: Number(chainId), tokenId, declaredVersion, skipped, corrections, before: count(live), after: count(live.filter((row) => !ids.has(row.id))) };
    };

    if (!declaredVersion || declaredVersion === rule.assertedVersion) {
      plans.push(plan(declaredVersion ? 'It declares the revision the old probe sent, so the 400s were not that header.' : 'Its registry record declares no MCP revision, so the 400s cannot be attributed to the header.', []));
      continue;
    }
    const firstAnswer = live
      .filter((row) => row.ok && row.probedAt >= rule.fixedAt)
      .map((row) => row.probedAt)
      .sort()[0];
    if (!firstAnswer) {
      plans.push(plan('It has not answered the corrected probe yet, so its 400s may be its own.', []));
      continue;
    }
    plans.push(
      plan(
        null,
        refusals
          .filter((row) => row.probedAt < firstAnswer)
          .map((row) => ({ probeId: row.id, rule: rule.id, reason: rule.reason })),
      ),
    );
  }
  return plans.sort((a, b) => b.corrections.length - a.corrections.length);
}
