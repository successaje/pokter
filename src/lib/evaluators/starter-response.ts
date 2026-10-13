import { EVALUATOR_STARTER_FILENAME, EVALUATOR_STARTER_SOURCE } from './starter';

/** Pure response builder, kept outside the server-only rate-limit boundary for testing. */
export function evaluatorStarterResponse(): Response {
  return new Response(EVALUATOR_STARTER_SOURCE, {
    headers: {
      'cache-control': 'public, max-age=3600, stale-while-revalidate=86400',
      'content-disposition': `attachment; filename="${EVALUATOR_STARTER_FILENAME}"`,
      'content-type': 'text/javascript; charset=utf-8',
      'x-content-type-options': 'nosniff',
    },
  });
}
