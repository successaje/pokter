import 'server-only';

import { cookies } from 'next/headers';

import { readAgentAdoption, type AgentAdoption } from '@/lib/builder/adoption-server';
import { BUILDER_SESSION_COOKIE, builderSessionOwner } from '@/lib/builders/store';
import { getJobStore } from '@/lib/erc8183/store';
import type { HiredJob } from '@/lib/erc8183/types';
import { buildTrackRecord } from '@/lib/history/record';
import { getProbeStore } from '@/lib/history/store';
import { stripCells, type StripCell } from '@/lib/history/strip';
import { listAgents } from '@/lib/scan/client';
import type { ScanAgent } from '@/lib/scan/types';

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
}

export async function studioOwner(): Promise<string | null> {
  const token = (await cookies()).get(BUILDER_SESSION_COOKIE)?.value;
  return builderSessionOwner(token) ?? null;
}

function gapsFor(agent: ScanAgent, online: boolean | null) {
  return [
    !agent.image_url ? 'No image' : null,
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
  const adoptions = await Promise.all(agents.map((a) => readAgentAdoption(a.chain_id, a.token_id, [owner]).catch(() => null)));

  return {
    jobs,
    agents: agents.map((agent, i) => {
      const record = buildTrackRecord(store.historyFor(agent.chain_id, agent.token_id, since));
      const day = record.windows.find((w) => w.label === '24h');
      const online = day && day.probes > 0 ? day.answered > 0 : null;
      const mine = jobs.filter((j) => `${j.agentChainId ?? 56}:${j.agentTokenId}` === `${agent.chain_id}:${agent.token_id}`);
      return {
        key: `${agent.chain_id}:${agent.token_id}`,
        chainId: agent.chain_id,
        tokenId: agent.token_id,
        name: agent.name,
        imageUrl: agent.image_url && /^https:\/\//.test(agent.image_url) ? agent.image_url : null,
        online,
        gaps: gapsFor(agent, online),
        probes30d: record.totalProbes,
        answered30d: record.totalAnswered,
        cells: stripCells(record, 14),
        activeJobs: mine.filter((j) => j.status === 'FUNDED' || j.status === 'SUBMITTED').length,
        completedJobs: mine.filter((j) => j.status === 'COMPLETED').length,
        createdAt: agent.created_at ?? null,
        adoption: adoptions[i],
      };
    }),
  };
}
