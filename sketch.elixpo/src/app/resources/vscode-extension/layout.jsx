export const metadata = {
  title: 'VS Code Extension',
  description:
    'LixSketch for VS Code — draw diagrams inside your editor. Full canvas tab, LixScript syntax highlighting, and live preview.',
  openGraph: {
    title: 'LixSketch for VS Code',
    description:
      'Draw diagrams inside VS Code. Full canvas tab, .lix syntax highlighting, and live preview.',
    images: [{ url: '/og-image.png', width: 1280, height: 720, alt: 'LixSketch VS Code Extension' }],
  },
  twitter: {
    title: 'LixSketch for VS Code',
    description: 'Full infinite canvas as a VS Code editor tab.',
    images: ['/og-image.png'],
  },
  alternates: { canonical: '/resources/vscode-extension' },
}

export default function VscodeExtensionLayout({ children }) {
  return children
}
