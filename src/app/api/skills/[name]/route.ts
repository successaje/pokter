import { NextResponse } from 'next/server';

import { PROVIDER_SKILL_MD, PROVIDER_SKILL_NAME } from '@/lib/builders/provider-skill';
import { apiRateLimit } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/**
 * The skill file, fetchable.
 *
 * The onboarding prompt is one line, and a one-line prompt cannot carry ten
 * kilobytes of instructions — so it says "fetch this and save it", and this
 * is what it fetches. Served from the module the file on disk is generated
 * from, so what somebody downloads is what the repository holds.
 *
 * Public, and nothing in it is secret: it is instructions, and the
 * credential it tells somebody to use is one they mint themselves. CORS is
 * open for the same reason the public read API's is — an assistant fetching
 * it has no origin to allow-list — and `GET` is all there is.
 */
/*
 * Null-prototype, so a request can only name a skill this object was given.
 *
 * A plain object literal inherits `Object.prototype`, and the lookup below
 * was unguarded, so `/api/skills/constructor` answered 200 text/markdown
 * with "function Object() { [native code] }" and `/api/skills/__proto__`
 * with "[object Object]" — each served with `cache-control: public,
 * max-age=300`, so the junk was cacheable. Nothing was disclosed, but the
 * route's own contract says an unknown name is a 404 and it was not.
 *
 * `Object.create(null)` removes the inherited keys rather than testing for
 * them, so the guard cannot be forgotten at a second call site later.
 */
const SKILLS: Readonly<Record<string, string>> = Object.assign(Object.create(null) as Record<string, string>, {
  [PROVIDER_SKILL_NAME]: PROVIDER_SKILL_MD,
});

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }): Promise<Response> {
  const limited = apiRateLimit(_request, 'skills', 60);
  if (limited) return limited;
  const { name } = await params;
  const skill = SKILLS[name.replace(/\.md$/i, '')];
  if (!skill) {
    return NextResponse.json(
      { error: `No such skill. Pokter publishes: ${Object.keys(SKILLS).join(', ')}.` },
      { status: 404, headers: { 'access-control-allow-origin': '*' } },
    );
  }
  return new Response(skill, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'access-control-allow-origin': '*',
      /* Instructions change when the product does, so this is cached
         briefly rather than for a day: somebody installing it should get
         the current one, and a stale skill tells its reader to call tools
         that may have moved. */
      'cache-control': 'public, max-age=300, s-maxage=300',
    },
  });
}

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'content-type' },
  });
}
