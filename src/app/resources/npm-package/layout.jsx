export const metadata = {
  title: 'NPM Package',
  description:
    'Install @elixpo/lixsketch — the LixSketch engine as a standalone npm package. Mount a hand-drawn infinite canvas on any SVG element.',
  openGraph: {
    title: '@elixpo/lixsketch — NPM Package',
    description:
      'The LixSketch drawing engine as an npm package. React, Vue, Svelte, or plain HTML — mount on any SVG.',
    images: [{ url: '/og-image.png', width: 1280, height: 720, alt: 'LixSketch NPM Package' }],
  },
  twitter: {
    title: '@elixpo/lixsketch — NPM Package',
    description: 'Mount a hand-drawn infinite canvas on any SVG element.',
    images: ['/og-image.png'],
  },
  alternates: { canonical: '/resources/npm-package' },
}

export default function NpmPackageLayout({ children }) {
  return children
}
