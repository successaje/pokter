import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'pokter-rate-limit-'));
process.env.RATE_LIMIT_DB_PATH = join(temporaryDirectory, 'limits.db');
process.env.POKTER_TRUSTED_CLIENT_IP_HEADER = 'fly-client-ip';

try {
  const { consumeRateLimit, requestClientKey } = await import(
    '../src/lib/security/rate-limit'
  );

  const request = new Request('https://pokter.xyz/api/trial', {
    headers: {
      'fly-client-ip': '203.0.113.8',
      'x-forwarded-for': '198.51.100.1',
    },
  });
  if (requestClientKey(request) !== '203.0.113.8') {
    throw new Error('The configured trusted client IP header was not used');
  }

  const spoofOnly = new Request('https://pokter.xyz/api/trial', {
    headers: { 'x-forwarded-for': '198.51.100.1' },
  });
  if (requestClientKey(spoofOnly) !== 'unknown') {
    throw new Error('An untrusted forwarding header bypassed the shared bucket');
  }

  const outcomes = Array.from({ length: 5 }, () =>
    consumeRateLimit('same-caller', { limit: 3, windowMs: 60_000 }),
  );
  if (outcomes.filter((value) => value.allowed).length !== 3) {
    throw new Error('The limiter admitted more than the configured allowance');
  }
  if (outcomes.slice(3).some((value) => value.retryAfterSeconds < 1)) {
    throw new Error('Refused requests did not receive a retry delay');
  }

  console.log('Rate-limit safety checks passed.');
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
