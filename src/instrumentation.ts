import type { Instrumentation } from 'next';

/**
 * Warm the registry cache when the server boots.
 *
 * The first request to a cold server pays for every discovery query at once,
 * and semantic search alone costs 3-9s per call — a measured 95 seconds on the
 * first production request. Nobody evaluating this product should meet that,
 * and the fix belongs at startup rather than in a request handler.
 *
 * Deliberately fire-and-forget: a warmup that can delay or fail a boot is worse
 * than a cold cache, so nothing here is awaited and every error is swallowed
 * after being logged.
 */
export async function register(): Promise<void> {
  // Only the Node server runtime has the fetch cache this is warming.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  /*
   * The server signs and indexes on ALTANA_NETWORK; the pages label the
   * network from NEXT_PUBLIC_ALTANA_NETWORK, baked in at build. Set one and
   * not the other and the site describes one chain while acting on the
   * other, with nothing failing. Said loudly at boot rather than found later.
   */
  if ((process.env.ALTANA_NETWORK === 'bnb') !== (process.env.NEXT_PUBLIC_ALTANA_NETWORK === 'bnb')) {
    console.error(
      `[config] ALTANA_NETWORK=${process.env.ALTANA_NETWORK ?? '(unset)'} but NEXT_PUBLIC_ALTANA_NETWORK=${process.env.NEXT_PUBLIC_ALTANA_NETWORK ?? '(unset)'}: the server acts on one network while the pages name the other. Set both the same.`,
    );
  }

  const { listMarketplace, getEcosystemStats } = await import('@/lib/marketplace');

  // Sweeps on the server's own clock; off unless fly.toml turns it on.
  const { startSweepScheduler } = await import('@/lib/history/scheduler');
  startSweepScheduler();

  const started = Date.now();
  void Promise.all([
    listMarketplace({ limit: 8 }),
    getEcosystemStats(),
  ])
    .then(() => {
      console.log(
        `[warmup] registry cache primed in ${((Date.now() - started) / 1000).toFixed(1)}s`,
      );
    })
    .catch((error: unknown) => {
      // A failed warmup is survivable — the next request simply pays the cost.
      console.warn(`[warmup] failed: ${(error as Error).message}`);
    });
}

/**
 * Every server error, with the request it failed.
 *
 * Next logs a failed render as an error and a digest, with no path, so a
 * burst of them could not be traced to a page. This adds the method, the
 * route and the path without its query string, which can carry a wallet or
 * a token. Nothing else from the request is logged.
 */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const message = error instanceof Error ? error.message : String(error);
  const digest = typeof error === 'object' && error !== null && 'digest' in error ? ` digest=${String((error as { digest: unknown }).digest)}` : '';
  const path = request.path.split('?')[0];
  console.error(`[request-error] ${request.method} ${path} route=${context.routePath} type=${context.routeType}${digest}: ${message.slice(0, 300)}`);
};
