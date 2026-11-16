'use client';

import Image from 'next/image';

import type { Shelf, WalkStep, Walkthrough } from '@/features/home/walkthrough-data';
import { Mark } from '@/shell/Logo';
import { Icon } from '@/ui/icons';

/**
 * The five screens the walkthrough plays, drawn rather than filmed.
 *
 * A screen recording was the first answer and is still the most literal
 * one, but it is baked in one theme, unreadable at phone width, carries no
 * text a screen reader can reach, goes stale the day a screen moves, and
 * costs megabytes. These are the same screens rebuilt in the page's own
 * components, at a few kilobytes, in whichever theme the reader chose, and
 * every string on them is read from a job that really happened.
 *
 * That is the line this file has to hold. A reconstruction of a real job
 * is a drawing of something that happened; a reconstruction of a plausible
 * one would be a dramatisation, and a site whose whole argument is "check
 * it yourself" cannot ship a dramatisation of its own product. So nothing
 * here invents a value. The brief is the brief the buyer wrote, the price
 * is the price the agent signed, the hashes are the hashes on chain, the
 * checks are the checks that ran and what each of them found. Where the
 * job carried nothing, the screen says so rather than filling the gap.
 *
 * Each screen reveals in beats, and the player moves a cursor between the
 * same beats, so what the reader watches being clicked is what they then
 * see happen. The beats are declared beside the screen that uses them
 * rather than in the player, because a beat is a fact about the layout.
 */

/** Where the cursor is during a beat, in percentages of the stage. */
export interface Beat {
  x: number;
  y: number;
  /** The beat lands on something: the player draws a click and the screen reacts. */
  click?: boolean;
}

export interface SceneProps {
  walk: Walkthrough;
  shelf: Shelf | null;
  /** How far into the scene the player has got. */
  beat: number;
}

/* ───────────── small parts the screens share ───────────── */

/** Reveals with the beat it belongs to, and is simply there under reduced motion. */
function At({ beat, on, className = '', children }: { beat: number; on: number; className?: string; children: React.ReactNode }) {
  const shown = beat >= on;
  return (
    <div className={`transition-all duration-500 ease-out ${shown ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'} ${className}`}>
      {children}
    </div>
  );
}

function Tile({ mark, name, size = 32 }: { mark: string | null; name: string; size?: number }) {
  if (mark) {
    return <Image src={mark} alt="" width={size} height={size} className="shrink-0 rounded-[8px]" style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-[8px] bg-sunken text-[13px] font-semibold text-ink-3"
      style={{ width: size, height: size }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function Field({ k, v, tone, mono }: { k: string; v: string; tone?: 'ok' | 'watch'; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-rule py-2.5 last:border-b-0">
      <span className="t-label shrink-0 text-[10px]">{k}</span>
      <span className={`flex min-w-0 items-center gap-2 truncate text-[13px] ${mono ? 't-readout' : ''} ${tone === 'ok' ? 'text-ok' : tone === 'watch' ? 'text-watch' : 'text-ink'}`}>
        {tone && <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${tone === 'ok' ? 'bg-ok' : 'bg-watch'}`} />}
        {v}
      </span>
    </div>
  );
}

/** A button the cursor is about to press, or has. */
function Press({ label, pressed, wide }: { label: string; pressed: boolean; wide?: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center gap-2 rounded-[10px] px-5 py-2.5 text-[13px] font-medium transition-all duration-200 ${
        wide ? 'w-full' : ''
      } ${pressed ? 'scale-[0.97] bg-signal text-signal-ink' : 'bg-ink text-paper'}`}
    >
      {label}
    </span>
  );
}

/* ───────────── 01 · Find ───────────── */

function Find({ walk, shelf, beat }: SceneProps) {
  const brief = walk.scene.brief;
  return (
    <div className="flex h-full flex-col gap-4 px-5 py-5 sm:px-8 sm:py-6">
      {/* The search field, with the buyer's own words typing into it. */}
      <div className={`flex shrink-0 items-center gap-3 rounded-[12px] border bg-raised px-4 py-3 transition-colors duration-300 ${beat >= 1 ? 'border-ink' : 'border-rule'}`}>
        <Icon.Search size={16} className="shrink-0 text-ink-3" />
        {beat >= 1 ? (
          <span
            className="walk-type t-readout min-w-0 whitespace-nowrap text-[13px] text-ink"
            style={{ animationTimingFunction: `steps(${Math.max(brief.length, 1)}, end)` }}
          >
            {brief}
          </span>
        ) : (
          <span className="text-[13px] text-ink-3">What do you need done?</span>
        )}
      </div>

      <At beat={beat} on={2} className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="flex items-baseline gap-2.5">
            <span className="text-[13px] font-medium text-ink">{walk.scene.shelf.label}</span>
            {shelf && <span className="t-readout text-[11px] text-ink-3">{shelf.count} listed</span>}
          </p>
          <p className="flex items-center gap-1.5 text-[11px] text-ink-3">
            Sorted by <span className="rounded-full border border-rule px-2 py-[2px] text-ink-2">Most reliable</span>
          </p>
        </div>

        <ul className="flex flex-col gap-2">
          {(shelf?.rows ?? []).map((row, i) => (
            <li
              key={row.key}
              className={`flex items-center gap-3.5 rounded-[11px] border px-4 py-3 transition-all duration-300 ${
                row.hired && beat >= 3 ? 'border-ink bg-raised shadow-lift' : 'border-rule bg-raised/60'
              }`}
              style={{ transitionDelay: `${i * 70}ms` }}
            >
              <Tile mark={row.mark} name={row.name} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[13.5px] font-medium text-ink">{row.name}</span>
                <span className="truncate text-[11.5px] text-ink-3">{row.note}</span>
              </span>
              {/*
                Said on the row, because the ranking did not pick this one
                and the screen must not imply it did: these are the agents
                Pokter measured, and that is the one the buyer chose.
              */}
              {row.hired && (
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  <span className="hidden rounded-full border border-rule-strong px-2 py-[2px] text-[10.5px] text-ink-2 sm:inline">
                    hired for this job
                  </span>
                  <span className={`transition-opacity duration-300 ${beat >= 3 ? 'opacity-100' : 'opacity-0'}`}>
                    <Icon.Arrow size={15} className="text-ink" />
                  </span>
                </span>
              )}
            </li>
          ))}
        </ul>

        <p className="mt-auto shrink-0 border-t border-rule pt-3 text-[11.5px] leading-relaxed text-ink-3">
          Ranked on what Pokter measured calling them &mdash; how often they answered, whether they signed a
          price, what they have delivered &mdash; not on what they say about themselves.
        </p>
      </At>
    </div>
  );
}

const FIND_BEATS: Beat[] = [
  { x: 48, y: 26 },
  { x: 48, y: 26, click: true },
  { x: 34, y: 54 },
  { x: 46, y: 70, click: true },
];

/* ───────────── 02 · Inspect ───────────── */

function Inspect({ walk, beat }: SceneProps) {
  const s = walk.scene;
  return (
    <div className="flex h-full flex-col gap-4 px-5 py-5 sm:px-8 sm:py-6">
      <div className="flex shrink-0 items-center gap-3.5">
        <Tile mark={s.agent.mark} name={s.agent.name} size={44} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[18px] font-medium tracking-[-0.02em] text-ink">{s.agent.name}</span>
          <span className="t-readout truncate text-[11.5px] text-ink-3">ERC-8004 #{s.agent.tokenId} · {walk.job.network}</span>
        </span>
        <span className="ml-auto hidden shrink-0 items-center gap-1.5 rounded-full border border-ok/30 bg-ok-wash px-2.5 py-1 text-[11px] font-medium text-ok sm:inline-flex">
          <span aria-hidden className="size-1.5 rounded-full bg-ok" />
          Answering
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <p className="shrink-0 text-[10px] uppercase tracking-[0.1em] text-ink-3">What Pokter found</p>
        <div className="flex shrink-0 flex-col rounded-[12px] border border-rule bg-raised px-4">
          <At beat={beat} on={1}><Field k="Identity" v={`ERC-8004 #${s.agent.tokenId}, read from the registry`} tone="ok" /></At>
          <At beat={beat} on={1}><Field k="Signed price" v={`${s.price}, signed by its own wallet`} tone="ok" /></At>
          <At beat={beat} on={2}><Field k="Delivered before" v="Paid work, settled through escrow" tone="ok" /></At>
          <At beat={beat} on={2}><Field k="Granted over your wallet" v="Nothing, before or after" tone="ok" /></At>
        </div>

        <At beat={beat} on={2} className="mt-auto flex shrink-0 flex-wrap items-center justify-between gap-4 border-t border-rule pt-4">
          <span className="max-w-[26rem] text-[11.5px] leading-relaxed text-ink-3">
            A price exists only in a quote the agent signed. Pokter checks that signature against the wallet
            named in its registration, and shows no price when the two do not match.
          </span>
          <Press label="Hire" pressed={beat >= 3} />
        </At>
      </div>
    </div>
  );
}

const INSPECT_BEATS: Beat[] = [
  { x: 40, y: 30 },
  { x: 42, y: 48 },
  { x: 44, y: 62 },
  { x: 86, y: 82, click: true },
];

/* ───────────── 03 · Fund ───────────── */

function Fund({ walk, beat }: SceneProps) {
  const s = walk.scene;
  return (
    <div className="flex h-full flex-col justify-center gap-3 px-5 py-5 sm:px-8 sm:py-6">
      <div className="flex flex-col gap-4 rounded-[14px] border border-rule bg-raised p-5 shadow-lift">
        <div className="flex items-center gap-3 border-b border-rule pb-4">
          <Tile mark={s.agent.mark} name={s.agent.name} size={34} />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[14px] font-medium text-ink">Hire {s.agent.name}</span>
            <span className="truncate text-[11px] text-ink-3">{s.shelf.label}</span>
          </span>
          <span className="t-readout ml-auto shrink-0 text-[16px] text-ink">{s.price}</span>
        </div>
        <div className="flex flex-col">
          <At beat={beat} on={1}><Field k="Held by" v={s.escrow} tone="ok" /></At>
          <At beat={beat} on={1}><Field k="Paid out when" v="The answer is delivered and accepted" tone="ok" /></At>
          <At beat={beat} on={2}><Field k="Granted over your wallet" v="Nothing, so there is nothing to revoke" tone="ok" /></At>
          <At beat={beat} on={2}><Field k="If nothing arrives" v="The deadline passes and you take it back" tone="ok" /></At>
        </div>
        <At beat={beat} on={2}>
          <Press label={beat >= 4 ? 'Funded' : 'Fund in your wallet'} pressed={beat >= 3} wide />
        </At>
      </div>

      {/* The wallet is the buyer's own, and signs in its own window. */}
      <At beat={beat} on={3} className="flex items-center gap-3 rounded-[12px] border border-rule bg-sunken/60 px-4 py-3">
        <Icon.Wallet size={15} className="shrink-0 text-ink-3" />
        <span className="text-[12px] text-ink-2">
          {beat >= 4 ? 'Signed in your own wallet. Pokter never held the money.' : 'Your own wallet opens. Pokter cannot sign for you.'}
        </span>
      </At>

      <At beat={beat} on={4}>
        {s.fundingTx ? (
          <div className="flex items-center gap-2.5 rounded-[11px] border border-ok/30 bg-ok-wash px-4 py-2.5">
            <Icon.Check size={14} className="shrink-0 text-ok" />
            <span className="t-readout truncate text-[12px] text-ok">{s.fundingTx.short}</span>
            <span className="ml-auto shrink-0 text-[11px] text-ink-3">on {walk.job.network}</span>
          </div>
        ) : (
          <p className="text-[11.5px] text-ink-3">No funding transaction was recorded for this job.</p>
        )}
      </At>
    </div>
  );
}

const FUND_BEATS: Beat[] = [
  { x: 50, y: 28 },
  { x: 42, y: 44 },
  { x: 44, y: 56 },
  { x: 50, y: 66, click: true },
  { x: 48, y: 86 },
];

/* ───────────── 04 · Delivered ───────────── */

function Delivered({ walk, beat }: SceneProps) {
  const s = walk.scene;
  return (
    <div className="flex h-full flex-col justify-center gap-4 px-5 py-5 sm:px-8 sm:py-6">
      <div className="flex shrink-0 items-baseline justify-between gap-4">
        <p className="text-[10px] uppercase tracking-[0.1em] text-ink-3">The delivery</p>
        <p className="t-readout text-[11px] text-ink-3">Job #{walk.job.jobId}</p>
      </div>

      <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <At beat={beat} on={0} className="rounded-[12px] border border-rule bg-raised p-4">
          <p className="t-label text-[10px]">Hash committed first</p>
          <p className="t-readout mt-2 truncate text-[13px] text-ink">{s.deliverable ?? 'Not read from chain'}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
            Written on chain before the file existed anywhere a buyer could see it.
          </p>
        </At>
        <At beat={beat} on={1} className="rounded-[12px] border border-rule bg-raised p-4">
          <p className="t-label text-[10px]">The file, hashed again</p>
          <p className="t-readout mt-2 truncate text-[13px] text-ink">{s.deliverable ?? '—'}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
            Recomputed by Pokter from the record that was actually delivered.
          </p>
        </At>
      </div>

      <At beat={beat} on={2} className="flex shrink-0 items-center gap-2.5 rounded-[12px] border border-ok/30 bg-ok-wash px-4 py-3">
        <Icon.Check size={15} className="shrink-0 text-ok" />
        <span className="text-[13.5px] font-medium text-ok">Matches</span>
        <span className="ml-auto text-[11.5px] text-ink-3">{s.deliveredAt ?? 'Delivery time not recorded'}</span>
      </At>

      <At beat={beat} on={3} className="shrink-0 rounded-[12px] border border-rule bg-sunken/50 px-4 py-3.5">
        <p className="text-[11.5px] leading-relaxed text-ink-3">
          A file that does not match the hash committed for it is not a delivery here, and is not counted as
          one. The agent cannot change its answer after the fact, and neither can Pokter &mdash; which is the
          only reason the checks on the next screen are worth running.
        </p>
      </At>
    </div>
  );
}

const DELIVERED_BEATS: Beat[] = [
  { x: 28, y: 40 },
  { x: 72, y: 40 },
  { x: 50, y: 62, click: true },
  { x: 48, y: 84 },
];

/* ───────────── 05 · Checked ───────────── */

function Checked({ walk, beat }: SceneProps) {
  const s = walk.scene;
  /* Four checks tick per beat, so a long list still finishes inside the chapter. */
  const ticked = Math.max(0, (beat - 1) * 4);
  const passed = s.checks.filter((c) => c.outcome === 'passed').length;
  return (
    <div className="flex h-full flex-col gap-3 px-5 py-5 sm:px-8 sm:py-6">
      <div className="flex shrink-0 items-baseline justify-between gap-4">
        <p className="text-[10px] uppercase tracking-[0.1em] text-ink-3">Pokter&rsquo;s own checks</p>
        <p className="t-readout text-[11px] text-ink-3">{s.method}</p>
      </div>

      <ul className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {s.checks.map((check, i) => {
          const on = i < ticked;
          return (
            <li
              key={check.label + i}
              className={`flex items-center gap-2.5 border-b border-rule py-2 transition-all duration-300 last:border-b-0 ${on ? 'opacity-100' : 'opacity-25'}`}
            >
              <span
                aria-hidden
                className={`grid size-4 shrink-0 place-items-center rounded-full transition-colors duration-300 ${
                  !on ? 'bg-rule'
                  : check.outcome === 'passed' ? 'bg-ok text-paper'
                  : check.outcome === 'failed' ? 'bg-watch text-paper'
                  : 'bg-rule-strong text-paper'
                }`}
              >
                {on && check.outcome === 'passed' && <Icon.Check size={10} />}
                {on && check.outcome === 'failed' && <Icon.Cross size={10} />}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{check.label}</span>
              <span
                className={`shrink-0 text-[11px] transition-opacity duration-300 ${on ? 'opacity-100' : 'opacity-0'} ${
                  check.outcome === 'passed' ? 'text-ok' : check.outcome === 'failed' ? 'text-watch' : 'text-ink-3'
                }`}
              >
                {check.outcome === 'passed' ? 'agrees' : check.outcome === 'failed' ? 'disagrees' : 'not checked'}
              </span>
            </li>
          );
        })}
      </ul>

      <At beat={beat} on={4} className="flex shrink-0 items-center gap-2.5 rounded-[11px] border border-ok/30 bg-ok-wash px-4 py-2.5">
        <Icon.Check size={14} className="shrink-0 text-ok" />
        <span className="text-[12.5px] font-medium text-ok">{passed} of {s.checks.length} recomputed and agreed</span>
      </At>
      <At beat={beat} on={4} className="shrink-0">
        <p className="text-[11.5px] leading-relaxed text-ink-3">
          A delivered plan and a settled escrow do not establish a financial outcome. Nothing here is a claim
          about money made.
        </p>
      </At>
    </div>
  );
}

const CHECKED_BEATS: Beat[] = [
  { x: 50, y: 26 },
  { x: 38, y: 40 },
  { x: 38, y: 54 },
  { x: 38, y: 68 },
  { x: 48, y: 84, click: true },
];

/* ───────────── the set ───────────── */

export const SCENES: Record<WalkStep['key'], { Body: (props: SceneProps) => React.JSX.Element; beats: Beat[] }> = {
  find: { Body: Find, beats: FIND_BEATS },
  inspect: { Body: Inspect, beats: INSPECT_BEATS },
  fund: { Body: Fund, beats: FUND_BEATS },
  delivered: { Body: Delivered, beats: DELIVERED_BEATS },
  checked: { Body: Checked, beats: CHECKED_BEATS },
};

/**
 * The window the screens sit in: a browser bar carrying the real path, and
 * Pokter's own header under it, so the reader is looking at the site rather
 * than at a diagram of it. The path is the route that screen is actually at,
 * which is also where the links under the stage lead.
 */
export function Chrome({ path, children }: { path: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-rule bg-sunken/70 px-3.5 py-2.5">
        <span aria-hidden className="flex gap-1.5">
          <span className="block size-2 rounded-full bg-rule-strong" />
          <span className="block size-2 rounded-full bg-rule-strong" />
          <span className="block size-2 rounded-full bg-rule-strong" />
        </span>
        <span className="t-readout mx-auto flex min-w-0 max-w-[20rem] items-center gap-1.5 rounded-full border border-rule bg-paper px-3 py-[4px] text-[11px] text-ink-3">
          <Icon.Lock size={10} className="shrink-0" />
          <span className="truncate">pokter.xyz{path}</span>
        </span>
        <span aria-hidden className="w-[34px] shrink-0" />
      </div>
      <div className="flex shrink-0 items-center gap-4 border-b border-rule bg-raised px-3.5 py-2.5 sm:px-5">
        <Mark size={17} className="text-ink" />
        <span className="hidden gap-4 text-[11.5px] text-ink-3 sm:flex">
          <span className="text-ink">Discover</span>
          <span>Requests</span>
          <span>Build</span>
        </span>
        <span className="ml-auto rounded-full border border-rule px-2.5 py-1 text-[11px] text-ink-3">Connect</span>
      </div>
      <div className="min-h-0 flex-1 bg-paper">{children}</div>
    </div>
  );
}
