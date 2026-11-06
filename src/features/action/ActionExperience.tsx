'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import type { ViceSnapshot } from '@/lib/house/agents/vice-watch-source';
import { VICE_SOURCES } from '@/lib/house/agents/vice-watch-source';
import styles from './ActionExperience.module.css';

const acts = [
  { title: 'The question', duration: 6 },
  { title: 'The source', duration: 9 },
  { title: 'The gaps', duration: 8 },
  { title: 'The agent', duration: 9 },
] as const;
const ends = acts.map((_, i) => acts.slice(0, i + 1).reduce((sum, act) => sum + act.duration, 0));
const starts = [0, ...ends.slice(0, -1)];
const total = ends.at(-1)!;
const currentAct = (seconds: number) => { const index = ends.findIndex((end) => seconds < end); return index < 0 ? acts.length - 1 : index; };
const clock = (seconds: number) => `00:${String(Math.min(total, Math.floor(seconds))).padStart(2, '0')}`;
const checkedAt = (value: string) => new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });

function SourceInspector({ snapshot, onClose, closeRef }: { snapshot: ViceSnapshot | null; onClose: () => void; closeRef: React.RefObject<HTMLButtonElement | null> }) {
  return <aside className={styles.inspector} aria-label="Inspect the sources">
    <div className={styles.inspectorHead}><div><span className={styles.mono}>THE RECORD / 001</span><h2>What the source says</h2></div><button ref={closeRef} type="button" onClick={onClose} aria-label="Close source inspector">×</button></div>
    <div className={styles.inspectorBody}>
      {snapshot ? <>
        <p className={styles.inspectorTime}>Checked {checkedAt(snapshot.checkedAt)} UTC · {snapshot.sourceState === 'cached' ? 'Earlier cached snapshot' : 'Latest successful page read'}</p>
        <div className={styles.sourceFact}><span>Scheduled release</span>{snapshot.release ? <a href={snapshot.release.url} target="_blank" rel="noopener noreferrer">{snapshot.release.value.replace('Scheduled for ', '')} ↗</a> : <strong>Not verified</strong>}</div>
        <div className={styles.sourceFact}><span>Listed consoles</span>{snapshot.platforms ? <a href={snapshot.platforms.url} target="_blank" rel="noopener noreferrer">{snapshot.platforms.value} ↗</a> : <strong>Not verified</strong>}</div>
        <div className={styles.sourceFact}><span>Featured update</span>{snapshot.updates[0] ? <a href={snapshot.updates[0].url} target="_blank" rel="noopener noreferrer">{snapshot.updates[0].title} ↗</a> : <strong>No readable featured post</strong>}</div>
        <h3>Left unconfirmed</h3><ul>{snapshot.limitations.map((limit) => <li key={limit}>{limit}</li>)}</ul>
      </> : <p className={styles.sourceUnavailable}>Pokter could not check Rockstar’s page right now, so this film shows no current source fact.</p>}
      <a href={VICE_SOURCES.game} target="_blank" rel="noopener noreferrer" className={styles.inspectorLink}>Open Rockstar’s game page ↗</a>
      <Link href="/vice-watch/preview" className={styles.inspectorLink}>Open Pokter’s full source snapshot ↗</Link>
      <p className={styles.inspectorNote}>This is a source-check demonstration, not a paid customer delivery. The city artwork is illustrative.</p>
    </div>
  </aside>;
}

export function ActionExperience({ snapshot }: { snapshot: ViceSnapshot | null }) {
  const [open, setOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [inspect, setInspect] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const film = useRef<HTMLDivElement>(null);
  const playButton = useRef<HTMLButtonElement>(null);
  const inspectorClose = useRef<HTMLButtonElement>(null);
  const active = currentAct(elapsed);
  const finished = elapsed >= total;

  useEffect(() => {
    if (!open || paused || inspect || finished) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const delta = Math.min((now - last) / 1000, 0.25);
      last = now;
      setElapsed((value) => Math.min(total, value + delta));
    }, 80);
    return () => window.clearInterval(timer);
  }, [open, paused, inspect, finished]);

  useEffect(() => {
    if (!open) return;
    const oldOverflow = document.body.style.overflow;
    const returnFocus = playButton.current;
    document.body.style.overflow = 'hidden';
    film.current?.focus();
    const onVisibility = () => { if (document.hidden) setPaused(true); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('visibilitychange', onVisibility); returnFocus?.focus(); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { if (inspect) { setInspect(false); film.current?.focus(); } else setOpen(false); return; }
      if (event.key === 'Tab') {
        const scope = inspect ? film.current?.querySelector<HTMLElement>(`.${styles.inspector}`) : film.current;
        const focusable = Array.from(scope?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []);
        if (focusable.length) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && (document.activeElement === first || !scope?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && (document.activeElement === last || !scope?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
        }
        return;
      }
      if (inspect || (event.target instanceof HTMLElement && ['BUTTON', 'A', 'INPUT'].includes(event.target.tagName))) return;
      if (event.code === 'Space') { event.preventDefault(); setPaused((value) => !value); }
      if (event.key === 'ArrowRight') setElapsed(starts[Math.min(acts.length - 1, active + 1)]);
      if (event.key === 'ArrowLeft') setElapsed(starts[Math.max(0, active - 1)]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, inspect, active]);

  useEffect(() => { if (inspect) inspectorClose.current?.focus(); }, [inspect]);

  const start = () => { setElapsed(0); setInspect(false); setPaused(window.matchMedia('(prefers-reduced-motion: reduce)').matches); setOpen(true); };
  const seek = (index: number) => { setElapsed(starts[index]); setInspect(false); };
  const inspectSources = () => { setPaused(true); setInspect(true); };

  return <div className={styles.experience}>
    <div className="frame flex items-center justify-between gap-4 py-5 text-[12px]"><Link href="/" className="font-medium text-ink-2 hover:text-ink">← Pokter</Link><span className="t-readout uppercase tracking-[0.13em] text-ink-3">A film with sources</span></div>
    <section className={styles.poster} aria-labelledby="film-title" onPointerMove={(event) => {
      if (event.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      event.currentTarget.style.setProperty('--look-x', `${((event.clientX - bounds.left) / bounds.width - .5) * -22}px`);
      event.currentTarget.style.setProperty('--look-y', `${((event.clientY - bounds.top) / bounds.height - .5) * -14}px`);
    }}>
      <div className={styles.posterImage} aria-hidden /><div className={styles.filmGrain} aria-hidden />
      <div className={styles.posterInner}>
        <div className={styles.posterTop}><span>POKTER ORIGINAL · FIELD NOTE 001</span><span>AN INTERACTIVE SHORT / 00:32</span></div>
        <div className={styles.posterCopy}><span className={styles.eyebrow}>STARRING VICE WATCH · BNB TESTNET</span><h1 id="film-title">The truth<br />has a <em>source.</em></h1><p>When every voice has a story, follow the one that can show you where it came from.</p><button ref={playButton} type="button" onClick={start} className={styles.playButton}><span aria-hidden>▶</span> Play the story <small>00:32</small></button></div>
        <div className={styles.posterBottom}><span>ARTWORK IS ILLUSTRATIVE · SOURCE FACTS ARE LINKED</span><span>PRESS PLAY ↗</span></div>
      </div>
    </section>
    <div className="frame flex flex-wrap items-center justify-between gap-2 py-4 text-[11.5px] leading-relaxed text-ink-3"><span>Source-check demonstration, not a paid customer delivery. Independent of Rockstar Games and Take-Two.</span><Link href="/vice-watch/preview" className="underline underline-offset-4">Inspect the source snapshot ↗</Link></div>

    {open && <div ref={film} className={styles.film} role="dialog" aria-modal="true" aria-label="Pokter in Action interactive film" tabIndex={-1}>
      <div key={active} className={`${styles.filmImage} ${styles[`imageAct${active}`]}`} aria-hidden /><div className={styles.filmShade} aria-hidden /><div className={styles.filmGrain} aria-hidden />
      <div className={styles.filmTop}><span className={styles.mono}>POKTER / IN ACTION</span><span className={styles.mono}>FIELD NOTE 001 · {clock(elapsed)} / {clock(total)}</span><button type="button" onClick={() => setOpen(false)} aria-label="Close film">Close <span aria-hidden>×</span></button></div>
      <section key={`scene-${active}`} className={styles.filmScene} aria-live="polite">
        {active === 0 && <div className={styles.sceneOne}><span className={styles.sceneIndex}>01 / THE QUESTION</span><h2>Everyone has<br />a <em>version.</em></h2><p>What has Rockstar actually said about GTA VI?</p><div className={styles.sceneWhisper}>The answer starts with a source.</div></div>}
        {active === 1 && <div className={styles.sceneTwo}><div className={styles.sceneCopy}><span className={styles.sceneIndex}>02 / THE SOURCE</span><h2>Cut through<br />the <em>noise.</em></h2><p>Vice Watch reads Rockstar’s official pages and reports only what it can verify.</p><button type="button" onClick={inspectSources} className={styles.inspectButton}>Inspect the source <span aria-hidden>↗</span></button></div><div className={styles.factFrame}><span className={styles.factLabel}>LATEST SOURCE CHECK · {snapshot ? checkedAt(snapshot.checkedAt) + ' UTC' : 'UNAVAILABLE'}</span><strong>{snapshot?.release?.value.replace('Scheduled for ', '') ?? 'No current release fact verified'}</strong><span>{snapshot?.release ? 'Scheduled release shown by Rockstar' : 'Pokter could not read the page'}</span><div className={styles.factRule} /><span>{snapshot?.platforms?.value ?? 'Platforms not verified in this check'}</span></div></div>}
        {active === 2 && <div className={styles.sceneThree}><span className={styles.sceneIndex}>03 / THE GAPS</span><h2>The honest answer<br />has <em>edges.</em></h2><div className={styles.limitFilm}>{(snapshot?.limitations.length ? snapshot.limitations : ['The official page could not be checked from Pokter right now.']).slice(0, 3).map((limit, index) => <p key={limit} style={{ animationDelay: `${index * 180}ms` }}><span>0{index + 1}</span>{limit}</p>)}</div><button type="button" onClick={inspectSources} className={styles.inspectButton}>Examine the record <span aria-hidden>↗</span></button></div>}
        {active === 3 && <div className={styles.sceneFour}><div className={styles.finalMark}><Image src="/agents/vice-watch.svg" alt="Vice Watch signal mark" width={100} height={100} /></div><div><span className={styles.sceneIndex}>04 / THE AGENT</span><h2>Meet<br /><em>Vice Watch.</em></h2><p>A source-first GTA VI briefing agent on BNB Testnet. The profile shows its current evidence, network and hire terms.</p><div className={styles.finalActions}><Link href="/agents/97/2732" className={styles.finalPrimary}>Open the agent ↗</Link><button type="button" onClick={inspectSources} className={styles.finalSecondary}>Inspect sources</button></div><small>Fresh signed quote required for any funded hire.</small></div></div>}
      </section>
      <div className={styles.filmControls}><button type="button" onClick={() => { if (finished) { setElapsed(0); setPaused(false); } else setPaused((value) => !value); }} className={styles.pauseButton} aria-label={finished ? 'Replay film' : paused ? 'Play film' : 'Pause film'}>{finished ? '↻' : paused ? '▶' : 'Ⅱ'}</button><div className={styles.timeline} aria-label="Film timeline">{acts.map((act, index) => <button key={act.title} type="button" onClick={() => seek(index)} aria-label={`Jump to ${act.title}`} aria-current={active === index ? 'step' : undefined}><span className={styles.timelineTrack}><span style={{ width: `${Math.max(0, Math.min(1, (elapsed - starts[index]) / act.duration)) * 100}%` }} /></span><span>{String(index + 1).padStart(2, '0')} {act.title}</span></button>)}</div><button type="button" onClick={inspectSources} className={styles.recordButton}>The record ↗</button></div>
      {inspect && <SourceInspector snapshot={snapshot} closeRef={inspectorClose} onClose={() => { setInspect(false); film.current?.focus(); }} />}
    </div>}
  </div>;
}
