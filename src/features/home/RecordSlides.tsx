'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';

import { Icon } from '@/ui/icons';

export interface RecordSlide {
  scope: string;
  /** The scope in a word or two, for its tab. */
  short: string;
  unit: string;
  rows: Array<{ label: string; value: string }>;
  note: string;
}

/*
 * Each count on a fill of its own, from the rail's step tokens. A colour per
 * slide rather than one for the deck says the same thing the caption does:
 * four counts over four scopes, not four stages of one funnel. Indigo, the
 * fifth step, is the chapter the deck sits on, so it is never a slide.
 */
const FILLS = [2, 3, 4, 1] as const;

/*
 * Figures shrink as a slide carries more of them, so three side by side still
 * fit the panel and one alone fills it.
 */
const FIGURE_SIZE = [
  'text-[clamp(3.6rem,2rem+5.4vw,6.75rem)]',
  'text-[clamp(3.1rem,1.9rem+4vw,5.25rem)]',
  'text-[clamp(2.6rem,1.7rem+2.9vw,4.1rem)]',
] as const;

/**
 * The record as a deck: one count per slide, chosen by tab or stepped through
 * with the arrows.
 *
 * Every slide is rendered, stacked in one grid cell, and the ones not showing
 * are invisible rather than removed. The panel then takes the height of the
 * tallest slide and holds it, so stepping through the deck never moves the
 * page under the reader, and the figures are in the document for anyone
 * reading it without the script.
 */
export function RecordSlides({ slides }: { slides: RecordSlide[] }) {
  const [at, setAt] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const id = useId();
  const fill = FILLS[at % FILLS.length];

  const show = (i: number, focus = false) => {
    const next = Math.max(0, Math.min(slides.length - 1, i));
    setAt(next);
    if (focus) tabs.current[next]?.focus();
  };

  /* The tab pattern's own keys: arrows move along the row, Home and End to its ends. */
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: slides.length - 1 }[event.key];
    if (to === undefined) return;
    event.preventDefault();
    show(to, true);
  };

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-[22px] bg-[var(--fill)] text-[var(--on-fill)] motion-safe:transition-[background-color,color] motion-safe:duration-500"
      style={{ ['--fill' as string]: `var(--step-${fill})`, ['--on-fill' as string]: `var(--step-${fill}-ink)` }}
    >
      <div role="tablist" aria-label="The four counts" onKeyDown={onKey} className="flex flex-wrap gap-1.5 p-4 sm:p-5">
        {slides.map((slide, i) => (
          <button
            key={slide.scope}
            ref={(node) => {
              tabs.current[i] = node;
            }}
            id={`${id}-tab-${i}`}
            type="button"
            role="tab"
            aria-selected={i === at}
            aria-controls={`${id}-panel-${i}`}
            tabIndex={i === at ? 0 : -1}
            onClick={() => show(i)}
            className={`inline-flex h-8 items-center gap-2 rounded-full px-3.5 text-[12.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current ${
              i === at ? 'bg-[var(--on-fill)] text-[var(--fill)]' : 'bg-[var(--on-fill)]/10 hover:bg-[var(--on-fill)]/18'
            }`}
          >
            <span className="t-readout text-[11px] opacity-70">{String(i + 1).padStart(2, '0')}</span>
            {slide.short}
          </button>
        ))}
      </div>

      <div className="grid flex-1">
        {slides.map((slide, i) => (
          <div
            key={slide.scope}
            id={`${id}-panel-${i}`}
            role="tabpanel"
            aria-labelledby={`${id}-tab-${i}`}
            className={`col-start-1 row-start-1 flex flex-col justify-start gap-8 px-6 pb-6 pt-6 sm:justify-between sm:gap-10 sm:px-9 sm:pb-8 sm:pt-8 motion-safe:transition-[opacity,transform] motion-safe:duration-300 ${
              i === at ? 'visible opacity-100' : 'invisible opacity-0 motion-safe:translate-y-1.5'
            }`}
          >
            <div className="flex flex-col gap-2">
              <h3 className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">{slide.scope}</h3>
              {/* What it counts, and who counted it, beside every number it applies to. */}
              <span className="t-readout text-[11.5px] uppercase tracking-[0.08em] opacity-70">{slide.unit}</span>
            </div>
            <dl className="flex flex-wrap gap-x-12 gap-y-6">
              {slide.rows.map((row) => (
                <div key={row.label} className="flex max-w-[12rem] flex-col gap-2.5">
                  <dt className="text-[14px] leading-snug opacity-80">{row.label}</dt>
                  <dd
                    className={`order-first font-[560] leading-[0.9] tracking-[-0.04em] tabular-nums [font-variation-settings:'wdth'_86] ${FIGURE_SIZE[Math.min(slide.rows.length, FIGURE_SIZE.length) - 1]}`}
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="max-w-lg text-[13.5px] leading-relaxed opacity-80">{slide.note}</p>
          </div>
        ))}
      </div>

      {/*
        Hidden from assistive tech: the tabs above are the control, and these
        only step through them for a pointer.
      */}
      <div className="flex items-center justify-between gap-4 border-t border-[var(--on-fill)]/15 px-6 py-4 sm:px-9" aria-hidden>
        <span className="t-readout text-[12px] opacity-70">
          {String(at + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
        </span>
        <div className="flex items-center gap-2">
          {([-1, 1] as const).map((d) => {
            const done = d === -1 ? at === 0 : at === slides.length - 1;
            return (
              <button
                key={d}
                type="button"
                tabIndex={-1}
                onClick={() => show(at + d)}
                disabled={done}
                className="grid size-9 place-items-center rounded-full border border-[var(--on-fill)]/25 transition-[opacity,background-color] hover:bg-[var(--on-fill)]/10 disabled:pointer-events-none disabled:opacity-35"
              >
                {d === -1 ? <Icon.ChevronLeft size={16} /> : <Icon.ChevronRight size={16} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
