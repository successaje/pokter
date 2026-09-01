import Link from 'next/link';

import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import type { FloorNode } from '@/lib/marketplace';

/**
 * The hero illustration: agents being checked, drawn from real measurements.
 *
 * Every tile is an agent actually in the registry and every state is what our
 * probes actually found — so the thing decorating the landing page is the
 * product's function rather than a picture of it. A hero that invented its
 * agents would undercut the argument on the same screen that makes it.
 *
 * Pure CSS and SVG: no canvas, no runtime library, and nothing that stops
 * working when a script fails. The sweep is a stroke animation; the tiles pulse
 * on a stagger derived from their index so the floor reads as being scanned
 * continuously rather than blinking at random.
 */
function toneFor(node: FloorNode): { fill: string; ring: string; label: string } {
  if (node.uptime === null) {
    return {
      fill: 'var(--surface-raised)',
      ring: 'var(--border-strong)',
      label: 'not yet measured',
    };
  }
  if (node.uptime === 0) {
    return {
      fill: 'var(--negative-dim)',
      ring: 'var(--negative)',
      label: 'answered nothing',
    };
  }
  if (node.uptime >= 0.99) {
    return {
      fill: 'var(--positive-dim)',
      ring: 'var(--positive)',
      label: 'answering',
    };
  }
  return {
    fill: 'var(--caution-dim)',
    ring: 'var(--caution)',
    label: 'intermittent',
  };
}

export function VerificationFloor({ nodes }: { nodes: FloorNode[] }) {
  if (nodes.length === 0) return null;

  const answering = nodes.filter((n) => (n.uptime ?? 0) > 0).length;
  const failing = nodes.filter((n) => n.uptime === 0).length;
  const unmeasured = nodes.filter((n) => n.uptime === null).length;

  return (
    <div className="relative flex flex-col gap-4">
      {/* The sweep line: one pass every few seconds, marking the act of checking. */}
      <div className="floor relative overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--bg-subtle)] p-4">
        <div aria-hidden className="floor-sweep" />

        <div className="relative grid grid-cols-4 gap-2 sm:grid-cols-4">
          {nodes.map((node, index) => {
            const tone = toneFor(node);
            const meta = CATEGORY_BY_ID.get(node.category);

            return (
              <Link
                key={`${node.chainId}:${node.tokenId}`}
                href={`/agents/${node.chainId}/${node.tokenId}`}
                title={`${node.name} — ${tone.label}${node.probes ? ` (${node.probes} probes)` : ''}`}
                style={{
                  background: tone.fill,
                  borderColor: tone.ring,
                  animationDelay: `${(index % 8) * 260}ms`,
                }}
                className="floor-tile group relative flex aspect-square flex-col justify-between rounded-[var(--radius)] border p-2 transition-transform duration-200 hover:z-10 hover:scale-[1.06]"
              >
                <span
                  aria-hidden
                  className="size-1.5 rounded-full"
                  style={{ background: tone.ring }}
                />
                <span className="line-clamp-2 text-[8px] leading-tight text-[color:var(--text-muted)] sm:text-[9px]">
                  {meta?.label ?? 'Agent'}
                </span>

                {/* Revealed on hover: which agent this actually is. */}
                <span className="pointer-events-none absolute inset-x-1 bottom-full z-20 mb-1.5 hidden rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface-raised)] p-2 text-[10px] leading-snug shadow-xl group-hover:block">
                  <span className="block font-medium">{node.name}</span>
                  <span className="block text-[color:var(--text-faint)]">
                    {node.uptime === null
                      ? 'Not yet measured'
                      : `${(node.uptime * 100).toFixed(0)}% of ${node.probes} probes`}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      <dl className="flex flex-wrap gap-x-5 gap-y-1.5 text-[11px]">
        {[
          { n: answering, label: 'answering', color: 'var(--positive)' },
          { n: failing, label: 'answered nothing', color: 'var(--negative)' },
          { n: unmeasured, label: 'not yet measured', color: 'var(--neutral)' },
        ]
          .filter((entry) => entry.n > 0)
          .map((entry) => (
            <div key={entry.label} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{ background: entry.color }}
              />
              <dt className="tabular text-[color:var(--text)]">{entry.n}</dt>
              <dd className="text-[color:var(--text-muted)]">{entry.label}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}
