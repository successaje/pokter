'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { shortNetworkLabel } from '@/lib/network/presentation';

export interface HireMark {
  chainId: number;
  jobId: string;
  agentName: string;
  hiredAt: string;
  status: string;
  funder: 'outside' | 'team' | 'self';
}

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 30;
const FUNDED = new Set(['FUNDED', 'SUBMITTED', 'COMPLETED', 'EXPIRED']);

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function dateLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(iso));
}

function fullDateLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso));
}

function fromReceipts(payload: unknown): HireMark[] | null {
  if (!payload || typeof payload !== 'object' || !('receipts' in payload) || !Array.isArray(payload.receipts)) return null;
  return payload.receipts.flatMap((row: unknown): HireMark[] => {
    if (!row || typeof row !== 'object') return [];
    const r = row as Record<string, unknown>;
    const budget = r.budget && typeof r.budget === 'object' ? (r.budget as Record<string, unknown>).raw : null;
    if ((r.chainId !== 56 && r.chainId !== 97) || typeof r.jobId !== 'string' || typeof r.hiredAt !== 'string' || typeof r.status !== 'string' || !FUNDED.has(r.status)) return [];
    try { if (BigInt(String(budget ?? '0')) <= 0n) return []; } catch { return []; }
    const agent = r.agent && typeof r.agent === 'object' ? r.agent as Record<string, unknown> : {};
    return [{
      chainId: r.chainId,
      jobId: r.jobId,
      agentName: typeof agent.name === 'string' ? agent.name : `Agent #${r.jobId}`,
      hiredAt: r.hiredAt,
      status: r.status,
      funder: r.selfHire === true ? 'self' : r.fundedByPokter === true ? 'team' : 'outside',
    }];
  });
}

/** A moving replay of real escrow jobs. The public receipt index is re-read while the page is open. */
export function HirePulse({ initial, initialAsOf }: { initial: HireMark[]; initialAsOf: number }) {
  const [marks, setMarks] = useState(initial);
  const [asOf, setAsOf] = useState(initialAsOf);
  const chartScroll = useRef<HTMLDivElement>(null);
  const placedOnActivity = useRef(false);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const response = await fetch('/api/v1/receipts', { cache: 'no-store' });
        if (!response.ok) return;
        const next = fromReceipts(await response.json());
        if (active && next) {
          setMarks(next);
          setAsOf(Date.now());
        }
      } catch { /* Keep the last indexed view when a refresh fails. */ }
    };
    const timer = window.setInterval(refresh, 90_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  const { days, byDay, inWindow, recent, latest } = useMemo(() => {
    const today = new Date(asOf).toISOString().slice(0, 10);
    const start = Date.parse(`${today}T00:00:00Z`);
    const days = Array.from({ length: WINDOW_DAYS }, (_, i) => new Date(start - i * DAY_MS).toISOString().slice(0, 10));
    const byDay = new Map<string, HireMark[]>();
    for (const mark of marks) {
      const key = dayKey(mark.hiredAt);
      if (!days.includes(key)) continue;
      byDay.set(key, [...(byDay.get(key) ?? []), mark]);
    }
    const inWindow = [...byDay.values()].flat();
    return {
      days,
      byDay,
      inWindow,
      recent: marks.filter((mark) => Date.parse(mark.hiredAt) > asOf - DAY_MS).length,
      latest: marks.reduce<string | null>((current, mark) => !current || mark.hiredAt > current ? mark.hiredAt : current, null),
    };
  }, [marks, asOf]);

  useEffect(() => {
    if (placedOnActivity.current || !latest || !window.matchMedia('(max-width: 639px)').matches) return;
    const scroller = chartScroll.current;
    const cell = scroller?.querySelector<HTMLElement>('[data-latest-hire-day]');
    if (!scroller || !cell) return;
    scroller.scrollLeft += cell.getBoundingClientRect().left - scroller.getBoundingClientRect().left - 32;
    placedOnActivity.current = true;
  }, [latest]);

  return (
    <section aria-labelledby="hire-pulse-title" className="border-y border-rule py-9">
      <div className="grid gap-7 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:items-center lg:gap-10">
        <div>
          <span className="t-label inline-flex items-center gap-2"><span className="size-1.5 rounded-full bg-ok pulse motion-reduce:animate-none" aria-hidden /> Live receipt index</span>
          <h2 id="hire-pulse-title" className="mt-3 text-[25px] font-semibold tracking-[-0.035em]">Hires on the chain.</h2>
          <p className="mt-3 max-w-md text-[13.5px] leading-relaxed text-ink-2">Every mark is a funded escrow job. Follow one to its public evidence; team tests and self hires are outlined so you can tell them from outside buyers.</p>
          <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[12.5px]">
            <div><dt className="text-ink-3">Last 24h</dt><dd className="t-readout mt-1 text-[17px] text-ink">{recent} hires</dd></div>
            <div><dt className="text-ink-3">Last 30d</dt><dd className="t-readout mt-1 text-[17px] text-ink">{inWindow.length} hires</dd></div>
            <div><dt className="text-ink-3">Latest indexed hire</dt><dd className="t-readout mt-1 text-[17px] text-ink">{latest ? fullDateLabel(latest) : '—'}</dd></div>
          </dl>
          <Link href="/proof" className="mt-5 inline-flex text-[13px] font-medium text-ink hover:underline">Explore all receipts →</Link>
        </div>

        <div className="min-w-0 rounded-[14px] border border-rule bg-raised p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3 text-[11px] text-ink-3">
            <span className="t-label">30-day receipt replay</span>
            <span>Refreshes every 90s while open</span>
          </div>
          <div ref={chartScroll} className="mt-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
            <div className="relative min-w-[900px]">
              <span className="hire-scan pointer-events-none absolute inset-y-0 z-10 w-px bg-ok/50 motion-reduce:hidden" aria-hidden />
              {([56, 97] as const).map((chainId) => (
                <div key={chainId} className="grid grid-cols-[82px_minmax(0,1fr)] border-b border-rule/70">
                  <span className="pt-3 text-[11px] font-medium text-ink-2">{shortNetworkLabel(chainId)}</span>
                  <div className="grid grid-cols-[repeat(30,minmax(0,1fr))]">
                    {days.map((day, index) => (
                      <div key={day} data-latest-hire-day={chainId === 56 && latest && day === dayKey(latest) ? '' : undefined} className="flex min-h-20 flex-wrap content-start gap-1 border-l border-rule/50 px-1 py-3">
                        {(byDay.get(day) ?? []).filter((mark) => mark.chainId === chainId).map((mark) => (
                          <Link
                            key={`${mark.chainId}:${mark.jobId}`}
                            href={`/jobs/${mark.chainId}/${mark.jobId}`}
                            prefetch={false}
                            title={`${mark.agentName} · ${mark.status.toLowerCase()} · ${dateLabel(mark.hiredAt)} · ${mark.funder === 'outside' ? 'outside buyer' : mark.funder === 'team' ? 'Pokter team' : 'self hire'}`}
                            aria-label={`Job ${mark.jobId}: ${mark.agentName}, ${mark.status.toLowerCase()} on ${shortNetworkLabel(chainId).toLowerCase()}, ${dateLabel(mark.hiredAt)}. ${mark.funder === 'outside' ? 'Outside buyer' : mark.funder === 'team' ? 'Pokter team' : 'Self hire'}.`}
                            style={{ animationDelay: `${index * 0.6}s` }}
                            className={`hire-chip size-2 shrink-0 rounded-[2px] transition-transform hover:animate-none hover:scale-150 focus-visible:animate-none focus-visible:scale-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:animate-none ${mark.funder === 'outside' ? 'bg-ok' : 'border border-ink-3 bg-transparent'}`}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-[82px_minmax(0,1fr)]">
                <span className="pt-2 text-[10px] text-ink-3">Now → past</span>
                <div className="grid grid-cols-[repeat(30,minmax(0,1fr))] text-[10px] text-ink-3">
                  {days.map((day, index) => <span key={day} className="pt-2">{index % 7 === 0 ? (index === 0 ? 'Now' : dateLabel(`${day}T00:00:00Z`)) : ''}</span>)}
                </div>
              </div>
            </div>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-3">
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-[2px] bg-ok" /> Outside buyer</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-[2px] border border-ink-3" /> Team or self hire</span>
          </p>
        </div>
      </div>
    </section>
  );
}
