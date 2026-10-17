import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Lixrl URL Shortener & QR Generator',
    short_name: 'Lixrl',
    description:
      'Shorten URLs, generate QR codes, create branded links, and track link or QR scan activity.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#e53935',
    icons: [
      { src: '/icon0.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon1.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icon1.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
