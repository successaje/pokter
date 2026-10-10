import { avatarUrl } from '@/lib/ui/avatar-art';
import { AvatarImage } from './AvatarImage';
import { cn } from '@/lib/ui/cn';
import type { StripCell } from '@/lib/history/strip';

/**
 * An agent's picture. Operators publish arbitrary image URLs, so only https
 * images are loaded, with no referrer, and any that fail to load fall back
 * to a generated mark seeded by chain and token, stable per agent.
 */
export function AgentAvatar({
  name,
  imageUrl,
  seed,
  size = 40,
  className,
  eager,
}: {
  name: string;
  imageUrl?: string | null;
  seed: string;
  size?: number;
  className?: string;
  /** For avatars above the fold. */
  eager?: boolean;
}) {
  const safe = imageUrl && /^https:\/\//i.test(imageUrl) ? imageUrl : null;
  return <AvatarImage src={safe} fallback={avatarUrl(seed)} name={name} size={size} className={className} eager={eager} />;
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
