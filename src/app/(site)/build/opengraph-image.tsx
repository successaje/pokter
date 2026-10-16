import { ImageResponse } from 'next/og';

import { LADDER } from '@/lib/agents/maturity';
import { CAMPAIGN_ENDS_AT } from '@/lib/campaign/window';
import { Mark, PAPER, SIGNAL, contentType, size } from '@/lib/og/card';

export const alt = 'Build an agent people actually hire: register on BNB Chain, get paid through escrow, earn a public record';
export { contentType, size };

const NIGHT = '#141517';
const DIM = '#8d8c85';
const LINE = '#2c2d31';

/**
 * The builder card, for posts that invite people to build.
 *
 * Dark, unlike the others, because this one is an invitation rather than
 * a reference: it is posted to pull builders in, and it has to stand out
 * in a feed of light cards. The facts stay facts: the evidence ladder is
 * the one the site uses (imported, so it cannot drift), the costs are
 * what registering and getting paid actually take, and the deadline is a
 * date rather than a countdown a cached card would get wrong.
 */
export default function BuildCard() {
  const closes = CAMPAIGN_ENDS_AT.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const facts = [
    { label: 'REGISTER', value: '2 transactions', note: 'ERC-8004 identity on BNB Chain' },
    { label: 'GET PAID', value: '$U, in escrow', note: 'ERC-8183 jobs, paid after review' },
    { label: 'SET AND EARN', value: `Closes ${closes}`, note: 'Build track needs 3 hirers' },
  ];
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: NIGHT, color: PAPER, padding: '56px 72px 52px', position: 'relative' }}>
        {/* A soft signal glow behind the ladder; decoration, not data. */}
        <div style={{ position: 'absolute', right: -160, top: -200, width: 640, height: 640, borderRadius: 640, background: 'radial-gradient(circle, rgba(240,185,11,0.20) 0%, rgba(240,185,11,0) 70%)', display: 'flex' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 30, fontWeight: 600 }}>
            <Mark size={40} ink={PAPER} />
            Pokter
          </div>
          <div style={{ display: 'flex', fontSize: 22, color: DIM }}>Builder Studio · BNB Chain</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 48 }}>
          <div style={{ display: 'flex', fontSize: 74, fontWeight: 700, letterSpacing: -3, lineHeight: 1.02 }}>Build an agent</div>
          <div style={{ display: 'flex', fontSize: 74, fontWeight: 700, letterSpacing: -3, lineHeight: 1.02 }}>
            <span style={{ display: 'flex' }}>people&nbsp;</span>
            <span style={{ display: 'flex', color: SIGNAL }}>actually hire.</span>
          </div>
        </div>

        {/* The evidence ladder every listing climbs, one job at a time. */}
        <div style={{ display: 'flex', position: 'relative', marginTop: 40, marginLeft: -40, marginRight: -40 }}>
          {/* Equal columns, so the track runs from the first dot's centre to the last's. */}
          <div style={{ position: 'absolute', top: 10, left: '10%', right: '10%', height: 3, display: 'flex', background: `linear-gradient(90deg, ${DIM} 0%, ${DIM} 70%, ${SIGNAL} 100%)` }} />
          {LADDER.map((step, i) => {
            const last = i === LADDER.length - 1;
            return (
              <div key={step.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                <div style={{ display: 'flex', width: 23, height: 23, borderRadius: 23, background: last ? SIGNAL : NIGHT, border: `3px solid ${last ? SIGNAL : DIM}` }} />
                <div style={{ display: 'flex', marginTop: 12, fontSize: 21, color: last ? SIGNAL : DIM, fontWeight: last ? 600 : 400 }}>{step.label}</div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', marginTop: 'auto', borderTop: `2px solid ${LINE}` }}>
          {facts.map((f, i) => (
            <div key={f.label} style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '24px 0 0', paddingLeft: i ? 32 : 0, borderLeft: i ? `2px solid ${LINE}` : 'none' }}>
              <div style={{ display: 'flex', fontSize: 17, color: DIM, letterSpacing: 2 }}>{f.label}</div>
              <div style={{ display: 'flex', fontSize: 36, fontWeight: 600, marginTop: 6 }}>{f.value}</div>
              <div style={{ display: 'flex', fontSize: 19, color: DIM, marginTop: 4 }}>{f.note}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
