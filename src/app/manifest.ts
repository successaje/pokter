import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Pokter — BNB Chain Agent Marketplace',
    short_name: 'Pokter',
    description:
      'Discover, verify, compare and safely hire autonomous financial agents on BNB Chain.',
    start_url: '/',
    display: 'standalone',
    background_color: '#08090b',
    theme_color: '#f0b90b',
    icons: [
      { src: '/brand/pokter-app-icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/pokter-app-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
