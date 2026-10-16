/**
 * What a public route may say about a failure.
 *
 * Most failures Pokter reports are worth reading: "the agent answered HTTP
 * 500", "the seller did not answer within 50 seconds". Routes passed the
 * thrown message through so a buyer or builder could act on it. But a
 * thrown message is whatever the throwing library wrote, and viem writes a
 * lot: the RPC URL (some carry an API key in the query), the request body,
 * the docs link and its version, one per line. The configuration error
 * named Pokter's secrets and the command that sets them.
 *
 * So the reason is kept and the internals go: the first line only (viem's
 * `shortMessage` when there is one), query strings removed from any URL,
 * secret-shaped names and shell commands replaced, and a length cap. The
 * full error is logged on the server, where it belongs.
 */
const MAX_LENGTH = 240;

const SECRET_NAME = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_(?:KEY|SECRET|TOKEN|PASSWORD|PRIVATE_KEY|MNEMONIC|PURPOSES)\b/g;
const COMMAND = /\b(?:fly|flyctl|export|vercel|heroku)\s+(?:secrets?\s+)?set\b[^.;]*/gi;
const URL_WITH_QUERY = /(https?:\/\/[^\s?#"'<>]+)[?#][^\s"'<>]*/g;
const PRIVATE_HOST = /\bhttps?:\/\/(?:0\.0\.0\.0|127\.0\.0\.1|localhost|\[::1?\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|[a-z0-9-]+\.internal|[a-z0-9-]+\.flycast)(?::\d+)?[^\s"'<>]*/gi;

export function publicErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  const raw =
    error && typeof error === 'object' && typeof (error as { shortMessage?: unknown }).shortMessage === 'string'
      ? (error as { shortMessage: string }).shortMessage
      : error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : '';
  const firstLine = raw.split('\n').map((line) => line.trim()).find(Boolean) ?? '';
  const cleaned = firstLine
    .replace(PRIVATE_HOST, '[internal address]')
    .replace(URL_WITH_QUERY, '$1')
    .replace(COMMAND, '[configuration command]')
    .replace(SECRET_NAME, '[configuration]')
    .trim();
  if (!cleaned) return fallback;
  return cleaned.length > MAX_LENGTH ? `${cleaned.slice(0, MAX_LENGTH - 1).trimEnd()}…` : cleaned;
}

/** Log the whole error under a label, and return what the caller may see. */
export function logAndPublic(label: string, error: unknown, fallback?: string): string {
  console.error(`[${label}]`, error);
  return publicErrorMessage(error, fallback);
}

/**
 * A failure that is the caller's to fix, said as is with a 400.
 *
 * Routes used to throw plain errors for both a malformed email and an
 * unconfigured mail provider, and answer both with 400 and the message, so
 * a server fault read as the caller's mistake and named the server's
 * configuration. Throwing this marks the first kind; anything else is the
 * server's and is answered as such.
 */
export class BadRequest extends Error {}
