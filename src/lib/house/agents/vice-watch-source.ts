/** Fixed, first-party sources. No URL supplied by a buyer or a page is fetched. */
export const VICE_SOURCES = {
  game: 'https://www.rockstargames.com/VI',
  preload: 'https://support.rockstargames.com/articles/7nPqOA2uCbpEQHXx7KVrYd/grand-theft-auto-vi-pre-load-faq',
  storage: 'https://support.rockstargames.com/articles/M6h7B5fJZMwG1dnzQkt4Z/grand-theft-auto-vi-installation-requirements',
} as const;

export interface ViceUpdate { title: string; url: string; publishedAt: string | null }
export interface ViceFact { value: string; url: string; publishedAt: string | null }
export interface ViceSnapshot {
  checkedAt: string;
  sourceState: 'live' | 'cached';
  release: ViceFact | null;
  platforms: ViceFact | null;
  preload: ViceFact | null;
  storage: ViceFact | null;
  updates: ViceUpdate[];
  limitations: string[];
}

function decode(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|rsquo|lsquo|rdquo|ldquo);/gi, (_, entity: string) => {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
    if (entity[0] === '#') {
      const n = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isSafeInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    }
    return named[entity.toLowerCase()] ?? '';
  });
}

const plain = (value: string) => decode(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 240);
const isoDate = (value: string): string | null => {
  const named = value.match(/^([A-Z][a-z]+)\s+(\d{1,2}),?\s+(20\d{2})$/i);
  if (named) {
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const month = months.indexOf(named[1].toLowerCase());
    const day = Number(named[2]);
    const year = Number(named[3]);
    if (month < 0 || day < 1 || day > 31) return null;
    const date = new Date(Date.UTC(year, month, day));
    return date.getUTCMonth() === month && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null;
  }
  return /^20\d{2}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : null;
};

/** Parse only visible SSR elements on the official game page, never script text. */
export function parseViceGamePage(html: string): Pick<ViceSnapshot, 'release' | 'platforms' | 'updates'> {
  if (!/<title[^>]*>[^<]*Grand Theft Auto VI/i.test(html)) throw new Error('The official game page did not identify GTA VI.');
  const releaseMatch = html.match(/<h5[^>]*>\s*Coming\s*<br\s*\/?\s*>\s*([^<]{5,45})<\/h5>/i);
  const releaseDate = releaseMatch ? isoDate(plain(releaseMatch[1])) : null;
  const release = releaseDate ? { value: `Scheduled for ${releaseDate}`, url: VICE_SOURCES.game, publishedAt: null } : null;
  const platformNames = ['PlayStation 5', 'Xbox Series X|S'].filter((name) => html.includes(`>${name}</span>`));
  const platforms = platformNames.length ? { value: platformNames.join(' and '), url: VICE_SOURCES.game, publishedAt: null } : null;
  const updates: ViceUpdate[] = [];
  const cards = /<a\b[^>]*href="(https:\/\/www\.rockstargames\.com\/newswire\/article\/[a-z0-9/\-]+)"[^>]*>([\s\S]{0,16000}?)<\/a>/gi;
  for (const match of html.matchAll(cards)) {
    if (updates.length >= 8) break;
    const title = match[2].match(/<h4[^>]*>([\s\S]{1,500}?)<\/h4>/i);
    const date = match[2].match(/<p[^>]*>([\s\S]{1,100}?)<\/p>/i);
    const name = title ? plain(title[1]) : '';
    if (!name || !/Grand Theft Auto VI|GTA VI/i.test(name)) continue;
    if (updates.some((entry) => entry.url === match[1])) continue;
    updates.push({ title: name, url: match[1], publishedAt: date ? isoDate(plain(date[1])) : null });
  }
  if (!updates.length && !release && !platforms) throw new Error('The official game page no longer exposes readable facts.');
  return { release, platforms, updates };
}

/** Support pages are optional. An unreadable page cannot become an asserted fact. */
export function parseViceSupport(html: string, kind: 'preload' | 'storage'): ViceFact | null {
  const text = plain(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ''));
  // `plain` deliberately bounds display text; support parsing needs the full, bounded document instead.
  const full = decode(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ');
  if (!/Grand Theft Auto VI/i.test(text) && !/Grand Theft Auto VI/i.test(full.slice(0, 3000))) return null;
  const updated = full.match(/Last Updated:\s*([A-Z][a-z]+\s+\d{1,2},\s*20\d{2})/i);
  const publishedAt = updated ? isoDate(updated[1]) : null;
  if (kind === 'storage') {
    const size = full.match(/(?:require|need)\s+up to\s+(\d{2,4})\s*GB\b/i);
    return size ? { value: `Up to ${size[1]} GB of available space, depending on device`, url: VICE_SOURCES.storage, publishedAt } : null;
  }
  const ps = full.match(/PlayStation 5[^.]{0,180}?pre-load begins[^.]{0,120}?on\s+([A-Z][a-z]+\s+\d{1,2},\s*20\d{2})/i)
    ?? full.match(/On PlayStation 5[^.]{0,180}?([A-Z][a-z]+\s+\d{1,2},\s*20\d{2})/i);
  const xbox = full.match(/XBOX Series X\|S[\s\S]{0,180}?pre-load begins[\s\S]{0,120}?on\s+([A-Z][a-z]+\s+\d{1,2},\s*20\d{2})/i)
    ?? full.match(/On XBOX Series X\|S[\s\S]{0,180}?([A-Z][a-z]+\s+\d{1,2},\s*20\d{2})/i);
  if (!ps || !xbox) return null;
  const psDate = isoDate(ps[1]);
  const xboxDate = isoDate(xbox[1]);
  if (!psDate || !xboxDate) return null;
  const psLocal = /PlayStation 5[^.]{0,160}?midnight local time/i.test(full);
  const xboxGmt = /XBOX Series X\|S[^.]{0,160}?12\s*a\.?m\.?\s*GMT/i.test(full);
  if (!psLocal || !xboxGmt) return null;
  return { value: `PlayStation 5: ${psDate} at midnight in the console account's local time zone. Xbox Series X|S: ${xboxDate} at 00:00 GMT worldwide.`, url: VICE_SOURCES.preload, publishedAt };
}

const MAX_BYTES = 2_000_000;
async function fetchOfficial(url: string, fetcher: typeof fetch): Promise<string> {
  const parsed = new URL(url);
  if (!['www.rockstargames.com', 'support.rockstargames.com'].includes(parsed.hostname) || parsed.protocol !== 'https:') throw new Error('Source host is not approved.');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(4_000), headers: { accept: 'text/html', 'user-agent': 'Pokter-ViceWatch/1.0 (+https://pokter.xyz)' } });
      if (response.status >= 300 && response.status < 400) throw new Error('Official source redirected; no redirect followed.');
      if (response.status === 429 || response.status >= 500) {
        if (attempt === 0) { await new Promise((resolve) => setTimeout(resolve, 300)); continue; }
      }
      if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error(`Official source returned HTTP ${response.status} or a non-HTML response.`);
      if (Number(response.headers.get('content-length') ?? 0) > MAX_BYTES) throw new Error('Official source exceeded the size limit.');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Official source returned no body.');
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Official source exceeded the size limit.'); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return new TextDecoder().decode(bytes);
    } catch (error) {
      if (attempt === 1 || /redirected|size limit|non-HTML/i.test((error as Error).message)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw new Error('Official source unavailable.');
}

let cached: { at: number; snapshot: ViceSnapshot } | null = null;

export async function readViceSources(options: { fetcher?: typeof fetch; now?: Date } = {}): Promise<ViceSnapshot> {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? new Date();
  if (!options.fetcher && cached && now.getTime() - cached.at < 15 * 60_000) return cached.snapshot;
  try {
    const gameHtml = await fetchOfficial(VICE_SOURCES.game, fetcher);
    const game = parseViceGamePage(gameHtml);
    const [preload, storage] = await Promise.allSettled([
      fetchOfficial(VICE_SOURCES.preload, fetcher).then((html) => parseViceSupport(html, 'preload')),
      fetchOfficial(VICE_SOURCES.storage, fetcher).then((html) => parseViceSupport(html, 'storage')),
    ]);
    let verifiedPreload = preload.status === 'fulfilled' ? preload.value : null;
    const preloadHeadline = game.updates.find((item) => /pre.?load begins on/i.test(item.title) && item.publishedAt);
    const headlineDate = preloadHeadline?.title.match(/pre.?load begins on\s+([A-Z][a-z]+\s+\d{1,2})/i);
    const expected = headlineDate && preloadHeadline?.publishedAt ? isoDate(`${headlineDate[1]}, ${preloadHeadline.publishedAt.slice(0, 4)}`) : null;
    const supportConflict = Boolean(expected && verifiedPreload && !verifiedPreload.value.includes(expected));
    if (supportConflict) verifiedPreload = null;
    const snapshot: ViceSnapshot = {
      checkedAt: now.toISOString(), sourceState: 'live', ...game,
      preload: verifiedPreload,
      storage: storage.status === 'fulfilled' ? storage.value : null,
      limitations: [
        'The Rockstar game page shows featured updates, not a complete Newswire archive.',
        ...(supportConflict ? ['The featured Rockstar announcement and Support FAQ show conflicting preload dates; no console-specific time is asserted.'] : verifiedPreload ? [] : ['Regional and console-specific preload time could not be checked from Rockstar Support.']),
        ...(storage.status === 'fulfilled' && storage.value ? [] : ['Installation space could not be checked from Rockstar Support.']),
      ],
    };
    if (!options.fetcher) cached = { at: now.getTime(), snapshot };
    return snapshot;
  } catch (error) {
    if (!options.fetcher && cached && now.getTime() - cached.at < 2 * 60 * 60_000) {
      return { ...cached.snapshot, sourceState: 'cached', limitations: [...cached.snapshot.limitations, 'The official game page could not be refreshed; this is a previously checked snapshot, not a current news check.'] };
    }
    throw new Error(`Rockstar's official game page could not be checked: ${(error as Error).message}`);
  }
}
