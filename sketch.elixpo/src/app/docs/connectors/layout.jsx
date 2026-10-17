export const metadata = {
  title: 'Connectors — LixSketch Docs',
  description: 'Connect personal Cloudinary storage and Pollinations image generation to LixSketch.',
  openGraph: {
    title: 'LixSketch Connector Documentation',
    description: 'Production setup and usage for the Cloudinary and Pollinations connectors.',
    url: '/docs/connectors',
    images: [{ url: '/og-image.png', width: 1280, height: 720, alt: 'LixSketch connector documentation' }],
  },
  alternates: { canonical: '/docs/connectors' },
}

export default function ConnectorsDocsLayout({ children }) {
  return children
}
