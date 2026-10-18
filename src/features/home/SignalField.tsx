/**
 * The moving field behind the closing call to action.
 *
 * It is a probe strip, not an ornament. Pokter's whole claim is that it
 * calls these agents on a schedule and keeps what came back, and the
 * fourteen-bar strip on every agent card is how that is shown everywhere
 * else on the site. This is the same mark at the scale of a wall: tall
 * bars answered, short ones did not, and the field keeps moving because
 * the probing does.
 *
 * Deliberately generative rather than a measurement. It is decoration at
 * this size and labelling it with real figures would make a reader think
 * a specific agent is being shown; `aria-hidden` and the lack of any
 * number say it is a texture. Everywhere a strip carries real data it is
 * `ProbeStrip`, with its own `role="img"` and a label.
 *
 * Deterministic on purpose. A server-rendered `Math.random()` disagrees
 * with the client's and React throws the whole subtree away on hydration;
 * the shape below is a function of the index, so both sides draw it the
 * same.
 */

const BARS = 88;

/* A cheap integer hash. Stable across server and client, unlike Math.random. */
function noise(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

interface Bar {
  height: number;
  low: number;
  high: number;
  duration: number;
  delay: number;
  hot: boolean;
}

function bar(i: number): Bar {
  /*
   * Two slow waves plus jitter. One wave alone reads as a sine and a
   * field of pure noise reads as static; together they look like
   * something was measured.
   */
  const wave = Math.sin(i * 0.17) * 0.26 + Math.sin(i * 0.063 + 1.1) * 0.3;
  const jitter = noise(i, 1) * 0.34;
  const height = Math.min(1, Math.max(0.06, 0.4 + wave + jitter - 0.17));
  const swing = 0.22 + noise(i, 2) * 0.5;
  return {
    height,
    low: Math.max(0.12, 1 - swing),
    high: 1,
    duration: 2.6 + noise(i, 3) * 3.8,
    delay: -noise(i, 4) * 6,
    // A minority run bright, so the field has highlights rather than one tone.
    hot: noise(i, 5) > 0.76,
  };
}

export function SignalField({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden>
      <div className="flex h-full w-full items-end justify-end gap-[3px] sm:gap-[4px]">
        {Array.from({ length: BARS }, (_, i) => {
          const b = bar(i);
          return (
            <span
              key={i}
              className="signal-bar w-[3px] shrink-0 rounded-[1px] sm:w-[4px]"
              style={{
                height: `${(b.height * 100).toFixed(2)}%`,
                background: b.hot ? 'var(--signal-ink)' : 'color-mix(in oklab, var(--signal-ink) 55%, transparent)',
                opacity: b.hot ? 0.9 : 0.34 + noise(i, 6) * 0.3,
                ['--lo' as string]: b.low.toFixed(3),
                ['--hi' as string]: b.high.toFixed(3),
                animationDuration: `${b.duration.toFixed(2)}s`,
                animationDelay: `${b.delay.toFixed(2)}s`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
