'use client';

import { useState } from 'react';

import { cn } from '@/lib/ui/cn';
import type { AgentOps } from './data';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Jobs funded per week: one series, so one ink colour and no legend; the
 * completed count rides in the tooltip and the table, not in a second hue.
 */
export function WeeklyJobs({ weeks }: { weeks: AgentOps['weeks'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...weeks.map((w) => w.funded));
  const H = 96;
  const total = weeks.reduce((s, w) => s + w.funded, 0);
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex items-baseline justify-between">
        <span className="text-[13px] font-medium">Jobs funded per week</span>
        <span className="text-[12px] text-ink-3">last 8 weeks · {total} total</span>
      </figcaption>
      <div className="relative">
        <svg viewBox={`0 0 ${weeks.length * 40} ${H + 18}`} className="h-[120px] w-full" role="img" aria-label={`Jobs funded per week over 8 weeks, ${total} in total`}>
          <line x1="0" x2={weeks.length * 40} y1={H} y2={H} stroke="var(--rule-strong)" strokeWidth="1" />
          {weeks.map((w, i) => {
            const h = w.funded === 0 ? 0 : Math.max(4, (w.funded / max) * (H - 8));
            return (
              <g key={w.start} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                {/* Hit target larger than the mark. */}
                <rect x={i * 40} y={0} width={40} height={H} fill="transparent" />
                {h > 0 && <rect x={i * 40 + 10} y={H - h} width={20} height={h} rx={4} fill={hover === i ? 'var(--ink)' : 'var(--ink-2)'} />}
                <text x={i * 40 + 20} y={H + 14} textAnchor="middle" fontSize="10" fill="var(--ink-3)">
                  {i % 2 === 1 ? fmtDate(w.start) : ''}
                </text>
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div className="pointer-events-none absolute -top-2 rounded-[8px] border border-rule bg-raised px-2.5 py-1.5 text-[12px] shadow-lift" style={{ left: `${(hover / weeks.length) * 100}%` }}>
            <p className="font-medium">Week of {fmtDate(weeks[hover].start)}</p>
            <p className="text-ink-2">
              {weeks[hover].funded} funded · {weeks[hover].completed} completed
            </p>
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>Jobs per week</caption>
        <thead>
          <tr>
            <th>Week of</th>
            <th>Funded</th>
            <th>Completed</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.start}>
              <td>{w.start}</td>
              <td>{w.funded}</td>
              <td>{w.completed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Reply latency of successful probes: one line, recessive axis, crosshair on hover. */
export function LatencyTrend({ points }: { points: AgentOps['latency'] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) {
    return <p className="text-[13px] text-ink-3">Not enough answered probes in 30 days to draw a trend.</p>;
  }
  const W = 400;
  const H = 90;
  const max = Math.max(...points.map((p) => p.ms)) * 1.1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (ms: number) => H - (ms / max) * (H - 6);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.ms).toFixed(1)}`).join(' ');
  const sorted = [...points].map((p) => p.ms).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex items-baseline justify-between">
        <span className="text-[13px] font-medium">Reply time, answered probes</span>
        <span className="t-readout text-[12px] text-ink-3">median {median} ms</span>
      </figcaption>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-[100px] w-full overflow-visible"
          role="img"
          aria-label={`Reply time over the last ${points.length} answered probes, median ${median} milliseconds`}
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            setHover(Math.round(((e.clientX - r.left) / r.width) * (points.length - 1)));
          }}
          onMouseLeave={() => setHover(null)}
        >
          <line x1="0" x2={W} y1={y(median)} y2={y(median)} stroke="var(--rule-strong)" strokeDasharray="3 3" />
          <path d={d} fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {hover !== null && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke="var(--rule-strong)" vectorEffect="non-scaling-stroke" />
              <circle cx={x(hover)} cy={y(points[hover].ms)} r="4" fill="var(--ink)" stroke="var(--raised)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </>
          )}
        </svg>
        {hover !== null && (
          <div className={cn('pointer-events-none absolute -top-2 rounded-[8px] border border-rule bg-raised px-2.5 py-1.5 text-[12px] shadow-lift')} style={{ left: `min(${(hover / (points.length - 1)) * 100}%, calc(100% - 140px))` }}>
            <p className="t-readout font-medium">{points[hover].ms} ms</p>
            <p className="text-ink-3">{fmtTime(points[hover].at)}</p>
          </div>
        )}
      </div>
    </figure>
  );
}

/** The probe log as recorded, newest first. Status carries an icon and a word, never colour alone. */
export function ProbeLog({ probes }: { probes: AgentOps['probes'] }) {
  if (probes.length === 0) return <p className="text-[13px] text-ink-3">No probes in the last 30 days.</p>;
  return (
    <div className="overflow-x-auto rounded-[12px] border border-rule">
      <table className="w-full min-w-[520px] text-left text-[13px]">
        <thead className="bg-sunken/70">
          <tr>
            {['When', 'Result', 'Reply', 'Detail'].map((h) => (
              <th key={h} scope="col" className="t-label px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-rule bg-raised">
          {probes.map((p) => (
            <tr key={p.at}>
              <td className="whitespace-nowrap px-3 py-2 text-ink-2">{fmtTime(p.at)}</td>
              <td className="whitespace-nowrap px-3 py-2">
                <span className={cn('inline-flex items-center gap-1.5 font-medium', p.ok ? 'text-ok' : 'text-bad')}>
                  <span aria-hidden>{p.ok ? '✓' : '✕'}</span>
                  {p.ok ? 'Answered' : 'Failed'}
                </span>
              </td>
              <td className="t-readout whitespace-nowrap px-3 py-2 text-ink-2">{p.latencyMs !== null ? `${p.latencyMs} ms` : '—'}{p.status ? ` · ${p.status}` : ''}</td>
              <td className="max-w-[320px] truncate px-3 py-2 text-ink-3" title={p.detail}>
                {p.detail}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
