import Link from 'next/link';

import type { FleetAgent } from './data';
import { AgentAvatar, ProbeStrip } from '@/ui/Agent';

/**
 * The agents a builder owns, each with whether it answers and its jobs.
 * One copy, on the Building overview and on My agents.
 */
export function FleetList({ agents, unavailable }: { agents: FleetAgent[]; unavailable: number[] }) {
  if (agents.length === 0) {
    return unavailable.length === 0 ? <p className="text-sm text-ink-3">This wallet owns no agents yet.</p> : null;
  }
  return (
    <ul className="ruled border-y border-rule">
      {agents.map((a) => (
        <li key={a.key}>
          <Link href={`/build/agents/${a.chainId}/${a.tokenId}`} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-4 py-4 hover:bg-sunken/40">
            <AgentAvatar name={a.name} imageUrl={a.imageUrl} seed={a.key} size={40} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-medium">{a.name}</span>
              <span className="flex items-center gap-2 text-[12.5px] text-ink-3">
                <span className={`size-1.5 rounded-full ${a.online ? 'bg-ok' : a.online === false ? 'bg-bad' : 'bg-rule-strong'}`} />
                {a.online ? 'Answering' : a.online === false ? 'Not answering' : 'Not probed in 24 h'} · {a.answered30d}/{a.probes30d} probes in 30 d
                {a.gaps.length > 0 && <span className="text-watch">· {a.gaps.length} to fix</span>}
              </span>
            </span>
            <span className="flex items-center gap-4">
              {a.probes30d > 0 && <ProbeStrip cells={a.cells} className="hidden h-5 sm:flex [&>span]:w-[4px]" />}
              <span className="t-readout text-[12.5px] text-ink-3">{a.activeJobs ? `${a.activeJobs} active` : `${a.completedJobs} done`}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
