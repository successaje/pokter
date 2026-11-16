'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import type { TickerEvent } from '@/features/home/ticker-data';
import { Icon } from '@/ui/icons';

/**
 * A row of things that happened, moving, each one openable.
 *
 * The device is familiar and usually worthless: a marketplace scrolling its
 * own activity past you is the house reciting the house's record, and a
 * reader cannot check a word of it. This row earns it by being checkable.
 * Every card is one escrow job and carries two ways out — the job's evidence
 * page here, and the transaction on an explorer Pokter does not run — so the
 * row is not asking to be believed, it is asking to be clicked.
 *
 * Which is why stopping it is a first-class control rather than a courtesy.
 * It pauses on hover, on keyboard focus, and on a button that says so, and
 * a card is a real link the whole time it is moving. A ticker you cannot
 * stop is decoration; the point here is the opposite.
 *
 * Under `prefers-reduced-motion` it does not move at all: it becomes a row
 * that scrolls with a finger or a trackpad, which is the same content and
 * the same links without the motion, and keeps its own scrollbar hidden the
 * way the card rails elsewhere do.
 *
 * The marks are duplicated once so the loop has somewhere to go. The copy is
 * `aria-hidden` and the live half carries the list, so nothing is announced
 * twice to a screen reader.
 */

const SECONDS_PER_CARD = 6;

function Card({ event }: { event: TickerEvent }) {
  const when = new Date(event.at);
  return (
    <li className="flex shrink-0">
      <div className="group flex min-w-[17.5rem] items-center gap-3 border-r border-rule px-5 py-3.5">
        <span
          aria-hidden
          className={`size-1.5 shrink-0 rounded-full ${event.verb === 'Settled' ? 'bg-ok' : event.verb === 'Delivered' ? 'bg-info' : 'bg-rule-strong'}`}
        />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-baseline gap-2 text-[13.5px]">
            <span className="font-medium text-ink">{event.verb}</span>
            <Link href={event.href} className="min-w-0 truncate text-ink-2 underline-offset-2 hover:text-ink hover:underline">
              {event.agent}
            </Link>
          </span>
          <span className="t-readout flex items-center gap-2 text-[11px] text-ink-3">
            {event.amount && (
              <>
                {event.amount}
                <span aria-hidden>·</span>
              </>
            )}
            <time dateTime={event.at}>
              {when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </time>
            {/* Said on the card, because a hire Pokter funded is not a customer. */}
            {event.team && <span className="text-ink-3">· ours</span>}
          </span>
        </span>
        {event.txHref && (
          <a
            href={event.txHref}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`${event.verb} ${event.agent}: open the transaction on ${event.network}`}
            className="ml-auto shrink-0 text-ink-3 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Icon.ArrowUpRight size={14} />
          </a>
        )}
      </div>
    </li>
  );
}

export function EvidenceTicker({ events }: { events: TickerEvent[] }) {
  const [held, setHeld] = useState(false);
  const [still, setStill] = useState(false);
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const read = () => setStill(query.matches);
    read();
    query.addEventListener('change', read);
    return () => query.removeEventListener('change', read);
  }, []);

  if (events.length === 0) return null;
  const moving = !still;
  const seconds = events.length * SECONDS_PER_CARD;

  return (
    <div className="relative border-y border-rule bg-raised/40">
      {/*
        The row fades into the page at both edges rather than stopping at a
        hard line, so a card leaving is leaving rather than being cut.
      */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-paper to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-paper to-transparent" />

      <div
        ref={track}
        onMouseEnter={() => setHeld(true)}
        onMouseLeave={() => setHeld(false)}
        onFocusCapture={() => setHeld(true)}
        onBlurCapture={() => setHeld(false)}
        className={
          moving
            ? 'overflow-hidden'
            : 'overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        }
      >
        <div className={moving ? 'flex w-max' : 'flex w-max'}>
          <ul
            aria-label="Recent escrow jobs"
            className={moving ? 'ticker-run flex' : 'flex'}
            style={moving ? { animationDuration: `${seconds}s`, animationPlayState: held ? 'paused' : 'running' } : undefined}
          >
            {events.map((event) => (
              <Card key={event.key} event={event} />
            ))}
          </ul>
          {moving && (
            <ul
              aria-hidden
              className="ticker-run flex"
              style={{ animationDuration: `${seconds}s`, animationPlayState: held ? 'paused' : 'running' }}
            >
              {events.map((event) => (
                <Card key={`copy-${event.key}`} event={event} />
              ))}
            </ul>
          )}
        </div>
      </div>

      {moving && (
        <button
          type="button"
          onClick={() => setHeld((was) => !was)}
          aria-pressed={held}
          className="absolute right-2 top-1/2 z-20 grid size-7 -translate-y-1/2 place-items-center rounded-full border border-rule bg-paper text-ink-3 transition-colors hover:text-ink"
        >
          <span className="sr-only">{held ? 'Let the row move again' : 'Stop the row'}</span>
          {held ? <Icon.Play size={12} /> : <span aria-hidden className="flex gap-[2px]"><span className="block h-2.5 w-[2px] bg-current" /><span className="block h-2.5 w-[2px] bg-current" /></span>}
        </button>
      )}
    </div>
  );
}
