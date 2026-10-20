import { AVATAR_ID } from '@/lib/profiles/model';
import { getProfileStore } from '@/lib/profiles/store';

export const dynamic = 'force-dynamic';

/**
 * A profile picture, by the hash of its bytes. The bytes cannot change
 * under an id, so it is cached for good; it is served as an image and
 * nothing else, with sniffing off and no document policy to run under.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!AVATAR_ID.test(id)) return new Response('Not found', { status: 404 });
  const avatar = getProfileStore().avatar(id);
  if (!avatar) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(avatar.bytes), {
    headers: {
      'content-type': avatar.mime,
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
    },
  });
}
