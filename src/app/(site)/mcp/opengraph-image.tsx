import { ImageResponse } from 'next/og';

import { Mark, PAPER, SIGNAL, contentType, size } from '@/lib/og/card';

export const alt = 'Be the customer from your AI assistant: Pokter is an MCP server that finds BNB Chain agents, gets a signed price and hands you the hire link';
export { contentType, size };

const NIGHT = '#141517';
const PANEL = '#1c1d21';
const DIM = '#8d8c85';
const LINE = '#2c2d31';
const OK = '#5fbf7a';

/**
 * The MCP card, for posts announcing Pokter as an MCP server.
 *
 * Dark like the builder card, since it is an invitation. The session on
 * the right is a real one in shape and substance: the tool names are the
 * server's, and the answers are Touchstone's (Pokter's own token checker,
 * named as such on its page) as quoted on mainnet on 15 October: 0.05 $U,
 * signed by its registered wallet. Nothing on the card claims a hire was
 * made, because the server never makes one.
 */
export default function McpCard() {
  const session: Array<{ kind: 'ask' | 'call' | 'ok'; text: string }> = [
    { kind: 'ask', text: 'Find a token-safety agent I can hire now' },
    { kind: 'call', text: 'search_agents' },
    { kind: 'ok', text: 'Touchstone · answers checks · 0.05 $U' },
    { kind: 'call', text: 'get_quote' },
    { kind: 'ok', text: 'Signed by its wallet 0x0710…19e7' },
    { kind: 'call', text: 'hire_link' },
    { kind: 'ok', text: 'pokter.xyz/hire/56/374115?task=…' },
  ];
  const facts = [
    { label: 'ADD', value: 'pokter.xyz/api/mcp', note: 'Claude, Cursor, any MCP client' },
    { label: 'TOOLS', value: '5, all read-only', note: 'Search, evidence, price, link' },
    { label: 'MONEY', value: 'Only you sign', note: 'Hires are funded in your wallet' },
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
          <div style={{ display: 'flex', fontSize: 22, color: DIM }}>MCP server · BNB Chain</div>
        </div>

        <div style={{ display: 'flex', marginTop: 34, gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: 470 }}>
            <div style={{ display: 'flex', fontSize: 62, fontWeight: 700, letterSpacing: -2.5, lineHeight: 1.04 }}>Be the customer</div>
            <div style={{ display: 'flex', fontSize: 62, fontWeight: 700, letterSpacing: -2.5, lineHeight: 1.04 }}>from your</div>
            <div style={{ display: 'flex', fontSize: 62, fontWeight: 700, letterSpacing: -2.5, lineHeight: 1.04, color: SIGNAL }}>AI assistant.</div>
            <div style={{ display: 'flex', fontSize: 23, color: DIM, marginTop: 18, lineHeight: 1.35 }}>
              It finds agents, reads their evidence, gets a signed price and hands you the hire link.
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
