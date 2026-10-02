function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

/*
 * A colour per agent, from the whole wheel.
 *
 * This chose from six fixed palettes, so on a page of ten agents several
 * collided and the image could not do the one job it exists for — telling
 * two unnamed agents apart in a list. The component's own fallback already
 * used a full hue circle; only the served image did not.
 *
 * oklch rather than hsl, and resolved to hex here rather than emitted as a
 * CSS colour: a fixed lightness in oklch is a fixed *perceived* lightness,
 * so every hue comes out equally light and the ink keeps its contrast all
 * the way round — and hex renders in any SVG consumer, including ones that
 * would silently drop an unsupported colour function and leave blank shapes.
 */
function oklchToHex(lightness: number, chroma: number, hueDegrees: number) {
  const hue = (hueDegrees * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const channels = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];

  return channels
    .map((channel) => {
      const encoded =
        channel <= 0.0031308
          ? 12.92 * channel
          : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
      const byte = Math.round(Math.min(1, Math.max(0, encoded)) * 255);
      return byte.toString(16).padStart(2, '0');
    })
    .join('')
    .toUpperCase();
}

export async function GET(_request: Request, context: { params: Promise<{ seed: string }> }) {
  const { seed: rawSeed } = await context.params;
  const seed = rawSeed.slice(0, 80).replace(/[^a-zA-Z0-9_-]/g, '') || 'pokter-agent';
  const hash = hashSeed(seed);
  /*
   * Fixed lightness and chroma, so only the hue distinguishes one agent from
   * another and every tile stays equally legible.
   *
   * The hue is spread by the golden ratio rather than taken modulo 360.
   * Modulo put five of twelve real agent names into one sextant and gave
   * "Health Factor Monitor" and "Brain on BNB" the same hue exactly; this
   * leaves no exact collisions across the same set. Hashing onto a circle
   * still puts some neighbours close together, which is why the face varies
   * independently below — colour alone cannot carry this.
   */
  const hue = Math.floor(((hash * 0.618033988749895) % 1) * 360);
  const accent = oklchToHex(0.74, 0.15, hue);
  const pale = oklchToHex(0.94, 0.045, hue);
  const ink = oklchToHex(0.3, 0.08, hue);
  const leftEye = 34 + (hash % 9);
  const rightEye = 78 - ((hash >>> 3) % 9);
  const tilt = (hash % 23) - 11;
  /* Unsigned shifts throughout: `>>` is signed, so any hash above 2^31 went
     negative and indexed a mouth that does not exist. */
  const eyeRadius = 3 + ((hash >>> 5) % 3);
  const SMILES = [
    'M43 70c8 7 18 7 26 0',
    'M44 71c7-5 17-5 24 0',
    'M43 70h26',
    'M43 69c6 9 20 9 26 0',
  ] as const;
  const smile = SMILES[(hash >>> 7) % SMILES.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 112"><rect width="112" height="112" rx="28" fill="#${pale}"/><circle cx="${20 + (hash % 18)}" cy="${19 + (hash % 12)}" r="25" fill="#${accent}" opacity=".28"/><circle cx="${90 - (hash % 12)}" cy="${92 - (hash % 17)}" r="34" fill="#${accent}" opacity=".2"/><g transform="rotate(${tilt} 56 58)"><rect x="25" y="24" width="62" height="68" rx="25" fill="#${accent}"/><rect x="31" y="30" width="50" height="54" rx="21" fill="#${pale}"/><circle cx="${leftEye}" cy="54" r="${eyeRadius}" fill="#${ink}"/><circle cx="${rightEye}" cy="54" r="${eyeRadius}" fill="#${ink}"/><path d="${smile}" fill="none" stroke="#${ink}" stroke-width="4" stroke-linecap="round"/></g><path d="M17 22 26 7l8 17" fill="#${accent}"/></svg>`;
  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}
