import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';

import { getProfileStore } from '@/lib/profiles/store';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 512 * 1024;

/** The type, from the file's own first bytes rather than its name or the header it was sent with. */
function sniff(bytes: Uint8Array): string | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length > 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/**
 * Upload a profile picture.
 *
 * Raster images only — PNG, JPEG or WebP, recognised by their bytes — so
 * nothing uploaded here can carry script the way an SVG can. The picture
 * is stored under the hash of its bytes and attached to a profile only
 * when the wallet signs a profile naming that hash; an upload by itself
 * changes nobody's profile.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`profile-avatar:${requestClientKey(request)}`, { limit: 6, windowMs: 10 * 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many uploads just now. Try again shortly.' }, { status: 429 });

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BYTES) return NextResponse.json({ error: 'Pictures can be up to 512 KB.' }, { status: 413 });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0) return NextResponse.json({ error: 'No picture was sent.' }, { status: 400 });
  if (bytes.length > MAX_BYTES) return NextResponse.json({ error: 'Pictures can be up to 512 KB.' }, { status: 413 });
  const mime = sniff(bytes);
  if (!mime) return NextResponse.json({ error: 'Use a PNG, JPEG or WebP picture.' }, { status: 415 });

  const id = createHash('sha256').update(bytes).digest('hex');
  getProfileStore().putAvatar(id, mime, bytes);
  return NextResponse.json({ id }, { status: 201 });
}
