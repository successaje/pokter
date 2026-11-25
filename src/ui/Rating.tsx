import { cn } from '@/lib/ui/cn';
import { Icon } from './icons';

/**
 * A rating, drawn as stars: one buyer's, or PokterBoard's average.
 *
 * Stars, here and nowhere else. Pokter computes no average of its own:
 * a mean of a handful of ratings is the kind of number that looks
 * measured and is not, and the catalogue card says so by carrying no
 * rating at all. What this draws is either a single statement by a single
 * wallet that funded a completed job and signed for it, or the board's
 * own totals, one rating per person holding an Agent ID, always with how
 * many people gave them. A card compared with others shows the board's
 * average only once enough people have rated (`cardRating`).
 *
 * The figure stays beside them. Stars alone round away the difference
 * between 4 and 5 for anyone skimming, and the number is what the buyers
 * actually gave. It is printed as passed, so an average is rounded first.
 */
export function Rating({ value, max = 5, className }: { value: number; max?: number; className?: string }) {
  const filled = Math.max(0, Math.min(max, Math.round(value)));
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      {/* One label for the group: five separate ones would be read out five times. */}
      <span className="inline-flex items-center gap-px text-signal" role="img" aria-label={`${value} out of ${max}`}>
        {Array.from({ length: max }, (_, i) =>
          i < filled ? <Icon.StarFilled key={i} size={14} /> : <Icon.Star key={i} size={14} className="text-rule-strong" />,
        )}
      </span>
      <span aria-hidden className="t-readout text-[12.5px] text-ink-2">
        {value}/{max}
      </span>
    </span>
  );
}
