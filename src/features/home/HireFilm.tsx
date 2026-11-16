'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { WalkStep, Walkthrough } from '@/features/home/walkthrough-data';
import { Icon } from '@/ui/icons';

/**
 * One real hire, filmed, with its chapters under it.
 *
 * The page has to answer "what is it actually like to hire one of these"
 * before it asks anybody to try, and no drawing answers that. This is the
 * screen recording of job #1733 being made on BNB testnet: the real pages,
 * the real cursor, the buyer's own wallet opening twice, the escrow
 * funding, and Pokter recomputing the agent's figures against Venus's own
 * contracts at the end. Nothing in it is staged and nothing is a mock-up.
 *
 * It is cut to six chapters with the browser chrome cropped away, at the
 * speed it happened — a sped-up screen recording looks like a demo reel and
 * smears under compression, and the point here is that a sceptic can watch
 * each step land. The chapters are what the recording shows, not an
 * idealised flow: the delivery itself arrived hours later and off camera,
 * so there is no chapter pretending to film it.
 *
 * Under the film the same job is written out in figures that are read at
 * build time rather than filmed, because a recording ages and a reader who
 * wants to check something needs text, not pixels. The caption says when it
 * was recorded so the two can never be confused.
 *
 * It costs nothing until it is wanted: `preload="none"` with a still of the
 * chapter, loaded and played when it is first scrolled to. Under
 * `prefers-reduced-motion` the video is never mounted at all — the chapter
 * stills carry it, the chapters still switch, and nothing moves.
 */

/**
 * Where each chapter starts in the cut, in seconds.
 *
 * Hand-kept against `public/film/hire.mp4` and its stills. One file rather
 * than six keeps it in one cache entry and lets a chapter run into the next
 * with no reload, the way the hire itself ran.
 */
const FILM: Array<{ key: WalkStep['key']; at: number }> = [
  { key: 'find', at: 0 },
  { key: 'inspect', at: 12 },
  { key: 'fund', at: 25 },
  { key: 'sign', at: 41.5 },
  { key: 'funded', at: 60 },
  { key: 'checked', at: 76 },
];
const FILM_END = 85.5;
/** The day the screens in the film were the screens. Counts on them are that day's. */
const RECORDED = '16 November 2026';

const startOf = (i: number) => FILM[i]?.at ?? 0;
const endOf = (i: number) => FILM[i + 1]?.at ?? FILM_END;

export function HireFilm({ walk }: { walk: Walkthrough }) {
  const steps = walk.steps;
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState(false);
  /** Progress inside the chapter on screen, 0..1, for the rail under it. */
  const [through, setThrough] = useState(0);
  /** Set when a reader picked a chapter: it plays, then stops rather than running on. */
  const hold = useRef<number | null>(null);
  const [still, setStill] = useState(false);
  const [armed, setArmed] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const film = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const read = () => setStill(query.matches);
    read();
    query.addEventListener('change', read);
    return () => query.removeEventListener('change', read);
  }, []);

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

  /*
   * `preload="none"` with the source always set: nothing is fetched until
   * something calls `play()`, and `play()` does its own loading. Swapping
   * the source in afterwards is the obvious-looking alternative and does
   * not work — an element that has already settled as idle will not always
   * pick up a source added later.
   */
  useEffect(() => {
    const node = film.current;
    if (!armed || !node) return;
    node.play().catch(() => {
      /* Autoplay refused: the still stays and the play control is there. */
      setPlaying(false);
    });
  }, [armed]);

  const tick = useCallback(() => {
    const node = film.current;
    if (!node) return;
    const t = node.currentTime;
    const i = FILM.reduce((found, chapter, index) => (t >= chapter.at ? index : found), 0);
    setAt(i);
    setThrough(Math.min(1, Math.max(0, (t - startOf(i)) / (endOf(i) - startOf(i)))));
    /* A chapter a reader asked for plays out and stops, rather than running on. */
    if (hold.current !== null && t >= endOf(hold.current) - 0.05) {
      node.pause();
      hold.current = null;
    }
  }, []);

  const seek = useCallback((i: number) => {
    const node = film.current;
    setAt(i);
    setThrough(0);
    setDone(false);
    if (!node) return;
    hold.current = i;
    node.currentTime = startOf(i) + 0.01;
    node.play().catch(() => setPlaying(false));
  }, []);

  const toggle = useCallback(() => {
    const node = film.current;
    if (!node) return;
    if (node.paused) {
      /* Asking for it again is asking for the whole thing from here. */
      hold.current = null;
      if (done) node.currentTime = 0;
      node.play().catch(() => setPlaying(false));
    } else {
      node.pause();
    }
  }, [done]);

  const step = steps.find((s) => s.key === FILM[at]?.key) ?? steps[0];
  if (!step) return null;
  const chapterKey = FILM[at]?.key ?? 'find';

  return (
    <div ref={host} className="flex flex-col">
      {/* ── the film, in a window ── */}
      <figure className="mx-auto w-full max-w-[62rem]">
        <div className="overflow-hidden rounded-[18px] border border-rule bg-sunken shadow-lift">
          {/*
            A browser bar and nothing else. The recording is cropped below
            the real one, so this replaces it rather than doubling it, and it
            carries only what is true of every frame: the site it is on.
          */}
          <div className="flex items-center gap-3 border-b border-rule px-4 py-2.5">
            <span aria-hidden className="flex gap-1.5">
              <span className="block size-2.5 rounded-full bg-rule-strong" />
              <span className="block size-2.5 rounded-full bg-rule-strong" />
              <span className="block size-2.5 rounded-full bg-rule-strong" />
            </span>
            <span className="t-readout mx-auto flex items-center gap-1.5 rounded-full border border-rule bg-paper px-3 py-1 text-[11px] text-ink-3">
              <Icon.Lock size={10} className="shrink-0" />
              pokter.xyz
            </span>
            <span className="hidden shrink-0 text-[10.5px] text-ink-3 sm:block">Recorded {RECORDED}</span>
          </div>

          {/*
            Fixed ratio, matching the cut, so switching chapter never moves
            the page under a reader.
          */}
          <div className="relative aspect-[1344/736] bg-paper">
            {still ? (
              /* eslint-disable-next-line @next/next/no-img-element -- one of six stills, swapped by chapter; the sizes are fixed and known. */
              <img
                src={`/film/${chapterKey}.webp`}
                alt={`Pokter during the ${step.label.toLowerCase()} step of hiring ${walk.agent.name}`}
                width={1344}
                height={736}
                className="size-full object-cover"
              />
            ) : (
              <video
                ref={film}
                /* The chapter's own still, so a paused film is never a blank box. */
                poster={`/film/${chapterKey}.webp`}
                src="/film/hire.mp4"
                preload="none"
                muted
                playsInline
                disablePictureInPicture
                onTimeUpdate={tick}
                onPlay={() => { setPlaying(true); setDone(false); }}
                onPause={() => setPlaying(false)}
                onEnded={() => { setPlaying(false); setDone(true); }}
                className="size-full object-cover"
                aria-label={`A screen recording of job #${walk.job.jobId} being hired on Pokter`}
              />
            )}

            {/* The whole film, as one thin line. */}
            <div aria-hidden className="absolute inset-x-0 bottom-0 flex h-[3px]">
              {FILM.map((chapter, i) => (
                <span
                  key={chapter.key}
                  className="h-full bg-ink/10"
                  style={{ flex: endOf(i) - startOf(i) }}
                >
                  <span
                    className="block h-full bg-signal transition-[width] duration-200 ease-linear"
                    style={{ width: i < at ? '100%' : i === at ? `${through * 100}%` : '0%' }}
                  />
                </span>
              ))}
            </div>

            {/* Nothing is playing and nothing will start on its own: offer it. */}
            {!still && !playing && (
              <button
                type="button"
                onClick={toggle}
                className="absolute inset-0 grid place-items-center bg-ink/5 transition-colors hover:bg-ink/10"
              >
                <span className="sr-only">{done ? 'Play the recording again' : 'Play the recording'}</span>
                <span aria-hidden className="grid size-14 place-items-center rounded-full bg-paper/90 text-ink shadow-lift backdrop-blur-sm">
                  {done ? <Icon.Refresh size={20} /> : <Icon.Play size={20} />}
                </span>
              </button>
            )}
          </div>
        </div>
      </figure>

      {/* ── the chapters, under the film ── */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5" role="group" aria-label="Chapters">
        <button
          type="button"
          onClick={() => seek(Math.max(0, at - 1))}
          disabled={at === 0}
          className="grid size-8 shrink-0 place-items-center rounded-full border border-rule text-ink-3 transition-colors hover:border-ink-3 hover:text-ink disabled:opacity-30 disabled:hover:border-rule disabled:hover:text-ink-3"
        >
          <span className="sr-only">Previous chapter</span>
          <Icon.ChevronLeft size={14} />
        </button>

        {FILM.map((chapter, i) => {
          const on = i === at;
          const label = steps.find((s) => s.key === chapter.key)?.label ?? chapter.key;
          return (
            <button
              key={chapter.key}
              type="button"
              onClick={() => seek(i)}
              aria-current={on ? 'step' : undefined}
              className={`relative overflow-hidden rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                on ? 'border-ink bg-ink text-paper' : 'border-rule text-ink-2 hover:border-ink-3 hover:text-ink'
              }`}
            >
              {on && playing && (
                <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-paper/25">
                  <span
                    className="block h-full bg-signal transition-[width] duration-200 ease-linear"
                    style={{ width: `${through * 100}%` }}
                  />
                </span>
              )}
              <span className="relative">{label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => seek(Math.min(FILM.length - 1, at + 1))}
          disabled={at === FILM.length - 1}
          className="grid size-8 shrink-0 place-items-center rounded-full border border-rule text-ink-3 transition-colors hover:border-ink-3 hover:text-ink disabled:opacity-30 disabled:hover:border-rule disabled:hover:text-ink-3"
        >
          <span className="sr-only">Next chapter</span>
          <Icon.ChevronRight size={14} />
        </button>

        {!still && (
          <button
            type="button"
            onClick={toggle}
            aria-pressed={playing}
            className="ml-1 grid size-8 shrink-0 place-items-center rounded-full border border-rule text-ink-3 transition-colors hover:border-ink-3 hover:text-ink"
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

      {/* ── what the chapter on screen actually was ── */}
      <div className="mx-auto mt-9 w-full max-w-[62rem]">
        <div key={step.key} className="anim-fade grid grid-cols-1 gap-x-12 gap-y-5 border-t border-rule pt-7 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="flex flex-col gap-2.5">
            <p className="flex items-center gap-2.5">
              <span className="t-readout text-[11px] text-ink-3">{String(at + 1).padStart(2, '0')}</span>
              <span className="text-[17px] font-medium tracking-[-0.02em] text-ink">{step.label}</span>
            </p>
            <p className="max-w-prose text-[14px] leading-relaxed text-ink-2">{step.says}</p>
            {step.foot && (
              <p className="mt-1 max-w-prose border-l-2 border-rule pl-3 text-[12.5px] leading-relaxed text-ink-3">
                {step.foot}
              </p>
            )}
          </div>

          {/*
            The figures behind what is on screen, read from the job rather
            than from the film, so the recording can be checked and not only
            watched.
          */}
          <dl className="flex flex-col rounded-[14px] border border-rule bg-raised px-4">
            {step.rows.map((row) => (
              <div
                key={row.k}
                className="flex flex-col gap-1 border-b border-rule py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
              >
                <dt className="t-label shrink-0">{row.k}</dt>
                <dd className="flex min-w-0 items-center gap-2 text-[13.5px] leading-snug text-ink sm:text-right">
                  {row.tone && (
                    <span
                      aria-hidden
                      className={`size-1.5 shrink-0 rounded-full ${row.tone === 'ok' ? 'bg-ok' : row.tone === 'watch' ? 'bg-watch' : 'bg-rule-strong'}`}
                    />
                  )}
                  {row.href ? (
                    <a
                      href={row.href}
                      target={row.href.startsWith('http') ? '_blank' : undefined}
                      rel={row.href.startsWith('http') ? 'noreferrer noopener' : undefined}
                      className="t-readout min-w-0 truncate underline underline-offset-2 hover:text-ink"
                    >
                      {row.v}
                    </a>
                  ) : (
                    <span className="min-w-0">{row.v}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/*
          What this was, said once and plainly. A hire Pokter funded is a
          demonstration, not a customer, and the sentence that says so belongs
          under it rather than in a footnote nobody opens. The date matters
          too: the counts visible on screen are that day's, and the figures
          beside the film are read fresh every time the page is built.
        */}
        <p className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ink-3">
          <span>
            Recorded {RECORDED} on {walk.job.network}
            {walk.fundedByTeam ? ', funded by Pokter, not by a customer' : ', funded from outside Pokter'}. Counts
            visible on screen are that day&rsquo;s; the figures beside each chapter are read from the job every time
            this page is built.
          </span>
          <Link href={walk.job.href} className="inline-flex items-center gap-1.5 font-medium text-ink hover:underline">
            Open job #{walk.job.jobId} <Icon.Arrow size={14} />
          </Link>
        </p>
      </div>
    </div>
  );
}
