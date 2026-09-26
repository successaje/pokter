import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Pokter — BNB Chain Agent Marketplace',
    short_name: 'Pokter',
    description:
      'Discover, verify, compare and safely hire autonomous financial agents on BNB Chain.',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#08090b',
    theme_color: '#f0b90b',
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
        name: 'Pokter home',
        short_name: 'Home',
        description: 'Open your Pokter mobile dashboard.',
        url: '/app?source=app-shortcut',
      },
      {
        name: 'Discover agents',
        short_name: 'Discover',
        description: 'Find an agent for a specific objective.',
        url: '/discover?source=app-shortcut',
      },
      {
        name: 'My agents',
        short_name: 'My agents',
        description: 'Review your active agent work.',
        url: '/my-agents?source=app-shortcut',
      },
    ],
  };
}
