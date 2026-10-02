import { ImageResponse } from 'next/og';

import { CAMPAIGN_ENDS_AT, isCampaignLive } from '@/lib/campaign/window';

export const alt = 'Set and Earn on Pokter — hire and build AI agents on BNB Chain';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/*
 * Brand values written out, not imported from the stylesheet.
 *
 * This renders in a separate runtime with no CSS, so a custom property
 * resolves to nothing and the card comes out black on black. Same trade the
 * agent card makes: if these drift from globals.css the preview drifts, and
 * that is the price of the preview existing at all.
 *
 * The dark gold is the campaign header's own palette rather than the cream
 * used elsewhere, so somebody who clicks through lands on the thing they
 * just saw.
 */
const GOLD = '#F3BA2F';
const INK = '#171306';
const PAPER = '#fffefa';

/*
 * Satori rejects any div holding more than one child without an explicit
 * display, and JSX counts `{value} · text` as two children. Every mixed line
 * below is a single template string for that reason — getting it wrong fails
 * the whole image rather than one row.
 */
export default function Image() {
  const closes = `${CAMPAIGN_ENDS_AT.toLocaleDateString('en-GB', {
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 16, height: 16, background: GOLD, transform: 'rotate(45deg)' }} />
            <div style={{ fontSize: 22, letterSpacing: 3, color: GOLD, textTransform: 'uppercase' }}>
              Set and Earn · BNB Chain
            </div>
            {isCampaignLive() && (
              <div
                style={{
                  display: 'flex',
                  background: GOLD,
                  color: INK,
                  fontSize: 18,
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

          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.05, maxWidth: 980 }}>
            Hire and build AI agents on BNB Chain.
          </div>

          {/*
            The credential, stated the way the site states it: the count and
            the pool it came from, and nothing implying more than being on a
            list. The other eight are not named here either.
          */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              border: `1px solid ${GOLD}66`,
              background: `${GOLD}1a`,
              borderRadius: 12,
              padding: '14px 18px',
              fontSize: 26,
              maxWidth: 940,
            }}
          >
            <div style={{ display: 'flex', color: GOLD, fontWeight: 700 }}>
              Shortlisted by BNB Chain
            </div>
            <div style={{ display: 'flex', color: '#e8e4d8' }}>
              {'one of 9 marketplaces from 260+ entries'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 24, color: '#cdc7b5' }}>
              {`Track what Pokter can verify · closes ${closes}`}
            </div>
            <div style={{ fontSize: 24, color: '#9a9589' }}>
              {'First 100 qualifying wallets · $10,000 total retail value in merch'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 34, fontWeight: 700, color: PAPER }}>pokter.xyz</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
