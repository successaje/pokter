import Link from 'next/link';

import { formatCompact } from '@/lib/ui/format';
import type { PipelineEvent, PipelinePayload } from '@/lib/hero/pipeline';

const EXPLORER = 'https://testnet.bscscan.com/tx/';

const EVENT_TONE: Record<PipelineEvent['kind'], { mark: string; color: string }> = {
  verified: { mark: '✓', color: 'var(--positive)' },
  evidence: { mark: '◉', color: 'var(--info)' },
  session: { mark: '🔐', color: 'var(--info)' },
  escrow: { mark: '⚡', color: 'var(--caution)' },
  blocked: { mark: '⚠', color: 'var(--negative)' },
};

/**
 * The hero: agents narrowing from the registry down to one you could hire.
 *
 * The counts fall from hundreds of thousands to a handful, which is the actual
 * shape of this registry and the reason the product exists. Every rejection
 * reason is the string the recommendation engine would really produce, and the
 * permission capsule is the shape of a session we have granted on-chain.
 *
 * Built from CSS and real data rather than a canvas animation: the stages stay
 * readable with motion disabled, and nothing here is a rendering of something
 * that did not happen.
 */
export function AgentPipeline({ payload }: { payload: PipelinePayload }) {
  const { stages, events, capsule, survivor } = payload;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--bg-subtle)]">
        <div aria-hidden className="floor-sweep" />

        <ol className="relative flex flex-col divide-y divide-[color:var(--border)]">
          {stages.map((stage, index) => (
            <li
              key={stage.id}
              style={{ animationDelay: `${index * 700}ms` }}
              className="stage-row flex items-center gap-3 px-4 py-3"
            >
              <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full border border-[color:var(--border-strong)] text-[10px] text-[color:var(--text-muted)]">
                {index + 1}
              </span>

              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-baseline gap-2">
                  <span className="text-[13px] font-medium">{stage.label}</span>
                  <span className="tabular text-[10px] text-[color:var(--text-faint)]">
                    {stage.count === null ? '—' : formatCompact(stage.count)}
                  </span>
                </span>

                {/* The agent that survived this stage, travelling down. */}
                {stage.passing && (
                  <span className="truncate text-[10px] text-[color:var(--text-muted)]">
                    {stage.passing}
                  </span>
                )}
              </div>

              {/* What fell out here, and why. */}
              {stage.rejected && (
                <span
                  style={{ animationDelay: `${index * 700 + 350}ms` }}
                  className="reject-card hidden max-w-[45%] shrink-0 flex-col items-end gap-0.5 text-right sm:flex"
                >
                  <span className="truncate text-[10px] text-[color:var(--negative)]">
                    ✕ {stage.rejected.name}
                  </span>
                  <span className="truncate text-[9px] uppercase tracking-wide text-[color:var(--text-faint)]">
                    {stage.rejected.reason}
                  </span>
                </span>
              )}
            </li>
          ))}
        </ol>

        {/* The survivor, wrapped in the permissions it would run under. */}
        {survivor && capsule && (
          <div className="relative border-t border-[color:var(--border-strong)] bg-[color:var(--surface)] p-4">
            <p className="text-[10px] font-medium uppercase tracking-widest text-[color:var(--positive)]">
              Ready to hire
            </p>
            <Link
              href={`/agents/${survivor.chainId}/${survivor.tokenId}`}
              className="mt-1 block truncate text-[13px] font-medium hover:underline"
            >
              {survivor.name}
            </Link>
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {[capsule.spend, capsule.expiry, capsule.venue].map((item, i) => (
                <li
                  key={item}
                  style={{ animationDelay: `${3600 + i * 160}ms` }}
                  className="capsule-chip rounded-full border border-[color:var(--border-strong)] px-2 py-0.5 text-[10px] text-[color:var(--text-secondary)]"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* The control-room layer: what has actually happened. */}
      <ul className="flex flex-col gap-1.5 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-3">
        {events.slice(0, 4).map((event, index) => {
          const tone = EVENT_TONE[event.kind];
          return (
            <li
              key={`${event.title}-${index}`}
              style={{ animationDelay: `${index * 220}ms` }}
              className="reveal flex items-center gap-2.5 text-[11px]"
            >
              <span aria-hidden style={{ color: tone.color }}>
                {tone.mark}
              </span>
              <span className="shrink-0 font-medium">{event.title}</span>
              <span className="truncate text-[color:var(--text-muted)]">
                {event.detail}
              </span>
              {event.txHash && (
                <a
                  href={`${EXPLORER}${event.txHash}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mono ml-auto shrink-0 text-[10px] text-[color:var(--info)] underline decoration-dotted underline-offset-2"
                >
                  {event.txHash.slice(0, 8)}…
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
