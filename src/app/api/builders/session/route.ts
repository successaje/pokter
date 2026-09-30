import { NextRequest, NextResponse } from 'next/server';

import { BUILDER_SESSION_COOKIE, builderSessionOwner, revokeBuilderSession } from '@/lib/builders/store';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const owner = builderSessionOwner(
    request.cookies.get(BUILDER_SESSION_COOKIE)?.value,
  );

  return NextResponse.json(
    owner ? { authenticated: true, owner } : { authenticated: false },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  revokeBuilderSession(request.cookies.get(BUILDER_SESSION_COOKIE)?.value);
  const response = NextResponse.json({ signedOut: true });
  response.cookies.set(BUILDER_SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 });
  return response;
}
