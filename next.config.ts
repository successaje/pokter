import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
  serverExternalPackages: ['@altananetwork/sdk', 'node:sqlite'],

  /*
   * The monorepo root is ambiguous here — a stray lockfile sits above this
   * directory — so Turbopack is told explicitly where the project starts.
   */
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
