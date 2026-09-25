import 'server-only';

import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

/** Protect legacy operator-funded testnet flows from becoming public signers. */
export function requireDemoWriteAccess(request: Request): NextResponse | null {
  const expected = process.env.POKTER_DEMO_WRITE_SECRET;
  const authorization = request.headers.get('authorization');
  const supplied = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';

  if (!expected || !supplied) {
    return NextResponse.json(
      { error: 'This operator-funded demo action is not publicly available.' },
      { status: 403 },
    );
  }

  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  const matches =
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes);

  return matches
    ? null
    : NextResponse.json(
        { error: 'This operator-funded demo action is not publicly available.' },
        { status: 403 },
      );
}
