import type { ReactElement } from 'react';

/**
 * The parts every shared-link card has in common.
 *
 * Agent pages had a card; everything else fell back to one static image
 * for the whole site, so a link to the campaign guide, the methodology
 * or the catalogue arrived in a feed saying nothing about what was
 * behind it. These are the pages most worth linking to during a
 * campaign, which is the worst time to post a blank.
 *
 * Extracted rather than copied because the palette and the mark already
 * existed inside the agent card, and three more copies of a hex value
 * is how a brand drifts.
 *
 * A card earns its place by carrying a fact — a count, a date, a
 * measurement — not a slogan. Where a page has no fact of its own,
 * there is nothing here for it.
 */

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export const PAPER = '#f3f1eb';
export const INK = '#16171a';
export const INK2 = '#48494d';
export const INK3 = '#66665f';
export const RULE = '#dcd8cd';
export const SIGNAL = '#f0b90b';

export function Mark({ size: s, ink = INK }: { size: number; ink?: string }) {
  return (
    <svg width={s} height={s} viewBox="150 52 682 712">
      <path fill={ink} d="M192 62H513Q545 62 545 94V168Q545 200 513 200H344Q332 200 332 212V752H192Q160 752 160 720V94Q160 62 192 62Z" />
      <path fill={ink} d="M592 62H716Q820 62 820 166V546Q820 648 716 648H457Q425 648 425 616V562Q425 530 457 530H640Q652 530 652 518V258Q652 246 640 246H592Z" />
      <rect x="400" y="290" width="183" height="182" rx="36" fill={SIGNAL} />
    </svg>
  );
}

export interface CardFact {
  label: string;
  value: string;
  note?: string;
}

/**
 * One layout for every card: the mark and a context line, a heading, a
 * supporting sentence, and a row of facts along the bottom.
 */
export function Card({
  context,
  title,
  lede,
  facts,
  accent,
  signalRule,
}: {
  context: string;
  title: string;
  lede?: string;
  facts: CardFact[];
  accent?: string;
  /**
   * Draw the fact rule in the brand's signal colour.
   *
   * The accent cannot go on the title: #f0b90b on #f3f1eb is about 1.8:1,
   * which is unreadable at any size. A rule carries no text, so it can
   * hold the colour that makes the card recognisable in a feed.
   */
  signalRule?: boolean;
}): ReactElement {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: PAPER, color: INK, padding: '64px 72px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 30, fontWeight: 600 }}>
          <Mark size={40} />
          Pokter
        </div>
        <div style={{ display: 'flex', fontSize: 22, color: INK3 }}>{context}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 64, gap: 18 }}>
        <div style={{ display: 'flex', fontSize: 68, fontWeight: 700, letterSpacing: -3, lineHeight: 1.05, color: accent ?? INK }}>
          {title}
        </div>
        {lede ? (
          <div style={{ display: 'flex', fontSize: 27, color: INK2, lineHeight: 1.35, maxWidth: 940 }}>{lede}</div>
        ) : null}
      </div>
      <div style={{ display: 'flex', marginTop: 'auto', borderTop: `2px solid ${signalRule ? SIGNAL : RULE}` }}>
        {facts.map((f, i) => (
          <div key={f.label} style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '28px 0 0', paddingLeft: i ? 32 : 0, borderLeft: i ? `2px solid ${RULE}` : 'none' }}>
            <div style={{ display: 'flex', fontSize: 18, color: INK3, letterSpacing: 2 }}>{f.label}</div>
            <div style={{ display: 'flex', fontSize: 44, fontWeight: 600, marginTop: 8 }}>{f.value}</div>
            <div style={{ display: 'flex', fontSize: 20, color: INK3, marginTop: 4 }}>{f.note ?? ''}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
