import { timingSafeEqual } from 'node:crypto';

/**
 * Whether an Authorization header carries this secret as a bearer token.
 *
 * Compared in constant time, so how long a wrong token takes to refuse says
 * nothing about how much of it was right. Only the length can differ in
 * timing, and the length of a secret is not the secret.
 */
export function bearerTokenMatches(authorization: string | null, secret: string): boolean {
  if (!secret) return false;
  const supplied = Buffer.from(authorization ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
