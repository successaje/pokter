'use client';

import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { FILM_CHAPTERS, FILM_END, FILM_RECORDED } from '@/lib/landing/film-chapters';
import { cn } from '@/lib/ui/cn';
import { useHydrated } from '@/lib/ui/use-hydrated';
import { Icon } from '@/ui/icons';

/**
 * One real hire, filmed, with its chapters under it.
 *
 * Carried over from the landing rebuild (feat/landing-rebuild): a screen
 * recording of job #1733 being made on BNB testnet, cut hard to the moments
 * where something is pressed and never sped up. Here it is set in an app
 * window on the sheet's graph paper, the way a product is shown rather than
 * described, with the chapters as a row of tabs under it and the sentence
 * for the chapter on screen beneath them.
 *
 * It costs nothing until it is wanted: `preload="none"` behind a still of
 * the chapter, fetched and played when first scrolled to. Under
 * `prefers-reduced-motion` the video is never mounted — the stills carry it
 * and the chapters still switch. On a phone the frame holds the still and
 * the film plays full screen when asked for, because 1344 pixels of
 * interface scaled to 358 cannot be read.
 */

/** GitHub's own curve for a growing indicator; nothing else here moves this way. */
const FILL = 'width 220ms cubic-bezier(0.4, 0, 0.2, 1)';

const startOf = (i: number) => FILM_CHAPTERS[i]?.at ?? 0;
const endOf = (i: number) => FILM_CHAPTERS[i + 1]?.at ?? FILM_END;

export interface FilmCaption {
  jobId: string;
  href: string;
  network: string;
  /** True when a Pokter wallet funded it: said on the page, never softened. */
  fundedByTeam: boolean;
}

export function HireDemo({ caption }: { caption: FilmCaption | null }) {
  /* Held until hydration: the server cannot read a media query, and markup that disagrees with it is thrown away. */
  const hydrated = useHydrated();
  const still = (useReducedMotion() ?? false) && hydrated;
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState(false);
  /** How far through the chapter on screen, 0..1, for the tab under it. */
  const [through, setThrough] = useState(0);
  /** Set when a reader picks a chapter: it plays, then stops rather than running on. */
  const hold = useRef<number | null>(null);
  const [armed, setArmed] = useState(false);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 639px)');
    const read = () => setCompact(narrow.matches);
    read();
    narrow.addEventListener('change', read);
    return () => narrow.removeEventListener('change', read);
  }, []);
  const host = useRef<HTMLDivElement>(null);
  const film = useRef<HTMLVideoElement>(null);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  /*
   * The window settles into place as the page reaches it: scale and lift
   * only, both composited, sprung so the end of the travel eases out. The
   * one scroll-linked thing on the page, because it is the one section
   * somebody is meant to stop and watch.
   */
  const { scrollYProgress } = useScroll({ target: host, offset: ['start 1', 'start 0.45'] });
  const eased = useSpring(scrollYProgress, { stiffness: 110, damping: 26, mass: 0.45 });
  const scale = useTransform(eased, [0, 1], [0.94, 1]);
  const lift = useTransform(eased, [0, 1], [24, 0]);

  /* Nothing is fetched until it is on screen, and then only once. */
  useEffect(() => {
    const node = host.current;
    if (!node || still) return;
    const seen = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        seen.disconnect();
        setArmed(true);
      },
      { threshold: 0.3 },
    );
    seen.observe(node);
    return () => seen.disconnect();
  }, [still]);

  useEffect(() => {
    const node = film.current;
    if (!armed || !node || compact) return;
    node.play().catch(() => setPlaying(false));
  }, [armed, compact]);

  const tick = useCallback(() => {
    const node = film.current;
    if (!node) return;
    const t = node.currentTime;
    const i = FILM_CHAPTERS.reduce((found, chapter, index) => (t >= chapter.at ? index : found), 0);
    setAt(i);
    setThrough(Math.min(1, Math.max(0, (t - startOf(i)) / (endOf(i) - startOf(i)))));
    if (hold.current !== null && t >= endOf(hold.current) - 0.05) {
      node.pause();
      hold.current = null;
    }
  }, []);

  const seek = useCallback((next: number) => {
    const i = Math.max(0, Math.min(next, FILM_CHAPTERS.length - 1));
    setAt(i);
    setThrough(0);
    setDone(false);
    const node = film.current;
    if (!node) return;
    hold.current = i;
    node.currentTime = startOf(i) + 0.01;
    node.play().catch(() => setPlaying(false));
  }, []);

  const toggle = useCallback(() => {
    const node = film.current;
    if (!node) return;
    if (node.paused) {
      hold.current = null;
      if (done) node.currentTime = 0;
      /* Asked for on a phone means asked for full screen, inside the tap so the gesture still counts. */
      if (compact) {
        const video = node as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
        try {
          if (typeof video.webkitEnterFullscreen === 'function') video.webkitEnterFullscreen();
          else void video.requestFullscreen?.();
        } catch {
          /* Played in the frame instead. */
        }
      }
      node.play().catch(() => setPlaying(false));
    } else {
      node.pause();
    }
  }, [compact, done]);

  /* Arrow keys move between chapters and take focus with them, as a tablist should. */
  const onKey = useCallback(
    (event: React.KeyboardEvent) => {
      const map: Record<string, number> = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: FILM_CHAPTERS.length - 1 };
      const next = map[event.key];
      if (next === undefined) return;
      event.preventDefault();
      const i = Math.max(0, Math.min(next, FILM_CHAPTERS.length - 1));
      seek(i);
      tabs.current[i]?.focus();
    },
    [at, seek],
  );

  const chapter = FILM_CHAPTERS[at] ?? FILM_CHAPTERS[0]!;
  const key = chapter.key;

  return (
    <div ref={host} className="flex flex-col">
      {/* ── the window ── */}
      <motion.figure className="mx-auto w-full max-w-[66rem] will-change-transform" style={still ? undefined : { scale, y: lift }}>
        <div className="overflow-hidden rounded-[14px] border border-rule-strong bg-raised shadow-[0_1px_0_rgb(0_0_0/0.04),0_24px_48px_-28px_rgb(0_0_0/0.28)]">
          {/* The window's own bar: where it is, and which chapter of seven is on screen. */}
          <div className="flex items-center gap-3 border-b border-rule bg-paper px-3.5 py-2.5">
            <span aria-hidden className="flex gap-1.5">
              <span className="size-[9px] rounded-full bg-rule-strong" />
              <span className="size-[9px] rounded-full bg-rule-strong" />
              <span className="size-[9px] rounded-full bg-rule-strong" />
            </span>
            <span className="mx-auto inline-flex h-6 min-w-0 items-center gap-1.5 rounded-md border border-rule bg-raised px-2.5 text-[11.5px] text-ink-3">
              <Icon.Lock size={11} aria-hidden />
              <span className="truncate">pokter.xyz</span>
            </span>
            <span className="t-readout w-[52px] shrink-0 text-right text-[11px] text-ink-3">
              {String(at + 1).padStart(2, '0')} / {String(FILM_CHAPTERS.length).padStart(2, '0')}
            </span>
          </div>
          <div
            id={`film-${key}`}
            role="tabpanel"
            aria-labelledby={`chapter-${key}`}
            className="relative aspect-[1344/736] overflow-hidden bg-sunken"
          >
            {still ? (
              /* eslint-disable-next-line @next/next/no-img-element -- one of seven stills, swapped by chapter; the sizes are fixed and known. */
              <img
                src={`/film/${key}.webp`}
                alt={`Pokter during the ${chapter.label.toLowerCase()} step of a hire`}
                width={1344}
                height={736}
                className="size-full object-cover"
              />
            ) : (
              <video
                ref={film}
                src="/film/hire.mp4"
                poster={`/film/${key}.webp`}
                preload="none"
                muted
                playsInline
                disablePictureInPicture
                onTimeUpdate={tick}
                onPlay={() => {
                  setPlaying(true);
                  setDone(false);
                }}
                onPause={() => setPlaying(false)}
                onEnded={() => {
                  setPlaying(false);
                  setDone(true);
                }}
                className="size-full object-cover"
                aria-label={caption ? `A screen recording of job #${caption.jobId} being hired on Pokter` : 'A screen recording of a hire on Pokter'}
              />
            )}

            {/* The whole film as one hairline along the foot, each chapter its own segment. */}
            <div aria-hidden className="absolute inset-x-0 bottom-0 flex h-[3px] gap-px">
              {FILM_CHAPTERS.map((c, i) => (
                <span key={c.key} className="h-full bg-ink/10" style={{ flex: endOf(i) - startOf(i) }}>
                  <span
                    className="block h-full bg-signal"
                    style={{ width: i < at ? '100%' : i === at ? `${through * 100}%` : '0%', transition: FILL }}
                  />
                </span>
              ))}
            </div>

            {!still && !playing && (
              <button
                type="button"
                onClick={toggle}
                className="absolute inset-0 grid place-items-center bg-ink/[0.03] transition-colors duration-300 hover:bg-ink/[0.08] focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ink"
              >
                <span className="sr-only">{done ? 'Play the recording again' : 'Play the recording'}</span>
                <span
                  aria-hidden
                  className="grid size-16 place-items-center rounded-full bg-ink text-paper shadow-lift transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:scale-105"
                >
                  {done ? <Icon.Refresh size={22} /> : <Icon.Play size={22} />}
                </span>
              </button>
            )}
          </div>
        </div>
      </motion.figure>

      {/* ── the chapters ── */}
      <div
        role="tablist"
        aria-label="Chapters"
        onKeyDown={onKey}
        className="mx-auto mt-6 flex w-full max-w-[66rem] items-center gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:justify-center sm:overflow-visible [&::-webkit-scrollbar]:hidden"
      >
        {FILM_CHAPTERS.map((c, i) => {
          const on = i === at;
          return (
            <button
              key={c.key}
              ref={(node) => {
                tabs.current[i] = node;
              }}
              type="button"
              role="tab"
              id={`chapter-${c.key}`}
              aria-selected={on}
              aria-controls={`film-${c.key}`}
              tabIndex={on ? 0 : -1}
              onClick={() => seek(i)}
              className={cn(
                'relative shrink-0 overflow-hidden rounded-full border px-4 py-[6px] text-[13px] font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                on ? 'border-ink bg-ink text-paper' : 'border-rule bg-paper text-ink-3 hover:border-rule-strong hover:text-ink',
              )}
            >
              {on && playing && !still && (
                <span aria-hidden className="absolute inset-y-0 left-0 bg-paper/15" style={{ width: `${through * 100}%`, transition: FILL }} />
              )}
              <span className="relative">{c.label}</span>
            </button>
          );
        })}

        {!still && (
          <button
            type="button"
            onClick={toggle}
            aria-pressed={playing}
            className="relative ml-1 grid size-[34px] shrink-0 place-items-center rounded-full border border-rule bg-paper text-ink-3 transition-colors duration-200 hover:border-rule-strong hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <span className="sr-only">{playing ? 'Pause the recording' : 'Play the recording'}</span>
            {playing ? (
              <span aria-hidden className="flex gap-[2px]">
                <span className="block h-2.5 w-[2px] bg-current" />
                <span className="block h-2.5 w-[2px] bg-current" />
              </span>
            ) : (
              <Icon.Play size={12} />
            )}
          </button>
        )}
      </div>

      {/* ── what the chapter on screen is ── */}
      <div className="mx-auto mt-6 min-h-[3.25rem] w-full max-w-[40rem] text-center" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={key}
            initial={still ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={still ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}
            className="text-[14.5px] leading-relaxed text-ink-2"
          >
            {chapter.says}
          </motion.p>
        </AnimatePresence>
      </div>

      {/*
        What this was, said once and plainly. A hire Pokter funded is a
        demonstration, not a customer, and the sentence that says so sits
        under it rather than in a footnote nobody opens.
      */}
      <p className="mx-auto mt-5 flex max-w-[46rem] flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-[12.5px] text-ink-3">
        <span>
          Recorded {FILM_RECORDED}
          {caption ? ` on ${caption.network}, ${caption.fundedByTeam ? 'funded by Pokter, not by a customer' : 'funded from outside Pokter'}` : ''}. Nothing in it is staged or sped up.
        </span>
        {caption && (
          <Link href={caption.href} className="inline-flex items-center gap-1 font-medium text-ink transition-opacity hover:opacity-70">
            Open job #{caption.jobId} <Icon.Arrow size={13} />
          </Link>
        )}
      </p>
    </div>
  );
}
