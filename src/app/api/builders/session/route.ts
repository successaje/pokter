import { NextRequest, NextResponse } from 'next/server';

import { BUILDER_SESSION_COOKIE, revokeBuilderSession } from '@/lib/builders/store';

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  revokeBuilderSession(request.cookies.get(BUILDER_SESSION_COOKIE)?.value);
  const response = NextResponse.json({ signedOut: true });
  response.cookies.set(BUILDER_SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 });
  return response;
}
