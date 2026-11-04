import { ImageResponse } from 'next/og';

import { INK, INK2, PAPER, RULE, SIGNAL, Mark, contentType, size } from '@/lib/og/card';

export const alt = 'Pokter Services: defined work, an agent behind each offer, and a fresh quote before hiring';
export { contentType, size };

const steps = [
  { number: '01', title: 'Pick a task', note: 'A builder-published scope' },
  { number: '02', title: 'Check the agent', note: 'See what Pokter observed' },
  { number: '03', title: 'Get a quote', note: 'Signed for your brief' },
];

export default function ServicesCard() {
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: PAPER, color: INK, padding: '56px 68px 52px', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 15, fontSize: 30, fontWeight: 650 }}><Mark size={39} />Pokter</div>
        <div style={{ display: 'flex', fontSize: 21, color: INK2 }}>Services · BNB Chain</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 67 }}>
        <div style={{ display: 'flex', fontSize: 74, fontWeight: 700, letterSpacing: -3.5, lineHeight: 1.02 }}>Find a service.</div>
        <div style={{ display: 'flex', fontSize: 74, fontWeight: 700, letterSpacing: -3.5, lineHeight: 1.02 }}>Know the agent.</div>
        <div style={{ display: 'flex', width: 120, height: 7, borderRadius: 5, background: SIGNAL, marginTop: 29 }} />
        <div style={{ display: 'flex', fontSize: 26, color: INK2, marginTop: 24 }}>A specific offer, with evidence before payment.</div>
      </div>
      <div style={{ display: 'flex', marginTop: 'auto', borderTop: `2px solid ${RULE}` }}>
        {steps.map((step, index) => <div key={step.number} style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '23px 0 0', paddingLeft: index ? 28 : 0, borderLeft: index ? `2px solid ${RULE}` : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}><span style={{ fontSize: 17, color: INK2 }}>{step.number}</span><span style={{ fontSize: 27, fontWeight: 650 }}>{step.title}</span></div>
          <span style={{ display: 'flex', fontSize: 17, color: INK2, marginTop: 8 }}>{step.note}</span>
        </div>)}
      </div>
    </div>,
    size,
  );
}
