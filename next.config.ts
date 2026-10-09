import type { NextConfig } from 'next';

/**
 * The content policy, written against what this app actually loads.
 *
 * `img-src` has to allow any https host: agent avatars come from whatever
 * address an operator published in the registry, which is the one thing here
 * that is deliberately not under Pokter's control. They are already loaded
 * with a no-referrer policy so the host learns nothing about the visitor.
 *
 * `script-src` still carries 'unsafe-inline'. Next's bootstrap and streamed
 * RSC payloads are inline, and removing it needs a nonce threaded through a
 * middleware on every request. That is worth doing and is not done here — this
 * policy is a floor, not the finished job. It already stops framing, plugin
 * content, base-tag rewriting and form posts to third parties.
 */
function contentSecurityPolicy(): string {
  const dev = process.env.NODE_ENV !== 'production';

  return [
    "default-src 'self'",
    // eval is React Fast Refresh in development only.
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    /*
     * WalletConnect's modal is a web component that ships its own typeface
     * from fonts.reown.com. Blocked, the pairing dialog still works and
     * renders in a fallback face, with eight CSP violations in the console
     * for anybody debugging something else.
     */
    "font-src 'self' data: https://fonts.reown.com",
    // Chain RPC, the registry indexer and the wallet relay are all https, and
    // the dev server's hot-reload channel is a websocket. `wss:` is what
    // carries WalletConnect: its pairing runs over a socket to
    // relay.walletconnect.org, and without it the modal opens, draws no QR
    // and disables its own copy-link button.
    `connect-src 'self' https:${dev ? ' ws: wss:' : ' wss:'}`,
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    /*
     * Production only. This directive rewrites ws: to wss: as well as http: to
     * https:, which silently kills the dev server's hot-reload socket on
     * localhost — the page still renders, so it looks like HMR is broken
     * rather than like a policy doing its job.
     */
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

const nextConfig: NextConfig = {
  /*
   * Announcing the framework and its version tells an attacker which
   * advisories to try first and tells a visitor nothing.
   */
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          /*
           * Two years, with subdomains, and preload-eligible. A product that
           * asks someone to sign a transaction should never be reachable over
           * plaintext, and without this the first request of a session still
           * can be.
           */
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
        ],
      },
    ];
  },

  /**
   * Standalone output bundles a minimal server with only the dependencies the
   * app actually reaches, which is what makes the container small enough to
   * deploy quickly.
   */
  output: 'standalone',

  /**
   * The Altana SDK and node:sqlite must stay external to the server bundle:
   * both resolve native or Node-builtin modules that a bundler cannot inline,
   * and bundling them produces a build that only fails at runtime.
   */
  serverExternalPackages: ['@altananetwork/sdk', 'node:sqlite', 'undici'],

  /*
   * The hiring activity page now lives at /activity, which is what the nav
   * has always called it and what a visitor types to reach it.
   *
   * It used to sit at /my-agents and the redirect ran the other way, on the
   * reasoning that the address was already in sent emails and the installed
   * app's shortcuts. That held until the nav gained a genuine "My agents"
   * destination for the agents somebody publishes — at which point a link
   * labelled Activity pointing at /my-agents, beside a link labelled My
   * agents pointing somewhere else, was a trap for whoever edits this next.
   *
   * Nothing breaks: the redirect below carries every already-sent email and
   * every installed shortcut, query string intact, to the same content.
   */
  async redirects() {
    return [
      /*
       * Hiring is a drawer over the dossier now, not a page of its own, so
       * this address opens it instead of loading a second implementation of
       * the same step. The query is what HireDrawer reads on arrival, which
       * is why it exists — links into the hire step, from anywhere, still
       * land on the hire step.
       */
      {
        source: '/hire/:chainId/:tokenId',
        destination: '/agents/:chainId/:tokenId?hire=1',
        permanent: false,
      },
      { source: '/my-agents', destination: '/activity', permanent: false },
      { source: '/how-it-works', destination: '/about', permanent: false },
    ];
  },

  /*
   * The monorepo root is ambiguous here — a stray lockfile sits above this
   * directory — so Turbopack is told explicitly where the project starts.
   */
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
