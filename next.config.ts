import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
   * The monorepo root is ambiguous here — a stray lockfile sits above this
   * directory — so Turbopack is told explicitly where the project starts.
   */
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
