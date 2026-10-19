import { cn } from '@/lib/ui/cn';
import { Icon } from './icons';

/**
 * One buyer's rating, drawn as stars.
 *
 * Stars, here and nowhere else. Pokter does not publish an aggregate
 * score for an agent and this is not a step toward one: a mean of a
 * handful of ratings is the kind of number that looks measured and is
 * not, and the catalogue card says so by carrying no rating at all. What
 * this draws is a single statement by a single wallet that funded a
 * completed job and signed for it — which is a fact, and reads faster as
 * five shapes than as "4/5".
 *
 * The figure stays beside them. Stars alone round away the difference
 * between 4 and 5 for anyone skimming, and the number is what the buyer
 * actually signed.
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
