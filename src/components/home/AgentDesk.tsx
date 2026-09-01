import type { PipelineEvent } from '@/lib/hero/pipeline';

const EXPLORER = 'https://testnet.bscscan.com/tx/';

const TONE: Record<PipelineEvent['kind'], { mark: string; color: string; dim: string }> = {
  verified: { mark: '✓', color: 'var(--positive)', dim: 'var(--positive-dim)' },
  evidence: { mark: '◉', color: 'var(--info)', dim: 'var(--info-dim)' },
  session: { mark: '🔐', color: 'var(--info)', dim: 'var(--info-dim)' },
  escrow: { mark: '⚡', color: 'var(--caution)', dim: 'var(--caution-dim)' },
  blocked: { mark: '⚠', color: 'var(--negative)', dim: 'var(--negative-dim)' },
};

/** Where each card sits around the desk, and when it drifts in. */
const SLOTS = [
  'left-0 top-[6%] sm:top-[10%]',
  'right-0 top-[22%]',
  'left-0 bottom-[26%]',
  'right-0 bottom-[8%]',
];

/**
 * The hero scene: an agent at a workstation, with evidence arriving around it.
 *
 * The character is the Pokter mark given a body — an open frame with a solid
 * core — rather than a mascot, because the product is about scrutiny and a
 * cute animal would undercut that. Flat geometry with thick strokes, one accent
 * colour, and idle motion measured in millimetres.
 *
 * The cards floating around it are real events with real transactions. The
 * illustration is drawn; the claims inside it are not.
 */
export function AgentDesk({ events }: { events: PipelineEvent[] }) {
  const cards = events.slice(0, 4);

  return (
    <div className="relative mx-auto w-full max-w-[520px] px-2 py-4">
      <svg
        viewBox="0 0 320 260"
        className="desk w-full"
        role="img"
        aria-label="An agent at a workstation, reviewing evidence"
      >
        {/* Ground shadow, anchoring the scene. */}
        <ellipse cx="160" cy="228" rx="94" ry="7" fill="currentColor" opacity="0.07" />

        {/* Monitor. */}
        <g className="desk-monitor">
          <rect
            x="84" y="18" width="152" height="92" rx="10"
            fill="var(--surface)" stroke="currentColor" strokeWidth="3.5" opacity="0.95"
          />
          {/* Screen content: three evidence bars filling, and a verdict landing. */}
          <rect x="98" y="32" width="52" height="6" rx="3" fill="currentColor" opacity="0.25" />
          <rect className="bar bar-1" x="98" y="48" width="94" height="8" rx="4" fill="var(--positive)" />
          <rect className="bar bar-2" x="98" y="64" width="68" height="8" rx="4" fill="var(--caution)" />
          <rect className="bar bar-3" x="98" y="80" width="42" height="8" rx="4" fill="var(--negative)" />
          <path
            className="tick"
            d="M198 78 l8 8 l15 -17"
            fill="none" stroke="var(--positive)" strokeWidth="4.5"
            strokeLinecap="round" strokeLinejoin="round"
          />
          {/* Stand. */}
          <rect x="152" y="110" width="16" height="14" rx="3" fill="currentColor" opacity="0.4" />
          <rect x="136" y="124" width="48" height="6" rx="3" fill="currentColor" opacity="0.4" />
        </g>

        {/* Desk. */}
        <rect x="40" y="130" width="240" height="7" rx="3.5" fill="currentColor" opacity="0.55" />
        <rect x="64" y="137" width="6" height="86" rx="3" fill="currentColor" opacity="0.28" />
        <rect x="250" y="137" width="6" height="86" rx="3" fill="currentColor" opacity="0.28" />

        {/* The agent: the Pokter mark, given shoulders. */}
        <g className="desk-agent">
          <rect
            x="130" y="140" width="60" height="56" rx="16"
            fill="var(--bg)" stroke="currentColor" strokeWidth="3.5"
          />
          {/* The solid core — the verified part of the claim. */}
          <rect x="147" y="158" width="26" height="19" rx="6" fill="var(--brand-highlight)" />
          {/* Antenna, pulsing to mark that it is actively checking. */}
          <line x1="160" y1="140" x2="160" y2="130" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
          <circle className="antenna" cx="160" cy="126" r="4.5" fill="var(--positive)" />
        </g>

        {/* Arms reaching to the desk. */}
        <path
          d="M130 168 q-22 -4 -28 -30" fill="none"
          stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" opacity="0.75"
        />
        <path
          d="M190 168 q22 -4 28 -30" fill="none"
          stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" opacity="0.75"
        />

        {/* Evidence sheets stacked on the desk. */}
        <rect className="sheet sheet-1" x="52" y="116" width="32" height="14" rx="3" fill="var(--surface-raised)" stroke="currentColor" strokeWidth="2.5" />
        <rect className="sheet sheet-2" x="238" y="118" width="28" height="12" rx="3" fill="var(--surface-raised)" stroke="currentColor" strokeWidth="2.5" />
      </svg>

      {/* Real events, drifting around the scene. */}
      {cards.map((event, index) => {
        const tone = TONE[event.kind];
        const body = (
          <>
            <span aria-hidden style={{ color: tone.color }} className="text-[11px]">
              {tone.mark}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[10px] font-medium">{event.title}</span>
              <span className="truncate text-[9px] text-[color:var(--text-muted)]">
                {event.detail}
              </span>
            </span>
          </>
        );

        return (
          <div
            key={`${event.title}-${index}`}
            style={{
              animationDelay: `${index * 900}ms`,
              borderColor: tone.color,
              background: tone.dim,
            }}
            className={`event-card absolute ${SLOTS[index]} flex max-w-[46%] items-center gap-2 rounded-[var(--radius)] border px-2.5 py-1.5 shadow-sm backdrop-blur-sm sm:max-w-[42%]`}
          >
            {event.txHash ? (
              <a
                href={`${EXPLORER}${event.txHash}`}
                target="_blank"
                rel="noreferrer noopener"
                className="flex min-w-0 items-center gap-2"
              >
                {body}
              </a>
            ) : (
              body
            )}
          </div>
        );
      })}
    </div>
  );
}
