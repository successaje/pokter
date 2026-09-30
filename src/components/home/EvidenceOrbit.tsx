import Link from 'next/link';

import { explorerTxUrl } from '@/lib/network/presentation';
import type { PipelineEvent } from '@/lib/hero/pipeline';

const NODES = [
  { label: 'Identity', detail: 'ERC-8004', position: 'left-[2%] top-[12%]' },
  { label: 'Live check', detail: 'A2A probe', position: 'right-[1%] top-[18%]' },
  { label: 'Terms', detail: 'Signed quote', position: 'left-[1%] bottom-[14%]' },
  { label: 'Settlement', detail: 'ERC-8183', position: 'right-[2%] bottom-[10%]' },
] as const;

/**
 * A compact map of Pokter's decision path. The diagram is decorative, but the
 * event in its centre is not: when a transaction is available it links to the
 * explorer, so the hero's strongest claim can be checked instead of admired.
 */
export function EvidenceOrbit({ events }: { events: PipelineEvent[] }) {
  const event = events.find((candidate) => candidate.txHash) ?? events[0];

  return (
    <div className="evidence-orbit relative mx-auto aspect-[1.08/1] w-full max-w-[520px] overflow-hidden rounded-[2rem] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-5 sm:p-7">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,color-mix(in_srgb,var(--brand)_13%,transparent),transparent_48%)]" />
      <div className="orbit-ring absolute left-1/2 top-1/2 aspect-square w-[72%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-[color:var(--border-strong)]" />
      <div className="orbit-ring orbit-ring-delayed absolute left-1/2 top-1/2 aspect-square w-[47%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[color:var(--brand)]/25" />

      {NODES.map((node, index) => (
        <div
          key={node.label}
          className={`orbit-node absolute ${node.position} z-10 flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/90 px-3 py-2 shadow-sm backdrop-blur-md`}
          style={{ animationDelay: `${index * 380}ms` }}
        >
          <span className="grid size-7 place-items-center rounded-lg bg-[color:var(--brand)]/10 text-[11px] font-bold text-[color:var(--brand)]">
            {index + 1}
          </span>
          <span className="flex flex-col">
            <span className="text-[11px] font-semibold">{node.label}</span>
            <span className="text-[9px] text-[color:var(--text-faint)]">{node.detail}</span>
          </span>
        </div>
      ))}

      <div className="absolute left-1/2 top-1/2 z-20 w-[52%] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[color:var(--border-strong)] bg-[color:var(--surface-raised)] p-4 shadow-xl sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
            <span className="live-dot size-2 rounded-full bg-[color:var(--positive)]" />
            Evidence path
          </span>
          <span className="rounded-full bg-[color:var(--positive-dim)] px-2 py-1 text-[9px] font-semibold text-[color:var(--positive)]">
            Verifiable
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <p className="line-clamp-1 text-xs font-semibold sm:text-sm">
            {event?.title ?? 'Agent evidence checked'}
          </p>
          <p className="line-clamp-2 text-[10px] leading-relaxed text-[color:var(--text-muted)] sm:text-[11px]">
            {event?.detail ?? 'Identity, availability and terms are checked before money moves.'}
          </p>
        </div>

        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[color:var(--border)]">
          <span className="evidence-progress block h-full rounded-full bg-[color:var(--brand)]" />
        </div>

        {event?.txHash ? (
          <a
            href={explorerTxUrl(event.txHash)}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-4 inline-flex text-[10px] font-medium text-[color:var(--info)] underline decoration-dotted underline-offset-2"
          >
            Inspect transaction ↗
          </a>
        ) : (
          <Link
            href="/methodology"
            className="mt-4 inline-flex text-[10px] font-medium text-[color:var(--info)] underline decoration-dotted underline-offset-2"
          >
            See how evidence works →
          </Link>
        )}
      </div>

      <span className="absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] uppercase tracking-[0.18em] text-[color:var(--text-faint)]">
        Registry → evidence → controlled execution
      </span>
    </div>
  );
}
