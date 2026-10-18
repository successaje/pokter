import { avatarUrl } from '@/lib/ui/avatar-art';
import { AvatarImage } from './AvatarImage';
import { cn } from '@/lib/ui/cn';
import { STALE_AFTER_DAYS, type StripCell } from '@/lib/history/strip';

/**
 * An agent's picture. Operators publish arbitrary image URLs, so only https
 * images are loaded, with no referrer, and any that fail to load fall back
 * to a generated mark seeded by chain and token, stable per agent.
 */
/**
 * Whether the agent answered the last time Pokter called, drawn on its
 * picture.
 *
 * Three states, because two would have to lie about one of them. An agent
 * that answered today and an agent that answered last month are both
 * "reachable" and a buyer should not have to treat them alike; an agent
 * Pokter has never got an answer out of is a third thing again, and
 * colouring it the same grey as "quiet lately" would be the worst of the
 * three to get wrong.
 *
 * Read from `sinceAnswer` — days since the last answered check — and not
 * from `answeringToday`, which was the first thing tried and was wrong.
 * That flag is false both when an agent failed today's probe and when
 * Pokter has not called today at all, and the two are not the same fact:
 * `ProbeStrip` below refuses to draw them alike for exactly this reason.
 * Keyed to today's probe, every agent in the catalogue turned amber until
 * the day's sweep had run.
 *
 * The green boundary is `STALE_AFTER_DAYS`, the same threshold at which
 * the verdict already starts saying how long ago the evidence is from, so
 * one agent does not read as current beside a verdict calling it stale.
 *
 * It is close to, but not the same as, the "Answered this week" count on
 * Discover: that is computed from the record's 7d window and this from its
 * daily buckets, so an agent sitting exactly on the boundary can land on
 * different sides of the two. Measured on the full catalogue the gap was
 * one agent in 51. Worth knowing before treating the dot as the filter.
 *
 * All three are measurements — Pokter called, and something answered or
 * did not. None of it is the operator's own claim about uptime, which is
 * the thing this site exists not to repeat.
 */
export type AnswerState = 'answering' | 'quiet' | 'silent';

export function answerState(row: { sinceAnswer: number | null }): AnswerState {
  if (row.sinceAnswer === null) return 'silent';
  return row.sinceAnswer <= STALE_AFTER_DAYS ? 'answering' : 'quiet';
}

const ANSWER_DOT: Record<AnswerState, { className: string; label: string }> = {
  answering: { className: 'bg-ok', label: 'Answered Pokter this week' },
  quiet: { className: 'bg-watch', label: 'Answered before, but not this week' },
  silent: { className: 'bg-rule-strong', label: 'Has never answered Pokter' },
};

export function AgentAvatar({
  name,
  imageUrl,
  seed,
  size = 40,
  className,
  eager,
  status,
}: {
  name: string;
  imageUrl?: string | null;
  seed: string;
  size?: number;
  className?: string;
  /** For avatars above the fold. */
  eager?: boolean;
  /** Draws the answer dot. Omitted where the state is not known. */
  status?: AnswerState | null;
}) {
  const safe = imageUrl && /^https:\/\//i.test(imageUrl) ? imageUrl : null;
  const image = <AvatarImage src={safe} fallback={avatarUrl(seed)} name={name} size={size} className={className} eager={eager} />;
  if (!status) return image;
  const dot = ANSWER_DOT[status];
  /* The ring is the page behind it, so the dot reads as sitting on the
     picture rather than inside it, and stays legible on a dark avatar. */
  const diameter = Math.max(8, Math.round(size * 0.24));
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {image}
      <span
        role="img"
        aria-label={dot.label}
        title={dot.label}
        className={cn('absolute bottom-0 right-0 rounded-full ring-2 ring-paper', dot.className)}
        style={{ width: diameter, height: diameter }}
      />
    </span>
  );
}

/**
 * The probe strip: one cell per day, height by answer rate. Days with no
 * probes are drawn as a baseline tick, never as zero, because "not asked"
 * and "did not answer" are different facts.
 */
export function ProbeStrip({ cells, className, label = 'Daily answer rate, last 14 days' }: { cells: StripCell[]; className?: string; label?: string }) {
  return (
    <div className={cn('flex h-6 items-end gap-[2px]', className)} role="img" aria-label={label}>
      {cells.map((cell, index) => {
        const ratio = cell.ratio;
        const measured = cell.probes > 0 && ratio !== null;
        const height = measured ? Math.max(3, Math.round(ratio! * 24)) : 2;
        const tone = !measured ? 'bg-rule-strong' : ratio! >= 0.9 ? 'bg-ok' : ratio! > 0 ? 'bg-watch' : 'bg-bad';
        return <span key={index} className={cn('w-[5px] rounded-[1px]', tone, !measured && 'opacity-60')} style={{ height }} title={`${cell.date}: ${cell.probes ? `${cell.answered}/${cell.probes} answered` : "not probed"}`} />;
      })}
    </div>
  );
}
