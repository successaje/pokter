/**
 * Render the social banner, light and dark.
 *
 *   node scripts/brand-banner.mjs
 *
 * Committed as a script rather than exported once by hand, because the banner
 * carries product copy and a palette that both move. Regenerating is one
 * command; recreating it in a design tool a year from now is not.
 *
 * Layout targets X's crop. Everything that must survive sits in the middle
 * band — mobile trims top and bottom, and on desktop the avatar covers the
 * lower left — so the centre stays clear of the agent field and the type never
 * strays into either casualty zone.
 */
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const W = 1500;
const H = 500;
const CX = W / 2;
const FONT = "-apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";

/** Mirrors the tokens in globals.css so the banner cannot drift from the app. */
const THEMES = {
  dark: {
    bg: '#08090b',
    card: '#0f1114',
    cardBorder: '#1c2027',
    alive: '#3fb97f',
    aliveFill: '#11221a',
    text: '#edf0f4',
    muted: '#7b8593',
    dimFloor: 0.35,
  },
  light: {
    bg: '#fbfbfc',
    card: '#ffffff',
    // border-strong rather than border: on a near-white background the softer
    // token disappears, and a field of invisible cards tells no story.
    cardBorder: '#cbd1d9',
    alive: '#06774a',
    aliveFill: '#e7f7ef',
    text: '#0c1116',
    muted: '#616b7a',
    dimFloor: 0.55,
  },
};

/**
 * A field of dim agent cards with a scattered few alive.
 *
 * Alive ones are chosen from a hash rather than a fixed stride: every Nth
 * lines them into a column, and the eye then reads the grid instead of the
 * headline.
 */
function agentField(t) {
  const hash = (n) => Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1;
  const rows = [
    [104, 21, 44],
    [176, 21, 44],
    [312, 21, 44],
    [384, 21, 44],
  ];
  const [clearFrom, clearTo] = [520, 980];

  let out = '';
  let n = 0;

  for (const [baseY, count, w] of rows) {
    for (let i = 0; i < count; i += 1) {
      const x = 56 + i * ((W - 112) / (count - 1));
      if (x > clearFrom - w && x < clearTo) continue;

      n += 1;
      const alive = hash(n) > 0.86;
      const y = baseY + Math.round((hash(n + 500) - 0.5) * 10);
      const h = Math.round(w * 0.62);
      const fade = (t.dimFloor + hash(n + 900) * 0.45).toFixed(2);

      out += `<rect x="${x.toFixed(0)}" y="${y}" width="${w}" height="${h}" rx="3" `
        + `fill="${alive ? t.aliveFill : t.card}" stroke="${alive ? t.alive : t.cardBorder}" `
        + `stroke-width="1" opacity="${alive ? 1 : fade}"/>`;
      if (alive) {
        out += `<rect x="${x.toFixed(0)}" y="${y}" width="2" height="${h}" rx="1" fill="${t.alive}"/>`;
      }
    }
  }
  return out;
}

function banner(t) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${t.bg}"/>
${agentField(t)}
<text x="${CX}" y="242" text-anchor="middle" font-family="${FONT}" font-size="58" font-weight="600" fill="${t.text}" letter-spacing="-1.4">Choose what deserves your money.</text>
<text x="${CX}" y="288" text-anchor="middle" font-family="${FONT}" font-size="25" font-weight="400" fill="${t.muted}">The agent marketplace for BNB Chain</text>
</svg>`;
}

for (const [name, theme] of Object.entries(THEMES)) {
  const svg = `/tmp/pokter-banner-${name}.svg`;
  const png = `public/brand/pokter-social-banner-${name}.png`;
  writeFileSync(svg, banner(theme));
  execFileSync('rsvg-convert', ['-w', String(W), '-h', String(H), svg, '-o', png]);
  console.log('  wrote', png);
}
