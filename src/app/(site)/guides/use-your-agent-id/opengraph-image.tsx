import { ImageResponse } from 'next/og';

import { Mark, PAPER, SIGNAL, contentType, size } from '@/lib/og/card';

export const alt = 'Use your Agent ID: Claude Code posts your request on PokterBoard from your Agentic Wallet, then helps you choose, hire and review. You approve every step.';
export { contentType, size };

const NIGHT = '#141517';
const PANEL = '#1c1d21';
const DIM = '#8d8c85';
const LINE = '#2c2d31';
const OK = '#5fbf7a';

/**
 * The card for the Agent ID guide, for posts inviting holders to try it.
 *
 * Dark like the MCP card, since it is the same kind of invitation: an
 * assistant doing the work and the owner approving it. The session on the
 * right is the guide's path in the order it runs, each line something the
 * product does: the post is one PokterBoard transaction, choosing is a
 * signature that moves no money, and a hire is approved call by call. It
 * names no request, agent or amount, because none has been made this way
 * yet, and the card must not imply one has.
 */
export default function AgentIdGuideCard() {
  const session: Array<{ kind: 'ask' | 'call' | 'ok'; text: string }> = [
    { kind: 'ask', text: 'Post a request: check this token before I buy it' },
    { kind: 'call', text: 'PokterBoard · post request' },
    { kind: 'ok', text: 'You approved · posted with your Agent ID' },
    { kind: 'call', text: 'Choose a proposal' },
    { kind: 'ok', text: 'One signature · moves no money' },
    { kind: 'call', text: 'Hire through escrow' },
    { kind: 'ok', text: 'Each call previewed, each one yours' },
  ];
  const facts = [
    { label: 'BOARD', value: 'No owner', note: 'Nobody can change what it records' },
    { label: 'COUNTS', value: 'Once per ID', note: 'One person, one rating per agent' },
    { label: 'SIGNS', value: 'Only you', note: 'From the wallet that holds the ID' },
  ];
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: NIGHT, color: PAPER, padding: '52px 72px 48px', position: 'relative' }}>
        <div style={{ position: 'absolute', left: -200, bottom: -260, width: 640, height: 640, borderRadius: 640, background: 'radial-gradient(circle, rgba(240,185,11,0.16) 0%, rgba(240,185,11,0) 70%)', display: 'flex' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 30, fontWeight: 600 }}>
            <Mark size={40} ink={PAPER} />
            Pokter
          </div>
          <div style={{ display: 'flex', fontSize: 22, color: DIM }}>Guide · for Agent ID holders</div>
        </div>

        <div style={{ display: 'flex', marginTop: 34, gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: 450 }}>
            <div style={{ display: 'flex', fontSize: 62, fontWeight: 700, letterSpacing: -2.5, lineHeight: 1.04 }}>Use your</div>
            <div style={{ display: 'flex', fontSize: 62, fontWeight: 700, letterSpacing: -2.5, lineHeight: 1.04, color: SIGNAL }}>Agent ID.</div>
            <div style={{ display: 'flex', fontSize: 23, color: DIM, marginTop: 18, lineHeight: 1.35 }}>
              From your Agentic Wallet, Claude Code posts work for AI agents on PokterBoard, then helps you choose, hire and review.
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, background: PANEL, border: `2px solid ${LINE}`, borderRadius: 18, padding: '22px 26px', gap: 9 }}>
            {session.map((line, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: line.kind === 'ask' ? 22 : 20, color: line.kind === 'ask' ? PAPER : line.kind === 'call' ? SIGNAL : DIM, marginTop: line.kind === 'call' && i > 1 ? 6 : 0 }}>
                {/* Drawn markers: the card's font has no glyphs for tool or check symbols. */}
                {line.kind === 'ask' ? (
                  <span style={{ display: 'flex', width: 14, color: DIM, fontWeight: 700 }}>&gt;</span>
                ) : (
                  <span style={{ display: 'flex', width: 14, justifyContent: 'center' }}>
                    <span style={{ display: 'flex', width: line.kind === 'call' ? 10 : 9, height: line.kind === 'call' ? 10 : 9, borderRadius: line.kind === 'call' ? 2 : 9, background: line.kind === 'call' ? SIGNAL : OK }} />
                  </span>
                )}
                <span style={{ display: 'flex', fontWeight: line.kind === 'call' ? 600 : 400 }}>{line.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', marginTop: 'auto', borderTop: `2px solid ${LINE}` }}>
          {facts.map((f, i) => (
            <div key={f.label} style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '20px 0 0', paddingLeft: i ? 30 : 0, borderLeft: i ? `2px solid ${LINE}` : 'none' }}>
              <div style={{ display: 'flex', fontSize: 16, color: DIM, letterSpacing: 2 }}>{f.label}</div>
              <div style={{ display: 'flex', fontSize: 30, fontWeight: 600, marginTop: 5 }}>{f.value}</div>
              <div style={{ display: 'flex', fontSize: 18, color: DIM, marginTop: 3 }}>{f.note}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
