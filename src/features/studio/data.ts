import 'server-only';

import { cookies } from 'next/headers';

import { readAgentAdoption, type AgentAdoption } from '@/lib/builder/adoption-server';
import { BUILDER_SESSION_COOKIE, builderSessionOwner } from '@/lib/builders/store';
import { getJobStore } from '@/lib/erc8183/store';
import type { HiredJob } from '@/lib/erc8183/types';
import { buildTrackRecord } from '@/lib/history/record';
import { getProbeStore } from '@/lib/history/store';
import { stripCells, type StripCell } from '@/lib/history/strip';
import { resolveAgentImage } from '@/lib/registry/image';
import { listAgents } from '@/lib/scan/client';
import type { ScanAgent } from '@/lib/scan/types';
import { deriveMaturity, type AgentMaturity } from '@/lib/agents/maturity';
import { classify } from '@/lib/agents/categories';
import { summariseEconomicHistory } from '@/lib/erc8183/economic-history';
import { escrowChainForHire } from '@/lib/network/escrow';
import { getAssayStore } from '@/lib/assay/store';
import { assayForCategory } from '@/lib/assay/catalog';
import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { buildGrowthSnapshot, type BuilderGrowthSnapshot } from '@/lib/builders/growth';
import { escrowOptionsForHire } from '@/lib/network/escrow';
import { chainLabel } from '@/lib/network/presentation';
import { agentConversion } from '@/lib/conversion/store';
import type { ConversionCounts } from '@/lib/conversion/funnel';

export interface FleetAgent {
  key: string;
  chainId: number;
  tokenId: string;
  name: string;
  imageUrl: string | null;
  online: boolean | null;
  gaps: string[];
  probes30d: number;
  answered30d: number;
  cells: StripCell[];
  activeJobs: number;
  completedJobs: number;
  createdAt: string | null;
  adoption: AgentAdoption | null;
  maturity: AgentMaturity;
  growth: BuilderGrowthSnapshot;
  conversion: ConversionCounts;
}

export async function studioOwner(): Promise<string | null> {
  const token = (await cookies()).get(BUILDER_SESSION_COOKIE)?.value;
  return builderSessionOwner(token) ?? null;
}

function gapsFor(agent: ScanAgent, online: boolean | null, imageUrl: string | null) {
  return [
    !imageUrl ? 'No image' : null,
    (agent.description?.trim().length ?? 0) < 40 ? 'Description under 40 characters' : null,
    !agent.supported_protocols?.length ? 'No A2A or MCP endpoint declared' : null,
    online === false ? 'Not answering probes' : null,
  ].filter((g): g is string => Boolean(g));
}

export async function loadFleet(owner: string): Promise<{ agents: FleetAgent[]; jobs: HiredJob[] }> {
  const pages = await Promise.all([
    listAgents({ chainId: 56, ownerAddress: owner, limit: 100 }).catch(() => ({ items: [] as ScanAgent[] })),
    listAgents({ chainId: 97, ownerAddress: owner, limit: 100 }).catch(() => ({ items: [] as ScanAgent[] })),
  ]);
  const agents = pages.flatMap((p) => p.items);
  const keys = new Set(agents.map((a) => `${a.chain_id}:${a.token_id}`));
  const jobs = getJobStore()
    .all()
    .filter((j) => keys.has(`${j.agentChainId ?? 56}:${j.agentTokenId}`))
    .sort((a, b) => Date.parse(b.hiredAt) - Date.parse(a.hiredAt));
  const since = new Date(Date.now() - 30 * 86_400_000);
  const store = getProbeStore();
  const quotes = store.quotesFor(agents.map((agent) => ({ chainId: agent.chain_id, tokenId: agent.token_id })));
  const adoptions = await Promise.all(agents.map((a) => readAgentAdoption(a.chain_id, a.token_id, [owner]).catch(() => null)));
  /* The registry record, not the indexer's media proxy — see
     `resolveAgentImage`. A builder's own fleet is a handful of rows, and
     being shown a blank where they set an image is the one place that
     reads as Pokter having lost it. */
  const images = await Promise.all(
    agents.map((a) => resolveAgentImage(a.chain_id, a.token_id, a.image_url).catch(() => null)),
  );

  return {
    jobs,
    agents: agents.map((agent, i) => {
      const record = buildTrackRecord(store.historyFor(agent.chain_id, agent.token_id, since));
      const day = record.windows.find((w) => w.label === '24h');
      const online = day && day.probes > 0 ? day.answered > 0 : null;
      const mine = jobs.filter((j) => `${j.agentChainId ?? 56}:${j.agentTokenId}` === `${agent.chain_id}:${agent.token_id}`);
      const history = summariseEconomicHistory(mine);
      const quote = quotes.get(`${agent.chain_id}:${agent.token_id}`);
      const category = classify(agent);
      const assayDefinition = assayForCategory(category);
      const assay = assayDefinition ? getAssayStore().latest({ chainId: agent.chain_id, tokenId: agent.token_id }, assayDefinition.id) : null;
      const growth = buildGrowthSnapshot({
        category,
        categoryLabel: category === 'unclassified' ? 'Unclassified' : (CATEGORY_BY_ID.get(category)?.label ?? category),
        definition: assayDefinition,
        run: assay,
        outcomes: history.outsideTeam,
        hireNetworks: record.totalAnswered > 0
          ? escrowOptionsForHire(quote?.currency).map((chainId) => ({ chainId, label: chainLabel(chainId) }))
          : [],
      });
      const maturity = deriveMaturity({
        registered: true,
        reachable: record.totalAnswered > 0,
        compatible: record.totalAnswered > 0 && escrowChainForHire(quote?.currency) !== null,
        tested: Boolean(assay && assay.status === 'checked' && assay.total > 0 && assay.passed === assay.total),
        hired: history.jobs > 0,
        delivered: history.selfDelivered > 0,
    deliveredByOperator: history.operatorDelivered > 0,
        outsideTeam: history.outsideTeam,
        probeRate: record.totalProbes > 0 ? record.totalAnswered / record.totalProbes : null,
        observedDays: record.observedDays,
      });
      return {
        key: `${agent.chain_id}:${agent.token_id}`,
        chainId: agent.chain_id,
        tokenId: agent.token_id,
        name: agent.name,
        imageUrl: images[i],
        online,
        gaps: gapsFor(agent, online, images[i]),
        probes30d: record.totalProbes,
        answered30d: record.totalAnswered,
        cells: stripCells(record, 14),
        activeJobs: mine.filter((j) => j.status === 'FUNDED' || j.status === 'SUBMITTED').length,
        completedJobs: mine.filter((j) => j.status === 'COMPLETED').length,
        createdAt: agent.created_at ?? null,
        adoption: adoptions[i],
        maturity,
        growth,
        conversion: agentConversion(agent.chain_id, agent.token_id),
      };
    }),
  };
}

export interface AgentOps {
  probes: Array<{ at: string; ok: boolean; latencyMs: number | null; status: number | null; detail: string; protocol: string }>;
  latency: Array<{ at: string; ms: number }>;
  weeks: Array<{ start: string; funded: number; completed: number }>;
  money: { releasedU: number; escrowedU: number; refundedJobs: number; disputedJobs: number };
}

const DAY_MS = 86_400_000;

/**
 * The operator's view of one agent, from Pokter's own stores only: the probe
 * log as recorded, reply latency, jobs per week and where the money went.
 * Nothing is interpolated: weeks without jobs are zero, probes without a
 * latency are left out of the latency series.
 */
export function loadAgentOps(chainId: number, tokenId: string, jobs: HiredJob[]): AgentOps {
  const since = new Date(Date.now() - 30 * DAY_MS);
  const history = getProbeStore().historyFor(chainId, tokenId, since);
  const probes = history.slice(0, 20).map((p) => ({
    at: p.probedAt,
    ok: p.ok,
    latencyMs: p.latencyMs,
    status: p.status,
    detail: p.detail.slice(0, 160),
    protocol: p.protocol,
  }));
  const latency = history
    .filter((p) => p.ok && p.latencyMs !== null)
    .slice(0, 40)
    .reverse()
    .map((p) => ({ at: p.probedAt, ms: p.latencyMs as number }));

  // Eight ISO-ish weeks ending this week, oldest first.
  const now = Date.now();
  const weekStart = (t: number) => {
    const d = new Date(t);
    const day = (d.getUTCDay() + 6) % 7;
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
  };
  const thisWeek = weekStart(now);
  const weeks = Array.from({ length: 8 }, (_, i) => ({ start: thisWeek - (7 - i) * 7 * DAY_MS, funded: 0, completed: 0 }));
  for (const job of jobs) {
    const w = weeks.find((x) => x.start === weekStart(Date.parse(job.hiredAt)));
    if (!w || job.status === 'OPEN') continue;
    w.funded += 1;
    if (job.status === 'COMPLETED') w.completed += 1;
  }

  const u = (raw: string) => Number(BigInt(raw)) / 1e18;
  return {
    probes,
    latency,
    weeks: weeks.map((w) => ({ ...w, start: new Date(w.start).toISOString().slice(0, 10) })),
    money: {
      releasedU: jobs.filter((j) => j.status === 'COMPLETED').reduce((s, j) => s + u(j.budgetRaw), 0),
      escrowedU: jobs.filter((j) => j.status === 'FUNDED' || j.status === 'SUBMITTED').reduce((s, j) => s + u(j.budgetRaw), 0),
      refundedJobs: jobs.filter((j) => j.status === 'EXPIRED' || Boolean(j.reclaimTxHash)).length,
      disputedJobs: jobs.filter((j) => j.status === 'REJECTED').length,
    },
  };
}
