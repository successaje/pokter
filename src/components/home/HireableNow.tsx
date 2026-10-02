'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { EvidenceBadge } from '@/components/ui/EvidenceBadge';
import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { isPromotableAgent } from '@/lib/agents/eligibility';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';
import type { TrackRecord } from '@/lib/history/record';
import type { Listing } from '@/lib/marketplace';
import { offersDirectHire, verdictFor } from '@/lib/search/match';
import { chainLabel } from '@/lib/network/presentation';

type Entry = { listing: Listing; record: TrackRecord };
type Spotlight = 'recommended' | 'recent';

function responseRate(entry: Entry): number {
  if (entry.record.totalProbes === 0) return -1;
  return entry.record.totalAnswered / entry.record.totalProbes;
}

function rankedFor(tab: Spotlight, entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => {
    if (tab === 'recent') {
      const aSeen = a.record.lastSeen ? Date.parse(a.record.lastSeen) : 0;
      const bSeen = b.record.lastSeen ? Date.parse(b.record.lastSeen) : 0;
      if (bSeen !== aSeen) return bSeen - aSeen;
    }

    const direct = Number(offersDirectHire(b)) - Number(offersDirectHire(a));
    if (direct !== 0) return direct;
    const rate = responseRate(b) - responseRate(a);
    if (rate !== 0) return rate;
    return b.record.totalProbes - a.record.totalProbes;
  });
}

function EvidenceVisual({ entry }: { entry: Entry }) {
  const rate = responseRate(entry);
  const percent = rate < 0 ? 0 : Math.round(rate * 100);
  const windows = entry.record.windows.filter((window) => window.probes > 0);

  return (
    <div className="spotlight-evidence-visual relative flex min-h-64 flex-col justify-between overflow-hidden rounded-2xl border border-[color:var(--border)] p-5 shadow-sm">
      <div className="absolute -right-14 -top-14 size-44 rounded-full border border-[color:var(--brand)]/15" />
      <div className="absolute -right-5 -top-5 size-28 rounded-full border border-[color:var(--brand)]/20" />

      <div className="relative flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--text-muted)]">Observed record</span>
        <span className="flex items-center gap-1.5 rounded-full bg-[color:var(--positive-dim)] px-2 py-1 text-[10px] font-semibold text-[color:var(--positive)]">
          <span className="live-dot size-1.5 rounded-full bg-current" /> Live evidence
        </span>
      </div>

      <div className="relative grid grid-cols-[auto_1fr] items-center gap-5">
        <div className="grid size-24 place-items-center rounded-full bg-[conic-gradient(var(--brand)_var(--evidence-rate),var(--border)_0)] p-2" style={{ '--evidence-rate': `${percent}%` } as CSSProperties}>
          <div className="grid size-full place-items-center rounded-full bg-[color:var(--surface)] text-center">
            <span className="flex flex-col">
              <strong className="text-xl tabular-nums">{rate < 0 ? '—' : `${percent}%`}</strong>
              <span className="text-[9px] uppercase tracking-wide text-[color:var(--text-faint)]">answered</span>
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          {(windows.length > 0 ? windows.slice(0, 3) : entry.record.windows.slice(0, 3)).map((window) => (
            <div key={window.label} className="grid grid-cols-[2rem_1fr_auto] items-center gap-2 text-[10px]">
              <span className="font-medium">{window.label}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-[color:var(--border)]">
                <span className="block h-full rounded-full bg-[color:var(--brand)]" style={{ width: `${Math.round((window.ratio ?? 0) * 100)}%` }} />
              </span>
              <span className="tabular-nums text-[color:var(--text-muted)]">{window.probes}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative grid grid-cols-3 gap-2">
        <Metric label="Probes" value={`${entry.record.totalProbes}`} />
        <Metric label="Answered" value={`${entry.record.totalAnswered}`} />
        <Metric label="Observed" value={entry.record.firstSeen ? `${Math.max(1, Math.ceil(entry.record.observedDays))}d` : '—'} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-raised)] px-3 py-2">
      <strong className="text-sm tabular-nums text-[color:var(--text)]">{value}</strong>
      <span className="text-[9px] uppercase tracking-wide text-[color:var(--text-faint)]">{label}</span>
    </span>
  );
}

function AgentQuickView({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { listing } = entry;
  const { agent } = listing;
  const category = CATEGORY_BY_ID.get(listing.category);
  const verdict = verdictFor(entry);
  const hirable = offersDirectHire(entry);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="agent-quick-view-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="agent-quick-view m-auto w-[min(94vw,920px)] max-w-none overflow-hidden rounded-[1.6rem] border border-[color:var(--border)] bg-[color:var(--surface)] p-0 text-[color:var(--text)] shadow-2xl"
    >
      <div className="grid max-h-[88svh] overflow-y-auto lg:grid-cols-[0.92fr_1.08fr]">
        <div className="flex flex-col gap-6 bg-[color:var(--bg-subtle)] p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <AgentAvatar name={agent.name} src={agent.image_url} size="lg" />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--brand)]">{category?.label}</span>
                <h3 id="agent-quick-view-title" className="line-clamp-2 text-xl font-semibold">{agent.name}</h3>
              </span>
            </div>
            <button type="button" onClick={onClose} aria-label="Close agent preview" className="grid size-9 shrink-0 place-items-center rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] text-sm transition-colors hover:bg-[color:var(--surface-hover)]">×</button>
          </div>

          <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">{agent.description?.trim() || 'No description published.'}</p>
          <div className="mt-auto flex flex-wrap items-center gap-2">
            <EvidenceBadge verdict={verdict} />
            <span className="rounded-full border border-[color:var(--border)] px-2.5 py-1 text-[10px] text-[color:var(--text-muted)]">ERC-8004 · {chainLabel(agent.chain_id)}</span>
            {listing.attestationCount > 0 && <span className="rounded-full border border-[color:var(--border)] px-2.5 py-1 text-[10px] text-[color:var(--text-muted)]">{listing.attestationCount} attestations</span>}
          </div>
        </div>

        <div className="flex flex-col gap-5 p-5 sm:p-7">
          <EvidenceVisual entry={entry} />
          <div className="flex flex-col gap-3 rounded-2xl border border-[color:var(--border)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">Published terms</span>
              <strong className="mt-0.5 text-base">{listing.quote ? formatQuotedPrice(listing.quote.priceU) : 'No signed price yet'}</strong>
            </span>
            <div className="flex gap-2">
              <Link href={`/agents/${agent.chain_id}/${agent.token_id}`} className="rounded-[var(--radius)] border border-[color:var(--border-strong)] px-4 py-2.5 text-xs font-medium">Full evidence</Link>
              {hirable && <Link href={`/hire/${agent.chain_id}/${agent.token_id}`} className="action-primary rounded-[var(--radius)] px-4 py-2.5 text-xs font-semibold">{listing.quote ? 'Hire agent' : 'Offer budget'}</Link>}
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}

/** A framed, carousel-style showcase with an evidence quick-view modal. */
export function HireableNow({ entries }: { entries: Entry[] }) {
  const [activeTab, setActiveTab] = useState<Spotlight>('recommended');
  const [index, setIndex] = useState(0);
  const [preview, setPreview] = useState<Entry | null>(null);
  const eligible = useMemo(() => entries.filter((entry) => isPromotableAgent(entry.listing.agent)), [entries]);
  const ranked = useMemo(() => rankedFor(activeTab, eligible), [activeTab, eligible]);
  const current = ranked[index % Math.max(ranked.length, 1)];
  const next = ranked[(index + 1) % Math.max(ranked.length, 1)];

  if (!current) return null;

  const category = CATEGORY_BY_ID.get(current.listing.category);
  const verdict = verdictFor(current);
  const move = (direction: number) => setIndex((value) => (value + direction + ranked.length) % ranked.length);
  const setTab = (tab: Spotlight) => { setActiveTab(tab); setIndex(0); };

  return (
    <section className="flex flex-col gap-5" aria-labelledby="agent-spotlight-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
{/*
            No eyebrow above the heading.

            Every section on this page opened with a small caps label and
            then a heading that said the same thing: "Live proof" over "This
            is what checking an agent looks like", "Browse by outcome" over
            "Begin with the job, not the protocol". Six of them, and a label
            that appears on every block stops being read as a label at all —
            it becomes texture, and it pushes the sentence that does the work
            further down. The headings carry it alone.
          */}
          <h2 id="agent-spotlight-heading" className="font-[family-name:var(--font-serif)] text-2xl sm:text-3xl">Meet agents through their evidence.</h2>
          <p className="mt-2 text-sm text-[color:var(--text-muted)]">Preview what an agent does, what Pokter observed, and whether its terms are ready—without leaving this page.</p>
        </div>
        <Link href="/agents" className="text-[12px] font-medium text-[color:var(--info)] underline decoration-dotted underline-offset-2">Explore all {entries.length} agents →</Link>
      </div>

      <div className="spotlight-stage overflow-hidden rounded-[1.8rem] border border-[color:var(--border)] p-4 sm:p-7">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div role="tablist" aria-label="Spotlight agents" className="flex gap-1 rounded-full bg-[color:var(--surface)]/80 p-1">
            {(['recommended', 'recent'] as const).map((tab) => (
              <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} onClick={() => setTab(tab)} className={`rounded-full px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-colors ${activeTab === tab ? 'bg-[color:var(--text)] text-[color:var(--bg)]' : 'text-[color:var(--text-muted)]'}`}>
                {tab === 'recommended' ? 'Recommended' : 'Latest evidence'}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => move(-1)} aria-label="Previous spotlight agent" className="grid size-9 place-items-center rounded-full border border-[color:var(--border-strong)] bg-[color:var(--surface)]/80 text-sm transition-transform hover:-translate-x-0.5">←</button>
            <button type="button" onClick={() => move(1)} aria-label="Next spotlight agent" className="grid size-9 place-items-center rounded-full border border-[color:var(--border-strong)] bg-[color:var(--surface)] text-sm transition-transform hover:translate-x-0.5">→</button>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,2.2fr)_minmax(230px,0.8fr)]">
          <button type="button" onClick={() => setPreview(current)} className="group grid min-w-0 overflow-hidden rounded-2xl border border-[color:var(--border-strong)] bg-[color:var(--surface)] text-left shadow-sm transition-transform duration-200 hover:-translate-y-0.5 lg:grid-cols-[0.92fr_1.08fr]">
            <div className="flex min-w-0 flex-col gap-4 p-5 sm:p-7">
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-[color:var(--border)] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-[color:var(--info)]">{category?.label}</span>
                <EvidenceBadge verdict={verdict} />
              </div>
              <div className="flex items-center gap-3">
                <AgentAvatar name={current.listing.agent.name} src={current.listing.agent.image_url} size="lg" />
                <h3 className="line-clamp-2 text-xl font-semibold sm:text-2xl">{current.listing.agent.name}</h3>
              </div>
              <p className="line-clamp-3 text-sm leading-relaxed text-[color:var(--text-muted)]">{current.listing.agent.description?.trim() || 'No description published.'}</p>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
                <span className="text-xs font-medium">{current.listing.quote ? formatQuotedPrice(current.listing.quote.priceU) : 'No signed price'}</span>
                <span className="text-xs font-semibold text-[color:var(--info)]">Open evidence preview ↗</span>
              </div>
            </div>
            <div className="p-3 sm:p-4"><EvidenceVisual entry={current} /></div>
          </button>

          {next && (
            <button type="button" onClick={() => setPreview(next)} className="group hidden min-w-0 flex-col justify-between overflow-hidden rounded-2xl border border-[color:var(--border-strong)] bg-[color:var(--surface)] p-5 text-left shadow-sm transition-transform duration-200 hover:-translate-y-0.5 lg:flex">
              <div>
                <span className="text-[9px] font-semibold uppercase tracking-wide text-[color:var(--brand)]">Up next</span>
                <div className="mt-5 flex items-center gap-3"><AgentAvatar name={next.listing.agent.name} src={next.listing.agent.image_url} size="sm" /><h3 className="line-clamp-2 text-lg font-semibold">{next.listing.agent.name}</h3></div>
                <p className="mt-4 line-clamp-4 text-xs leading-relaxed text-[color:var(--text-muted)]">{next.listing.agent.description?.trim() || 'No description published.'}</p>
              </div>
              <span className="mt-6 text-xs font-semibold text-[color:var(--info)]">Quick view →</span>
            </button>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)]/70 px-4 py-3">
          <span className="text-sm font-medium">Explore the complete evidence-ranked marketplace</span>
          <Link href="/agents" className="action-primary rounded-[var(--radius)] px-4 py-2 text-[11px] font-semibold">Browse marketplace →</Link>
        </div>
      </div>

      {preview && <AgentQuickView entry={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}
