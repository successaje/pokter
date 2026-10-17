import Link from 'next/link';

import { CATEGORY_BY_ID, type Category } from '@/lib/agents/categories';
import { leaders } from '@/lib/compare/best';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';
import type { Comparison } from '@/lib/marketplace';
import { chainLabel } from '@/lib/network/presentation';
import { VERDICT_LABEL } from '@/lib/proof/engine';
import { cn } from '@/lib/ui/cn';
import { formatMs } from '@/lib/ui/format';
import { AgentAvatar } from '@/ui/Agent';
import { LinkButton } from '@/ui/Button';
import { Icon } from '@/ui/icons';
import { VerdictLabel } from '@/ui/Verdict';

/*
 * The comparison itself, shared by the /compare page and the sheet that
 * opens over Discover. Each row marks its leader where the agents can be
 * fairly compared on it (see `leaders`).
 */

type Row = {
  label: string;
  hint?: string;
  value: (c: Comparison) => React.ReactNode;
  raw?: (c: Comparison) => string;
  /** A number to rank this row by, and which way is better. Null: no fair comparison for this agent. */
  rank?: { of: (c: Comparison, all: readonly Comparison[]) => number | null; better: 'higher' | 'lower' };
};

function medianMs(c: Comparison) {
  return c.record.windows.find((w) => w.label === '30d')?.medianMs ?? null;
}

function rate(c: Comparison) {
  return c.record.totalProbes ? c.record.totalAnswered / c.record.totalProbes : null;
}

const ROWS: Row[] = [
  { label: 'Does', value: (c) => (c.category === 'unclassified' ? 'Unclassified' : (CATEGORY_BY_ID.get(c.category as Category)?.label ?? c.category)), raw: (c) => String(c.category) },
  { label: 'Evidence', value: (c) => <VerdictLabel verdict={c.proof.verdict} />, raw: (c) => VERDICT_LABEL[c.proof.verdict] },
  // A rate over a handful of probes is noise: five at least before it can lead.
  { label: 'Answered probes', hint: 'All time, by Pokter', value: (c) => (c.record.totalProbes ? `${Math.round(rate(c)! * 100)}% of ${c.record.totalProbes}` : 'Not probed'), raw: (c) => String(rate(c)), rank: { of: (c) => (c.record.totalProbes >= 5 ? rate(c) : null), better: 'higher' } },
  { label: 'Typical reply', value: (c) => formatMs(medianMs(c)), raw: (c) => String(medianMs(c)), rank: { of: medianMs, better: 'lower' } },
  { label: 'Published attestations', value: (c) => (c.proof.totalCount ? `${c.proof.totalCount} (${c.proof.usableCount} scorable)` : 'None'), raw: (c) => String(c.proof.totalCount), rank: { of: (c) => c.proof.usableCount, better: 'higher' } },
  // Prices compare only when current and in the same currency for every agent.
  { label: 'Signed price', value: (c) => (c.quote ? `${formatQuotedPrice(Number(c.quote.priceU), c.quote.currency)}${c.quoteCurrent ? '' : ' (expired)'}` : 'Not signed'), raw: (c) => String(c.quote?.priceU ?? ''), rank: { of: (c, all) => (c.quote && c.quoteCurrent && all.every((o) => !o.quote || o.quote.currency === c.quote!.currency) ? Number(c.quote.priceU) : null), better: 'lower' } },
  { label: 'Paid jobs', hint: 'Through Pokter escrow', value: (c) => `${c.economicHistory.completed} completed of ${c.economicHistory.jobs}`, raw: (c) => `${c.economicHistory.completed}/${c.economicHistory.jobs}`, rank: { of: (c) => c.economicHistory.completed, better: 'higher' } },
  // One review is an anecdote: an average leads only over two or more.
  { label: 'Signed reviews', value: (c) => (c.reviewCount ? `${c.reviewCount} · avg ${c.reviewAverage?.toFixed(1)}/5` : 'None'), raw: (c) => String(c.reviewCount), rank: { of: (c) => (c.reviewCount >= 2 ? c.reviewAverage : null), better: 'higher' } },
  { label: 'Wallet access needed', value: () => 'None. One escrow payment', raw: () => 'none' },
  { label: 'Registered on', value: (c) => chainLabel(c.agent.chain_id), raw: (c) => String(c.agent.chain_id) },
];

function bestOf(row: Row, items: readonly Comparison[]): Set<number> {
  return row.rank ? leaders(items.map((c) => row.rank!.of(c, items)), row.rank.better) : new Set();
}

function BestMark() {
  return (
    <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-ok/15 px-1.5 py-px align-middle text-[11px] font-semibold text-ok">
      <Icon.Check size={11} /> Best
    </span>
  );
}

export function CompareView({ items, images }: { items: readonly Comparison[]; images: readonly (string | null)[] }) {
  return (
    <>
          {/* Wide screens: a table with sticky row labels. */}
          <div className="hidden overflow-x-auto rounded-[16px] border border-rule md:block">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="bg-raised">
                  <th scope="col" className="w-44 p-4 align-bottom text-ink-3">
                    <span className="sr-only">Measure</span>
                  </th>
                  {items.map((c, i) => (
                    <th key={`${c.agent.chain_id}:${c.agent.token_id}`} scope="col" className="border-l border-rule p-4 align-top font-normal">
                      <Link href={`/agents/${c.agent.chain_id}/${c.agent.token_id}`} className="flex flex-col gap-2 hover:underline">
                        <AgentAvatar name={c.agent.name} imageUrl={images[i]} seed={`${c.agent.chain_id}:${c.agent.token_id}`} size={40} />
                        <span className="font-semibold">{c.agent.name}</span>
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => {
                  const differs = row.raw ? new Set(items.map(row.raw)).size > 1 : false;
                  const best = bestOf(row, items);
                  return (
                    <tr key={row.label} className="border-t border-rule">
                      <th scope="row" className="bg-raised/60 p-4 align-top font-medium">
                        <span className="flex items-center gap-2">
                          {row.label}
                          {differs && <span className="size-1.5 rounded-full bg-signal" title="Differs between agents" />}
                        </span>
                        {row.hint && <span className="block text-[12px] font-normal text-ink-3">{row.hint}</span>}
                      </th>
                      {items.map((c, i) => (
                        <td key={`${c.agent.chain_id}:${c.agent.token_id}`} className={cn('border-l border-rule p-4 align-top text-ink-2', best.has(i) && 'bg-ok-wash/70 text-ink')}>
                          {row.value(c)}
                          {best.has(i) && <BestMark />}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                <tr className="border-t border-rule">
                  <th scope="row" className="bg-raised/60 p-4" />
                  {items.map((c) => (
                    <td key={`${c.agent.chain_id}:${c.agent.token_id}`} className="border-l border-rule p-4">
                      <LinkButton href={`/hire/${c.agent.chain_id}/${c.agent.token_id}`} size="s">
                        Hire
                      </LinkButton>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Phones: one card per measure, agents stacked inside it. */}
          <div className="flex flex-col gap-4 md:hidden">
            {ROWS.map((row) => {
              const best = bestOf(row, items);
              return (
                <section key={row.label} className="rounded-[14px] border border-rule bg-raised p-4">
                  <h2 className="t-label mb-2">{row.label}</h2>
                  <dl className="ruled">
                    {items.map((c, i) => (
                      <div key={`${c.agent.chain_id}:${c.agent.token_id}`} className={cn('flex items-center justify-between gap-3 py-2 text-[13.5px]', best.has(i) && '-mx-2 rounded-[8px] bg-ok-wash/70 px-2')}>
                        <dt className="truncate font-medium">{c.agent.name}</dt>
                        <dd className="shrink-0 text-right text-ink-2">
                          {row.value(c)}
                          {best.has(i) && <BestMark />}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            })}
          </div>
          <p className="mt-6 text-[12.5px] text-ink-3">The marker beside a row label means the agents differ on it. <span className="font-medium text-ok">Best</span> marks the leader on that one measure where a fair comparison exists, not an overall winner. Absent data is shown as absent, never as zero.</p>
    </>
  );
}
