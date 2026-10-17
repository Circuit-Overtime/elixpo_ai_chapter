'use client'

import CanvasPageLayout from '@/components/landing/CanvasPageLayout'
import content from '@/content/pages/vscode-extension.md'

export default function VscodeExtensionPage() {
  return (
    <CanvasPageLayout
      title="LixSketch for VS Code"
      description="Draw diagrams right inside your editor. Full infinite canvas as a VS Code tab — no browser, no context switching."
      icon="bx bxl-visual-studio"
      tags={['vscode', 'extension', 'lixscript', 'editor']}
      breadcrumbs={[
        { label: 'Resources', href: '/' },
        { label: 'VS Code Extension' },
      ]}
      backHref="/"
      backLabel="Back to Home"
      content={content}
    />
  )
}
