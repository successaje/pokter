import { ImageResponse } from 'next/og';

import { CAMPAIGN_ENDS_AT, isCampaignLive } from '@/lib/campaign/window';

export const alt =
  'How to complete Set and Earn — register, fund, hire three agents, list one of your own';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/*
 * Its own card rather than the campaign page's.
 *
 * A nested segment inherits the parent's opengraph-image, so this page was
 * sharing with artwork that advertises the campaign. That is the right
 * picture for the campaign page and the wrong one here: somebody is being
 * offered instructions, and the preview should show that it is a set of
 * steps, not another banner.
 *
 * Brand values are written out because this renders in a runtime with no
 * CSS, where a custom property resolves to nothing and the card comes out
 * black on black. Same trade the campaign card makes.
 */
const GOLD = '#F3BA2F';
const INK = '#171306';
const PAPER = '#fffefa';
const MUTED = '#b7b1a0';

/*
 * Satori refuses a div with more than one child and no explicit display,
 * and JSX counts `{n} · {text}` as two children — so every mixed line here
 * is one template string. Getting it wrong fails the whole image.
 */
const STEPS = [
  'Register your wallet first',
  'Get both testnet tokens',
  'Hire 3 agents, 2 marketplaces',
  'Build and list 1 of your own',
];

export default function Image() {
  const closes = `Closes ${CAMPAIGN_ENDS_AT.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })} · 12:00 UTC`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(120deg, #11100c 0%, #211b0b 100%)',
          color: PAPER,
          padding: 64,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 16, height: 16, background: GOLD, transform: 'rotate(45deg)' }} />
            <div style={{ fontSize: 21, letterSpacing: 3, color: GOLD, textTransform: 'uppercase' }}>
              Set and Earn · BNB Chain
            </div>
            {isCampaignLive() && (
              <div
                style={{
                  display: 'flex',
                  background: GOLD,
                  color: INK,
                  fontSize: 17,
                  fontWeight: 700,
                  letterSpacing: 2,
                  padding: '4px 12px',
                  borderRadius: 999,
                }}
              >
                LIVE
              </div>
            )}
          </div>

          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.04, maxWidth: 1000 }}>
            How to complete Set and Earn
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 13, marginTop: 4 }}>
            {STEPS.map((step, index) => (
              <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 34,
                    height: 34,
                    borderRadius: 999,
                    border: `2px solid ${GOLD}`,
                    color: GOLD,
                    fontSize: 19,
                    fontWeight: 700,
                  }}
                >
                  {String(index + 1)}
                </div>
                <div style={{ fontSize: 29, color: PAPER }}>{step}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 24, color: MUTED }}>pokter.xyz/set-and-earn/guide</div>
          <div style={{ fontSize: 24, color: GOLD }}>{closes}</div>
        </div>
      </div>
    ),
    size,
  );
}
