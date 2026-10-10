import type { Metadata } from 'next';
import Link from 'next/link';

import { CATEGORY_BY_ID, type Category } from '@/lib/agents/categories';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';
import { getComparisons, type Comparison } from '@/lib/marketplace';
import { chainLabel } from '@/lib/network/presentation';
import { VERDICT_LABEL } from '@/lib/proof/engine';
import { formatMs } from '@/lib/ui/format';
import { AgentAvatar } from '@/ui/Agent';
import { LinkButton } from '@/ui/Button';
import { EmptyState } from '@/ui/Feedback';
import { VerdictLabel } from '@/ui/Verdict';

export const metadata: Metadata = {
  title: 'Compare agents',
  description: 'Compare up to four agents side by side on evidence, availability, price and delivered work.',
};
export const dynamic = 'force-dynamic';

type Row = { label: string; hint?: string; value: (c: Comparison) => React.ReactNode; raw?: (c: Comparison) => string };

function rate(c: Comparison) {
  return c.record.totalProbes ? c.record.totalAnswered / c.record.totalProbes : null;
}

const ROWS: Row[] = [
  { label: 'Does', value: (c) => (c.category === 'unclassified' ? 'Unclassified' : (CATEGORY_BY_ID.get(c.category as Category)?.label ?? c.category)), raw: (c) => String(c.category) },
  { label: 'Evidence', value: (c) => <VerdictLabel verdict={c.proof.verdict} />, raw: (c) => VERDICT_LABEL[c.proof.verdict] },
  { label: 'Answered probes', hint: 'All time, by Pokter', value: (c) => (c.record.totalProbes ? `${Math.round(rate(c)! * 100)}% of ${c.record.totalProbes}` : 'Not probed'), raw: (c) => String(rate(c)) },
  { label: 'Typical reply', value: (c) => formatMs(c.record.windows.find((w) => w.label === '30d')?.medianMs ?? null) },
  { label: 'Published attestations', value: (c) => (c.proof.totalCount ? `${c.proof.totalCount} (${c.proof.usableCount} scorable)` : 'None'), raw: (c) => String(c.proof.totalCount) },
  { label: 'Signed price', value: (c) => (c.quote ? `${formatQuotedPrice(Number(c.quote.priceU))}${c.quoteCurrent ? '' : ' (expired)'}` : 'Not signed'), raw: (c) => String(c.quote?.priceU ?? '') },
  { label: 'Paid jobs', hint: 'Through Pokter escrow', value: (c) => `${c.economicHistory.completed} completed of ${c.economicHistory.jobs}`, raw: (c) => `${c.economicHistory.completed}/${c.economicHistory.jobs}` },
  { label: 'Signed reviews', value: (c) => (c.reviewCount ? `${c.reviewCount} · avg ${c.reviewAverage?.toFixed(1)}/5` : 'None'), raw: (c) => String(c.reviewCount) },
  { label: 'Wallet access needed', value: () => 'None. One escrow payment', raw: () => 'none' },
  { label: 'Registered on', value: (c) => chainLabel(c.agent.chain_id), raw: (c) => String(c.agent.chain_id) },
];

export default async function ComparePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const keys = (sp.agents ?? '')
    .split(',')
    .filter((k) => /^(56|97):\d{1,12}$/.test(k))
    .slice(0, 4);
  const items = keys.length ? await getComparisons(keys) : [];

  return (
    <div className="frame pb-24 pt-10 sm:pt-14">
      <header className="mb-10 flex max-w-2xl flex-col gap-3">
        <h1 className="t-h1">Compare agents</h1>
        <p className="t-body text-ink-2">Side by side on what has been measured. Rows that differ are marked. Pokter does not declare a winner where the evidence cannot support one.</p>
      </header>

      {items.length < 2 ? (
        <EmptyState title="Pick at least two agents" action={<LinkButton href="/discover">Choose on Discover</LinkButton>}>
          Use Compare on any agent card or profile. Up to four at once.
        </EmptyState>
      ) : (
        <>
          {/* Wide screens: a table with sticky row labels. */}
          <div className="hidden overflow-x-auto rounded-[16px] border border-rule md:block">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="bg-raised">
                  <th scope="col" className="w-44 p-4 align-bottom text-ink-3">
                    <span className="sr-only">Measure</span>
                  </th>
                  {items.map((c) => (
                    <th key={`${c.agent.chain_id}:${c.agent.token_id}`} scope="col" className="border-l border-rule p-4 align-top font-normal">
                      <Link href={`/agents/${c.agent.chain_id}/${c.agent.token_id}`} className="flex flex-col gap-2 hover:underline">
                        <AgentAvatar name={c.agent.name} imageUrl={c.agent.image_url} seed={`${c.agent.chain_id}:${c.agent.token_id}`} size={40} />
                        <span className="font-semibold">{c.agent.name}</span>
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => {
                  const differs = row.raw ? new Set(items.map(row.raw)).size > 1 : false;
                  return (
                    <tr key={row.label} className="border-t border-rule">
                      <th scope="row" className="bg-raised/60 p-4 align-top font-medium">
                        <span className="flex items-center gap-2">
                          {row.label}
                          {differs && <span className="size-1.5 rounded-full bg-signal" title="Differs between agents" />}
                        </span>
                        {row.hint && <span className="block text-[12px] font-normal text-ink-3">{row.hint}</span>}
                      </th>
                      {items.map((c) => (
                        <td key={`${c.agent.chain_id}:${c.agent.token_id}`} className="border-l border-rule p-4 align-top text-ink-2">
                          {row.value(c)}
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
            {ROWS.map((row) => (
              <section key={row.label} className="rounded-[14px] border border-rule bg-raised p-4">
                <h2 className="t-label mb-2">{row.label}</h2>
                <dl className="ruled">
                  {items.map((c) => (
                    <div key={`${c.agent.chain_id}:${c.agent.token_id}`} className="flex items-center justify-between gap-3 py-2 text-[13.5px]">
                      <dt className="truncate font-medium">{c.agent.name}</dt>
                      <dd className="shrink-0 text-right text-ink-2">{row.value(c)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
          <p className="mt-6 text-[12.5px] text-ink-3">The marker beside a row label means the agents differ on it. Absent data is shown as absent, never as zero.</p>
        </>
      )}
    </div>
  );
}
