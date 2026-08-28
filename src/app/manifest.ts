import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Smart Care AI',
    short_name: 'SmartCare',
    description: 'AI-powered medical triage booth',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#071c1c',
    theme_color: '#071c1c',
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
