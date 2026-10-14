import 'server-only';

import { agentHistory } from '@/lib/agent/credited-history';
import { deriveMaturity, type AgentMaturity } from '@/lib/agents/maturity';
import { getAssayStore, type AssayRun } from '@/lib/assay/store';
import { assayForCategory, type AssayDefinition } from '@/lib/assay/catalog';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import type { AgentEconomicHistory } from '@/lib/erc8183/economic-history';
import { quotePayableWith } from '@/lib/erc8183/payable';
import { getJobStore } from '@/lib/erc8183/store';
import type { AgentDossier } from '@/lib/marketplace';
import { escrowOptionsForHire } from '@/lib/network/escrow';

export interface DossierLadder {
  maturity: AgentMaturity;
  /** Whether the escrow on `escrowChain` settles in the quoted token; null with no quote. */
  payable: boolean | null;
  history: AgentEconomicHistory;
  categoryCheck: { definition: AssayDefinition; run: AssayRun | null } | null;
}

/**
 * The evidence ladder for one agent, from its dossier.
 *
 * One rule for the agent page and the public API. They were about to
 * diverge the usual way: the page derived the ladder inline, and an API
 * deriving it again would drift the first time either changed.
 */
export function dossierLadder(d: AgentDossier, escrowChain: number): DossierLadder {
  const { agent, category, record } = d;
  const escrowOptions = escrowOptionsForHire(d.quote?.currency);
  const payable = d.quote ? quotePayableWith(d.quote.currency, correctedErc8183Addresses(escrowChain).paymentToken) : null;
  const history = agentHistory(getJobStore().byAgent(agent.chain_id, agent.token_id));
  const definition = assayForCategory(category);
  const categoryCheck = definition
    ? { definition, run: getAssayStore().latest({ chainId: agent.chain_id, tokenId: agent.token_id }, definition.id) }
    : null;
  const maturity = deriveMaturity({
    registered: true,
    reachable: record.totalAnswered > 0,
    // Priced means a signed price an escrow can pay, not merely no unpayable one.
    compatible: record.totalAnswered > 0 && escrowOptions.length > 0 && d.quote != null && payable === true,
    tested: Boolean(categoryCheck?.run && categoryCheck.run.status === 'checked' && categoryCheck.run.total > 0 && categoryCheck.run.passed === categoryCheck.run.total),
    hired: history.jobs > 0,
    delivered: history.selfDelivered > 0,
    deliveredByOperator: history.operatorDelivered > 0,
    outsideTeam: history.outsideTeam,
    probeRate: record.totalProbes > 0 ? record.totalAnswered / record.totalProbes : null,
    observedDays: record.observedDays,
  });
  return { maturity, payable, history, categoryCheck };
}
