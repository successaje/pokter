import Link from 'next/link';

import { CATEGORY_BY_ID, type Category } from '@/lib/agents/categories';
import { leaders } from '@/lib/compare/best';
import { activityRow } from '@/lib/activity/reading';
import { coordinationText } from '@/lib/proof/coordination';
import { capabilityText } from '@/lib/capability/match';
import { ago, checkReading, checkTone, custodyOf, declaredProtocols, distinctPercents, endpointReading } from '@/lib/compare/rows';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';
import type { Comparison } from '@/lib/marketplace';
import { chainLabel } from '@/lib/network/presentation';
import { AVAILABILITY_LABEL } from '@/lib/proof/engine';
import { deliveryAdjustedVerdict } from '@/lib/search/match';
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
  value: (c: Comparison, all: readonly Comparison[]) => React.ReactNode;
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

/* A rate over a handful of probes is noise: five at least before it can lead. */
const rankedRate = (c: Comparison) => (c.record.totalProbes >= 5 ? rate(c) : null);

/*
 * The verdict the agent's own page shows: demoted when paid jobs lapse
 * (`deliveryAdjustedVerdict`), so the two pages never disagree about one
 * agent.
 */
const availability = (c: Comparison) => deliveryAdjustedVerdict(c.proof.verdict, c.economicHistory).verdict;

/** Correctness, marked as plainly as availability: a pass, a failure, or neither. */
function CheckResult({ check }: { check: Comparison['check'] }) {
  const tone = checkTone(check);
  const text = checkReading(check).text;
  if (tone === 'none') return <span className="text-ink-3">{text}</span>;
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-medium', tone === 'pass' ? 'text-ok' : 'text-bad')}>
      {tone === 'pass' ? <Icon.Check size={13} aria-hidden /> : <Icon.Cross size={13} aria-hidden />}
      {text}
    </span>
  );
}

const ROWS: Row[] = [
  { label: 'Does', value: (c) => (c.category === 'unclassified' ? 'Unclassified' : (CATEGORY_BY_ID.get(c.category as Category)?.label ?? c.category)), raw: (c) => String(c.category) },
  /*
   * Two questions, two rows, each marked as plainly as the other. Whether
   * it replies is not whether it is right: a green "Reliable" beside
   * "0 of 3 passed" read as an endorsement of answers nobody had checked.
   */
  { label: 'Availability', hint: 'Whether it replies to Pokter’s probes', value: (c) => <VerdictLabel verdict={availability(c)} />, raw: (c) => AVAILABILITY_LABEL[availability(c)] },
  { label: 'Answer check', hint: 'Whether its answers match Pokter’s published check for its kind', value: (c) => <CheckResult check={c.check} />, raw: (c) => checkReading(c.check).text, rank: { of: (c) => checkReading(c.check).score, better: 'higher' } },
  {
    label: 'Answered probes',
    hint: 'All time, by Pokter',
    value: (c, all) => (c.record.totalProbes ? `${distinctPercents(all.map(rate)).labels[all.indexOf(c)]} of ${c.record.totalProbes}` : 'Not probed'),
    raw: (c) => String(rate(c)),
    /* Ranked on the rate as shown: a displayed tie is a tie. */
    rank: { of: (c, all) => (rankedRate(c) === null ? null : distinctPercents(all.map(rate)).ranked[all.indexOf(c)]), better: 'higher' },
  },
  { label: 'Last checked', hint: 'Pokter’s latest probe', value: (c) => ago(c.latestProbe?.probedAt ?? null), raw: (c) => ago(c.latestProbe?.probedAt ?? null) },
  { label: 'Endpoint', hint: 'What that probe saw', value: (c) => endpointReading(c.latestProbe), raw: (c) => String(c.latestProbe?.ok ?? '') },
  { label: 'Typical reply', value: (c) => formatMs(medianMs(c)), raw: (c) => String(medianMs(c)), rank: { of: medianMs, better: 'lower' } },
  { label: 'Published attestations', value: (c) => (c.proof.totalCount ? `${c.proof.totalCount} (${c.proof.usableCount} scorable)` : 'None'), raw: (c) => String(c.proof.totalCount), rank: { of: (c) => c.proof.usableCount, better: 'higher' } },
  // Prices compare only when current and in the same currency for every agent.
  { label: 'Escrow quote', value: (c) => (c.quote ? `${formatQuotedPrice(Number(c.quote.priceU), c.quote.currency)}${c.quoteCurrent ? '' : ' (last signed, expired)'}` : 'Not signed'), raw: (c) => String(c.quote?.priceU ?? ''), rank: { of: (c, all) => (c.quote && c.quoteCurrent && all.every((o) => !o.quote || o.quote.currency === c.quote!.currency) ? Number(c.quote.priceU) : null), better: 'lower' } },
  { label: 'Paid jobs', hint: 'Through Pokter escrow', value: (c) => `${c.economicHistory.completed} completed of ${c.economicHistory.jobs}`, raw: (c) => `${c.economicHistory.completed}/${c.economicHistory.jobs}`, rank: { of: (c) => c.economicHistory.completed, better: 'higher' } },
  // One review is an anecdote: an average leads only over two or more.
  { label: 'Signed reviews', value: (c) => (c.reviewCount ? `${c.reviewCount} · avg ${c.reviewAverage?.toFixed(1)}/5` : 'None'), raw: (c) => String(c.reviewCount), rank: { of: (c) => (c.reviewCount >= 2 ? c.reviewAverage : null), better: 'higher' } },
  { label: 'Custody', hint: 'Agent wallet against owner', value: (c) => custodyOf(c.agent.agent_wallet, c.currentOwner ?? c.agent.owner_address).text, raw: (c) => String(custodyOf(c.agent.agent_wallet, c.currentOwner ?? c.agent.owner_address).separate) },
  { label: 'On-chain capability', hint: 'Seen doing its job, from its agent wallet', value: (c) => capabilityRow(c), raw: (c) => capabilityRow(c) },
  { label: 'Review pattern', hint: 'Who wrote its on-chain reviews, and when', value: (c) => coordinationText(c.reviewPattern), raw: (c) => c.reviewPattern.level },
  { label: 'Wallet activity', hint: 'Its agent wallet, read daily', value: (c) => activityRow(c.walletActivity, c.agent.agent_wallet, c.agent.chain_id), raw: (c) => activityRow(c.walletActivity, c.agent.agent_wallet, c.agent.chain_id) },
  { label: 'Protocols', hint: 'As declared, not verified', value: (c) => declaredProtocols(c.agent.services, c.agent.supported_protocols).join(' · ') || 'None declared', raw: (c) => declaredProtocols(c.agent.services, c.agent.supported_protocols).join(',') },
  { label: 'How you pay', value: () => 'Escrowed job, one payment, no wallet access', raw: () => 'escrow' },
  { label: 'Identity', value: (c) => `ERC-8004 #${c.agent.token_id} · ${chainLabel(c.agent.chain_id)}`, raw: (c) => String(c.agent.chain_id) },
];

function capabilityRow(c: Comparison): string {
  return capabilityText({ category: String(c.category), declared: c.capability.declared, wallet: c.agent.agent_wallet, reads: c.capability.reads, chainLabel }).text;
}

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

/**
 * The agents being compared stay in view while the measures scroll under
 * them: at the top of the page, under the site header (the page sets
 * `--compare-top`), or at the top of the sheet. Scrolled past the first
 * rows, the columns were nameless and the only way to tell them apart was
 * to scroll back up.
 *
 * The table needs 40rem. It is chosen by the room it has, not by the
 * screen: the sheet is narrower than the page, and a table scrolling
 * sideways inside it cannot keep a sticky header (a horizontal scroller
 * is also a vertical one for `position: sticky`). With less room, each
 * measure is a card that names every agent in it.
 */
export function CompareView({ items, images }: { items: readonly Comparison[]; images: readonly (string | null)[] }) {
  const key = (c: Comparison) => `${c.agent.chain_id}:${c.agent.token_id}`;
  return (
    <div className="@container">
          {/*
            Separate borders, so each line belongs to its cell and moves
            with the header when it sticks; `overflow-clip` rounds the
            corners without becoming a scroller the header would stick to.
          */}
          <div className="hidden overflow-clip rounded-[16px] border border-rule @[40rem]:block">
            <table className="w-full border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr>
                  <th scope="col" className="sticky top-[var(--compare-top,0px)] z-10 w-44 border-b border-rule bg-raised px-4 py-3 text-ink-3">
                    <span className="sr-only">Measure</span>
                  </th>
                  {items.map((c, i) => (
                    <th key={key(c)} scope="col" className="sticky top-[var(--compare-top,0px)] z-10 border-b border-l border-rule bg-raised px-3 py-3 text-center align-middle font-normal">
                      <Link href={`/agents/${c.agent.chain_id}/${c.agent.token_id}`} className="mx-auto flex max-w-full items-center justify-center gap-2 hover:underline">
                        <AgentAvatar name={c.agent.name} imageUrl={images[i]} seed={key(c)} size={28} />
                        <span className="truncate font-semibold">{c.agent.name}</span>
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="[&>tr+tr>*]:border-t [&>tr+tr>*]:border-rule">
                {ROWS.map((row) => {
                  const differs = row.raw ? new Set(items.map(row.raw)).size > 1 : false;
                  const best = bestOf(row, items);
                  return (
                    <tr key={row.label}>
                      <th scope="row" className="bg-raised/60 p-4 align-middle font-medium">
                        <span className="flex items-center gap-2">
                          {row.label}
                          {differs && <span className="size-1.5 rounded-full bg-signal" title="Differs between agents" />}
                        </span>
                        {row.hint && <span className="block text-[12px] font-normal text-ink-3">{row.hint}</span>}
                      </th>
                      {items.map((c, i) => (
                        <td key={key(c)} className={cn('border-l border-rule p-4 text-center align-middle text-ink-2', best.has(i) && 'bg-ok-wash/70 text-ink')}>
                          {row.value(c, items)}
                          {best.has(i) && <BestMark />}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {/* Hire after the evidence, where the reader has finished reading it; the pinned row stays just the names. */}
                <tr>
                  <th scope="row" className="bg-raised/60 p-4">
                    <span className="sr-only">Hire</span>
                  </th>
                  {items.map((c) => (
                    <td key={key(c)} className="border-l border-rule p-4 text-center">
                      <LinkButton href={`/hire/${c.agent.chain_id}/${c.agent.token_id}`} size="s">
                        Hire
                      </LinkButton>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Less room: one card per measure, agents stacked inside it. */}
          <div className="flex flex-col gap-4 @[40rem]:hidden">
            {ROWS.map((row) => {
              const best = bestOf(row, items);
              return (
                <section key={row.label} className="rounded-[14px] border border-rule bg-raised p-4">
                  <h2 className="t-label mb-2">{row.label}</h2>
                  <dl className="ruled">
                    {items.map((c, i) => (
                      <div key={key(c)} className={cn('flex items-center justify-between gap-3 py-2 text-[13.5px]', best.has(i) && '-mx-2 rounded-[8px] bg-ok-wash/70 px-2')}>
                        <dt className="truncate font-medium">{c.agent.name}</dt>
                        <dd className="shrink-0 text-right text-ink-2">
                          {row.value(c, items)}
                          {best.has(i) && <BestMark />}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            })}
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 2)}, minmax(0, 1fr))` }}>
              {items.map((c) => (
                <LinkButton key={key(c)} href={`/hire/${c.agent.chain_id}/${c.agent.token_id}`} size="s" intent="secondary" className="min-w-0">
                  <span className="truncate">Hire {c.agent.name}</span>
                </LinkButton>
              ))}
            </div>
          </div>
          <p className="mt-6 text-[12.5px] text-ink-3">The marker beside a row label means the agents differ on it. <span className="font-medium text-ok">Best</span> marks the leader on that one measure where a fair comparison exists, not an overall winner. Absent data is shown as absent, never as zero.</p>
    </div>
  );
}
