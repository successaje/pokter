import Link from 'next/link';

import { ATTEMPT_WINDOW_DAYS } from '@/lib/builder/diagnostics/attempt';
import { buildFleetDesk, type DeskInput, type DeskTone } from '@/lib/builder/diagnostics/desk';
import { mapWithConcurrency } from '@/lib/concurrency';
import { LinkButton } from '@/ui/Button';
import { Readout } from '@/ui/Data';
import { LoadingRegion, Skeleton } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';
import { loadBuilderDiagnostics } from './diagnostics-data';

/**
 * Every agent a builder owns, and the one thing to fix first on each.
 *
 * Each row is that agent's own "Why hires fail" report, read through the
 * same registry ownership check, so an agent the indexer still lists after
 * a transfer shows as not counted here exactly as its own tab refuses. Each
 * report reads the registry and the indexer once, so the desk reads a
 * bounded number and streams in after the page.
 */

/** Agents read per page: each is a registry read and an indexer read. */
export const DESK_LIMIT = 12;

const DOT: Record<DeskTone, string> = {
  bad: 'bg-bad',
  watch: 'bg-watch',
  ok: 'bg-ok',
  neutral: 'bg-rule-strong',
  info: 'bg-rule-strong',
};

const count = (value: number | null) => (value === null ? '—' : String(value));

export function FleetDeskSkeleton() {
  return (
    <LoadingRegion label="Loading what buyers did with your agents">
      <Skeleton className="h-40 rounded-[12px]" />
    </LoadingRegion>
  );
}

export async function FleetDesk({ agents }: { agents: ReadonlyArray<{ chainId: number; tokenId: string; name: string }> }) {
  if (agents.length === 0) return null;
  const read = agents.slice(0, DESK_LIMIT);
  const inputs = await mapWithConcurrency(read, 4, async (agent): Promise<DeskInput> => {
    const result = await loadBuilderDiagnostics(agent.chainId, agent.tokenId);
    return {
      ...agent,
      result: result.ok ? { ok: true, diagnostics: result.diagnostics } : { ok: false, message: result.message },
    };
  });
  const desk = buildFleetDesk(inputs, ATTEMPT_WINDOW_DAYS, agents.length - read.length);
  const { totals } = desk;

  return (
    <section aria-labelledby="fleet-desk" className="mb-8 flex flex-col gap-4 rounded-[12px] border border-rule bg-raised p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 id="fleet-desk" className="text-[15px] font-medium">
          What buyers did, last {desk.windowDays} days
        </h2>
        <p className="text-[12.5px] leading-relaxed text-ink-3">
          Across {totals.counted} agent{totals.counted === 1 ? '' : 's'}. Counts are buyers&rsquo; asks, not people: Pokter keeps no
          buyer identity, and its own probes are left out.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Readout label="Hire flow opened" value={count(totals.opens)} muted={totals.opens === null} />
        <Readout label="Asked for a price" value={totals.asks} />
        <Readout label="Got a signed price" value={totals.quoted} />
        <Readout label="Stopped" value={totals.stopped} muted={totals.stopped === 0} />
        <Readout label="Funded by outside buyers" value={totals.funded} />
      </div>

      <ul className="ruled border-t border-rule">
        {desk.rows.map((row) => (
          <li key={row.key} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
            <Link href={row.href} className="flex min-w-0 flex-1 flex-col gap-0.5 hover:underline">
              <span className="flex items-center gap-2 text-sm font-medium">
                <span className={`size-1.5 shrink-0 rounded-full ${DOT[row.tone]}`} aria-hidden />
                <span className="truncate">{row.name}</span>
              </span>
              <span className="text-[12.5px] leading-snug text-ink-2">{row.title}</span>
              {row.counted && (
                <span className="t-readout text-[12px] text-ink-3">
                  {count(row.opens)} opened · {row.asks} asked · {row.quoted} priced · {row.stopped} stopped · {row.funded} funded
                </span>
              )}
            </Link>
            {row.fix && (
              <LinkButton href={row.fix.href} intent="secondary" size="s" className="self-start sm:self-center" trailing={<Icon.ArrowUpRight size={13} />}>
                {row.fix.label}
              </LinkButton>
            )}
          </li>
        ))}
      </ul>

      {(totals.notCounted > 0 || desk.omitted > 0) && (
        <p className="text-[12.5px] leading-relaxed text-ink-3">
          {totals.notCounted > 0 &&
            `${totals.notCounted} agent${totals.notCounted === 1 ? '' : 's'} could not be counted just now and ${totals.notCounted === 1 ? 'is' : 'are'} left out of the totals. `}
          {desk.omitted > 0 && `${desk.omitted} more agent${desk.omitted === 1 ? '' : 's'} not shown here; open ${desk.omitted === 1 ? 'it' : 'each'} below for its report.`}
        </p>
      )}
    </section>
  );
}
