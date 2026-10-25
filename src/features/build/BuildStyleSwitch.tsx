'use client';

import type { BuildStyle } from '@/lib/builder/drafts';
import { BUILD_STYLES, buildStyle } from '@/lib/builder/style';
import { Segmented } from '@/ui/Controls';
import { Details } from '@/ui/Data';
import { Icon } from '@/ui/icons';

/**
 * Who decides, chosen once and changeable at any point.
 *
 * The flow had one manner — a form that asked for everything in order —
 * which suits somebody specifying an agent and nobody who wants one
 * built. Both styles run over the same draft and the same four steps, so
 * this changes what is said and offered, never what is stored. The line
 * about that is on screen rather than only in this comment: a switch that
 * might lose your work is a switch nobody touches.
 */
export function BuildStyleSwitch({
  style,
  onChange,
  className,
}: {
  style: BuildStyle;
  onChange: (style: BuildStyle) => void;
  className?: string;
}) {
  const current = buildStyle(style);
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented
          label="How much Pokter decides"
          size="s"
          value={style}
          onChange={onChange}
          options={BUILD_STYLES.map((option) => ({ value: option.id, label: option.label }))}
        />
        <p className="text-[12.5px] text-ink-3">{current.summary}</p>
      </div>
      <Details summary={`What “${current.label}” does`} className="mt-2">
        <ul className="flex flex-col gap-1.5 text-[13px] leading-relaxed text-ink-2">
          {current.behaviour.map((line) => (
            <li key={line} className="flex gap-2">
              <Icon.Check size={14} className="mt-0.5 shrink-0 text-ok" aria-hidden />
              {line}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12.5px] text-ink-3">
          Switching keeps everything you have written and the step you are on. Both styles run the same endpoint check,
          produce the same registration file, and hold the same rules about wallets and keys.
        </p>
      </Details>
    </div>
  );
}
