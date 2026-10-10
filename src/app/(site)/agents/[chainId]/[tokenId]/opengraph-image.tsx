import { ImageResponse } from 'next/og';

import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { loadDossier } from '@/lib/marketplace';
import { VERDICT_LABEL } from '@/lib/proof/engine';
import type { ChainId } from '@/lib/scan/types';

export const alt = 'What Pokter has measured about this agent';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const PAPER = '#f3f1eb';
const INK = '#16171a';
const INK2 = '#48494d';
const INK3 = '#66665f';
const RULE = '#dcd8cd';
const SIGNAL = '#f0b90b';

const TONE: Record<string, string> = {
  proven: '#1d7446',
  reliable: '#1d7446',
  emerging: '#8d5c00',
  observed: '#2c5a88',
  failing: '#ad3427',
  unproven: '#6e6d66',
};

function MarkSvg({ size: s }: { size: number }) {
  return (
    <svg width={s} height={s} viewBox="150 52 682 712">
      <path fill={INK} d="M192 62H513Q545 62 545 94V168Q545 200 513 200H344Q332 200 332 212V752H192Q160 752 160 720V94Q160 62 192 62Z" />
      <path fill={INK} d="M592 62H716Q820 62 820 166V546Q820 648 716 648H457Q425 648 425 616V562Q425 530 457 530H640Q652 530 652 518V258Q652 246 640 246H592Z" />
      <rect x="400" y="290" width="183" height="182" rx="36" fill={SIGNAL} />
    </svg>
  );
}

/**
 * The shared-link card for an agent: its name, the evidence state and three
 * measured figures. Every value is read from the same dossier as the page;
 * absent measurements are printed as absent.
 */
export default async function AgentImage({ params }: { params: Promise<{ chainId: string; tokenId: string }> }) {
  const { chainId: raw, tokenId } = await params;
  const chainId = Number(raw) as ChainId;
  const result = chainId === 56 || chainId === 97 ? await loadDossier(chainId, tokenId).catch(() => ({ state: 'unreachable' as const })) : { state: 'missing' as const };

  if (result.state !== 'ok') {
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, background: PAPER, color: INK, fontSize: 56, fontWeight: 600 }}>
          <MarkSvg size={72} />
          Pokter
        </div>
      ),
      size,
    );
  }

  const { agent, attestations, category, proof, record } = result.dossier;
  const meta = category === 'unclassified' ? null : CATEGORY_BY_ID.get(category);
  const rate = record.totalProbes ? `${Math.round((record.totalAnswered / record.totalProbes) * 100)}%` : 'Not measured';
  const name = agent.name.length > 42 ? `${agent.name.slice(0, 40)}…` : agent.name;
  const facts = [
    { label: 'ANSWERED PROBES', value: rate, note: record.totalProbes ? `of ${record.totalProbes}` : '' },
    { label: 'ATTESTATIONS', value: String(attestations.length), note: 'published on chain' },
    { label: 'SIGNED PRICE', value: result.dossier.quote ? `${Number(result.dossier.quote.priceU)} $U` : 'None', note: result.dossier.quote ? 'signed by its wallet' : 'not signed' },
  ];

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: PAPER, color: INK, padding: '64px 72px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 30, fontWeight: 600 }}>
            <MarkSvg size={40} />
            Pokter
          </div>
          <div style={{ display: 'flex', fontSize: 22, color: INK3 }}>
            ERC-8004 #{agent.token_id} · {chainId === 97 ? 'BNB Testnet' : 'BNB Chain'}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 72, gap: 18 }}>
          <div style={{ display: 'flex', fontSize: 24, color: INK3, letterSpacing: 2 }}>{(meta?.label ?? 'Agent').toUpperCase()}</div>
          <div style={{ display: 'flex', fontSize: 76, fontWeight: 700, letterSpacing: -3, lineHeight: 1 }}>{name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 30, color: TONE[proof.verdict] ?? INK2, fontWeight: 600, marginTop: 8 }}>
            <div style={{ width: 16, height: 16, borderRadius: 8, background: TONE[proof.verdict] ?? INK2 }} />
            {VERDICT_LABEL[proof.verdict]}
          </div>
        </div>
        <div style={{ display: 'flex', marginTop: 'auto', borderTop: `2px solid ${RULE}` }}>
          {facts.map((f, i) => (
            <div key={f.label} style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '28px 0 0', paddingLeft: i ? 32 : 0, borderLeft: i ? `2px solid ${RULE}` : 'none' }}>
              <div style={{ display: 'flex', fontSize: 18, color: INK3, letterSpacing: 2 }}>{f.label}</div>
              <div style={{ display: 'flex', fontSize: 46, fontWeight: 600, marginTop: 8 }}>{f.value}</div>
              <div style={{ display: 'flex', fontSize: 20, color: INK3, marginTop: 4 }}>{f.note}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
