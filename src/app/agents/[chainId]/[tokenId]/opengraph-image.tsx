import { ImageResponse } from 'next/og';

import { loadDossier } from '@/lib/marketplace';
import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { VERDICT_LABEL } from '@/lib/proof/engine';
import type { ChainId } from '@/lib/scan/types';

export const alt = 'Agent evidence on Pokter';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/*
 * The brand tokens, written out rather than imported.
 *
 * This renders in a separate runtime with no stylesheet, so a CSS variable
 * resolves to nothing and the card comes out black on black. These are the
 * same values globals.css defines; if they drift, the preview drifts, which is
 * the trade for the card existing at all.
 */
const INK = '#1d1d1b';
const CREAM = '#f5f2e9';
const MUTED = '#6b6759';
const BRAND = '#f3ba2f';

const VERDICT_TONE: Record<string, { bg: string; fg: string }> = {
  proven: { bg: '#dff3e4', fg: '#1f6b3a' },
  reliable: { bg: '#eef7f0', fg: '#1f6b3a' },
  emerging: { bg: '#fff4cf', fg: '#8a5e08' },
  observed: { bg: '#e6eefb', fg: '#28497f' },
  failing: { bg: '#fbe4e0', fg: '#8f2f1d' },
  unproven: { bg: '#eae7dd', fg: '#575343' },
};

/**
 * The card an agent link unfurls into.
 *
 * It leads with the verdict and the measurement rather than the agent's own
 * description, because the description is the operator's claim and the point
 * of this product is that a claim is not evidence. A link pasted into a chat
 * should carry the same distinction the page does.
 */
export default async function AgentPreview({
  params,
}: {
  // A promise in this runtime too, exactly as on the page. Typing it as a
  // plain object silently yields undefined, which fails the chain check and
  // renders the fallback for every agent — a card that looks deliberate.
  params: Promise<{ chainId: string; tokenId: string }>;
}) {
  const { chainId: rawChainId, tokenId } = await params;
  const chainId = Number(rawChainId) as ChainId;
  const result =
    chainId === 56 || chainId === 97
      ? await loadDossier(chainId, tokenId)
      : { state: 'missing' as const };

  /*
   * A registry that will not answer must not take the preview down with it —
   * an unfurl that 500s shows the sharer a broken link.
   */
  if (result.state !== 'ok') {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: CREAM,
            color: INK,
            fontSize: 56,
            fontWeight: 600,
          }}
        >
          Pokter
        </div>
      ),
      size,
    );
  }

  const { agent, attestations, category, proof, record } = result.dossier;
  const meta = category === 'unclassified' ? null : CATEGORY_BY_ID.get(category);
  const tone = VERDICT_TONE[proof.verdict] ?? VERDICT_TONE.unproven;

  const uptime =
    record.totalProbes === 0
      ? null
      : `${((record.totalAnswered / record.totalProbes) * 100).toFixed(1)}%`;

  const facts: { label: string; value: string }[] = [
    { label: 'Availability', value: uptime ?? 'Not measured' },
    { label: 'Probes', value: String(record.totalProbes) },
    /*
     * Attestations, not measurers.
     *
     * This read `proof.measurers.length`, which counts INDEPENDENT measurers
     * and deliberately excludes Pokter — so it is zero for every agent on
     * this chain, by design, and the card told an operator with five
     * published attestations that they had none. A shared card that
     * undercounts the thing it is showing off is worse than no card.
     *
     * The independence story is real and belongs on /census and the agent
     * page, where there is room to say why the top tier is empty. A preview
     * has room for one number, and it should be the one its label names.
     */
    {
      label: 'Attestations',
      value: String(attestations.length),
    },
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: CREAM,
          color: INK,
          padding: 64,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 14, height: 14, background: BRAND, transform: 'rotate(45deg)' }} />
            {/*
              One expression, not an expression beside a string. Satori rejects
              any div with more than one child and no explicit display, and JSX
              counts `{expr} · BNB Chain` as two — which fails the whole image
              rather than that line.
            */}
            <div style={{ fontSize: 22, letterSpacing: 2, color: MUTED, textTransform: 'uppercase' }}>
              {`${meta?.label ?? 'Agent'} · BNB Chain`}
            </div>
          </div>

          <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.1, maxWidth: 1000 }}>
            {agent.name.length > 64 ? `${agent.name.slice(0, 61)}…` : agent.name}
          </div>

          <div
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              background: tone.bg,
              color: tone.fg,
              borderRadius: 999,
              padding: '10px 24px',
              fontSize: 28,
              fontWeight: 600,
            }}
          >
            {VERDICT_LABEL[proof.verdict]}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 64 }}>
          {facts.map((fact) => (
            <div key={fact.label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 20, color: MUTED, textTransform: 'uppercase', letterSpacing: 1.5 }}>
                {fact.label}
              </div>
              <div style={{ fontSize: 44, fontWeight: 700 }}>{fact.value}</div>
            </div>
          ))}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 'auto', alignItems: 'flex-end' }}>
            <div style={{ fontSize: 20, color: MUTED, letterSpacing: 1.5 }}>MEASURED BY</div>
            <div style={{ fontSize: 44, fontWeight: 700 }}>Pokter</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
