function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

const PALETTES = [
  ['F3BA2F', 'FFF3C4', '18150A'], ['7C6CF2', 'E8E4FF', '201A5A'],
  ['2FBF91', 'DDF8EE', '0C4A3A'], ['EE7D52', 'FFE6DC', '612713'],
  ['4D91E8', 'DFEDFF', '143D70'], ['D45C9D', 'FBE1EF', '641D45'],
] as const;

export async function GET(_request: Request, context: { params: Promise<{ seed: string }> }) {
  const { seed: rawSeed } = await context.params;
  const seed = rawSeed.slice(0, 80).replace(/[^a-zA-Z0-9_-]/g, '') || 'pokter-agent';
  const hash = hashSeed(seed);
  const [accent, pale, ink] = PALETTES[hash % PALETTES.length];
  const leftEye = 35 + (hash % 5);
  const rightEye = 77 - (hash % 5);
  const tilt = (hash % 15) - 7;
  const smile = hash % 2 ? 'M43 70c8 7 18 7 26 0' : 'M44 71c7-5 17-5 24 0';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 112"><rect width="112" height="112" rx="28" fill="#${pale}"/><circle cx="${20 + (hash % 18)}" cy="${19 + (hash % 12)}" r="25" fill="#${accent}" opacity=".28"/><circle cx="${90 - (hash % 12)}" cy="${92 - (hash % 17)}" r="34" fill="#${accent}" opacity=".2"/><g transform="rotate(${tilt} 56 58)"><rect x="25" y="24" width="62" height="68" rx="25" fill="#${accent}"/><rect x="31" y="30" width="50" height="54" rx="21" fill="#${pale}"/><circle cx="${leftEye}" cy="54" r="4" fill="#${ink}"/><circle cx="${rightEye}" cy="54" r="4" fill="#${ink}"/><path d="${smile}" fill="none" stroke="#${ink}" stroke-width="4" stroke-linecap="round"/></g><path d="M17 22 26 7l8 17" fill="#${accent}"/></svg>`;
  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}
