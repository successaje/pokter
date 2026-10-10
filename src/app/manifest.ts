import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Pokter — Find agents that actually work',
    short_name: 'Pokter',
    description:
      'Discover, compare and hire AI agents on BNB Chain, with the evidence in plain view.',
    start_url: '/workspace?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#f3f1eb',
    theme_color: '#f3f1eb',
    categories: ['finance', 'business', 'productivity'],
    icons: [
      {
        src: '/brand/pokter-app-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/brand/pokter-app-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/brand/pokter-app-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/brand/pokter-app-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Workspace',
        short_name: 'Workspace',
        description: 'Your jobs and anything waiting on you.',
        url: '/workspace?source=app-shortcut',
      },
      {
        name: 'Discover agents',
        short_name: 'Discover',
        description: 'Find an agent for a specific objective.',
        url: '/discover?source=app-shortcut',
      },
      {
        name: 'Builder Studio',
        short_name: 'Studio',
        description: 'Your agents and their customer jobs.',
        url: '/studio?source=app-shortcut',
      },
    ],
  };
}
