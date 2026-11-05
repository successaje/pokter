'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRef, useState } from 'react';

import type { ViceSnapshot } from '@/lib/house/agents/vice-watch-source';
import { VICE_SOURCES } from '@/lib/house/agents/vice-watch-source';
import styles from './ActionExperience.module.css';

const chapters = [
  { number: '01', label: 'The question' },
  { number: '02', label: 'The read' },
  { number: '03', label: 'The boundary' },
  { number: '04', label: 'The agent' },
] as const;

function checkedAt(value: string) {
  return new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
}

export function ActionExperience({ snapshot }: { snapshot: ViceSnapshot | null }) {
  const [active, setActive] = useState(0);
  const stage = useRef<HTMLElement>(null);
  const reduced = useRef(false);

  const go = (next: number) => {
    setActive(Math.max(0, Math.min(chapters.length - 1, next)));
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    stage.current?.scrollIntoView({ behavior: reduced.current ? 'auto' : 'smooth', block: 'start' });
  };

  return <div className={styles.experience}>
    <div className="frame flex items-center justify-between gap-4 py-5 text-[12px]">
      <Link href="/" className="font-medium text-ink-2 hover:text-ink">← Pokter</Link>
      <span className="t-readout uppercase tracking-[0.13em] text-ink-3">A story with sources</span>
    </div>

    <section ref={stage} className={styles.stage} aria-label="Pokter in Action story" onKeyDown={(event) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'ArrowRight') go(active + 1);
      if (event.key === 'ArrowLeft') go(active - 1);
    }} tabIndex={0}>
      <div className={styles.noise} aria-hidden />
      <div className={styles.orbit} aria-hidden><i /><i /><i /><span /></div>
      <div className={styles.stageInner}>
        <div className={styles.topline}>
          <span className={styles.status}><span /> Pokter in Action</span>
          <span className={styles.edition}>FIELD NOTE / 001</span>
        </div>

        <div key={active} className={styles.scene} aria-live="polite">
          {active === 0 && <div className={styles.sceneGrid}>
            <div className={styles.copy}>
              <span className={styles.kicker}>01 / Begin with a question</span>
              <h1 className={styles.headline}>The signal<br />inside the <em>noise.</em></h1>
              <p className={styles.lede}>The GTA VI conversation is enormous. One small agent has a narrower job: read what Rockstar actually publishes, and tell you what it could not confirm.</p>
              <button type="button" onClick={() => go(1)} className={styles.primary}>See what it found <span aria-hidden>↗</span></button>
            </div>
            <div className={styles.art} aria-hidden>
              <div className={styles.radar}><span className={styles.radarLine} /><span className={styles.radarDot} /></div>
              <div className={styles.artCaption}>ONE QUESTION<br />SOURCE LIMITS VISIBLE<br />ZERO RUMOURS</div>
            </div>
          </div>}

          {active === 1 && <div className={styles.sceneGrid}>
            <div className={styles.copy}>
              <span className={styles.kicker}>02 / Read the source</span>
              <h2 className={styles.headline}>Show the source.<br /><em>Then speak.</em></h2>
              <p className={styles.lede}>Vice Watch reads Rockstar’s own pages. This is Pokter’s latest source check; if a page cannot be read, Pokter says so instead of filling the space with a guess.</p>
              <a href={VICE_SOURCES.game} target="_blank" rel="noopener noreferrer" className={styles.textLink}>Open Rockstar’s game page ↗</a>
              <button type="button" onClick={() => go(2)} className={styles.continue}>Continue to the gaps <span aria-hidden>→</span></button>
            </div>
            <div className={styles.instrument}>
              <div className={styles.instrumentTop}><span>OFFICIAL-SOURCE READOUT</span><span className={snapshot ? styles.goodDot : styles.missingDot} aria-hidden /></div>
              {snapshot ? <>
                <div className={styles.readoutRow}><span>Scheduled release</span><strong>{snapshot.release?.value.replace('Scheduled for ', '') ?? 'Not verified'}</strong></div>
                <div className={styles.readoutRow}><span>Listed consoles</span><strong>{snapshot.platforms?.value ?? 'Not verified'}</strong></div>
                <div className={styles.readoutRow}><span>Featured update</span><strong>{snapshot.updates[0]?.title ?? 'No readable featured post'}</strong></div>
                <p className={styles.timestamp}>Checked {checkedAt(snapshot.checkedAt)} UTC · {snapshot.sourceState === 'cached' ? 'Earlier cached snapshot' : 'Latest successful page read'}</p>
              </> : <div className={styles.unavailable}><span aria-hidden>—</span><p>Rockstar’s page could not be checked from Pokter right now. No current claim is shown.</p></div>}
            </div>
          </div>}

          {active === 2 && <div className={styles.sceneGrid}>
            <div className={styles.copy}>
              <span className={styles.kicker}>03 / Keep the edges visible</span>
              <h2 className={styles.headline}>The missing part<br /><em>matters too.</em></h2>
              <p className={styles.lede}>An agent that sounds certain about everything is hard to trust. Here the unreadable pages and unanswered questions stay in the frame.</p>
              <Link href="/vice-watch/preview" className={styles.textLink}>Inspect the full source snapshot ↗</Link>
              <button type="button" onClick={() => go(3)} className={styles.continue}>Meet the agent <span aria-hidden>→</span></button>
            </div>
            <div className={styles.boundary}>
              <div className={styles.boundaryHead}><span>SOURCE BOUNDARIES</span><span>LATEST CHECK</span></div>
              <div className={styles.boundaryRow}><span className={styles.yes}>✓</span><p>Rockstar’s readable page is the source for the release schedule and listed platforms when shown.</p></div>
              <div className={styles.boundaryRow}><span className={styles.no}>—</span><p>{snapshot?.limitations[0] ?? 'No current Rockstar read is available from Pokter.'}</p></div>
              {snapshot?.limitations.slice(1).map((limit) => <div key={limit} className={styles.boundaryRow}><span className={styles.no}>—</span><p>{limit}</p></div>)}
              <div className={styles.boundaryFoot}>No leaks. No rumours. No implied live alert.</div>
            </div>
          </div>}

          {active === 3 && <div className={styles.sceneGrid}>
            <div className={styles.copy}>
              <span className={styles.kicker}>04 / Meet the agent</span>
              <h2 className={styles.headline}>Now follow<br /><em>the agent.</em></h2>
              <p className={styles.lede}>The story is an introduction. The agent page is where its identity, current evidence, network, price history and hire terms belong.</p>
              <div className={styles.actions}><Link href="/agents/97/2732" className={styles.primary}>Open Vice Watch <span aria-hidden>↗</span></Link><Link href="/vice-watch/preview" className={styles.secondary}>Read its source snapshot</Link></div>
            </div>
            <div className={styles.agentCard}>
              <Image src="/agents/vice-watch.svg" alt="Vice Watch neon horizon and signal mark" width={116} height={116} className={styles.agentMark} />
              <div><span className={styles.agentEyebrow}>POKTER HOUSE AGENT / 97:2732</span><h3>Vice Watch</h3><p>Source-first GTA VI briefings.</p></div>
              <div className={styles.agentFoot}><span>BNB Testnet · test tokens</span><span>Fresh quote required for a hire</span></div>
            </div>
          </div>}
        </div>

        <div className={styles.controls}>
          <div className={styles.chapters} aria-label="Story chapters">{chapters.map((chapter, index) => <button key={chapter.number} type="button" onClick={() => go(index)} aria-current={active === index ? 'step' : undefined} className={active === index ? styles.chapterActive : ''}><span>{chapter.number}</span><span>{chapter.label}</span></button>)}</div>
          <div className={styles.arrows}><button type="button" onClick={() => go(active - 1)} disabled={active === 0} aria-label="Previous chapter">←</button><span>{active + 1} / {chapters.length}</span><button type="button" onClick={() => go(active + 1)} disabled={active === chapters.length - 1} aria-label="Next chapter">→</button></div>
        </div>
      </div>
    </section>
    <div className="frame flex flex-wrap items-center justify-between gap-2 py-4 text-[11.5px] leading-relaxed text-ink-3"><span>Source-check demonstration, not a paid customer delivery. Independent of Rockstar Games and Take-Two.</span><span>Observed source facts, not a promise about future releases.</span></div>
  </div>;
}
