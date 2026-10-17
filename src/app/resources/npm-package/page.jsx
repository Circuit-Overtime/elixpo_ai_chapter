'use client'

import CanvasPageLayout from '@/components/landing/CanvasPageLayout'
import content from '@/content/pages/npm-package.md'

export default function NpmPackagePage() {
  return (
    <CanvasPageLayout
      title="@elixpo/lixsketch"
      description="The LixSketch engine as a standalone npm package. Mount an infinite, hand-drawn canvas on any SVG element."
      icon="bx bxl-nodejs"
      tags={['npm', 'package', 'engine', 'open-source']}
      breadcrumbs={[
        { label: 'Resources', href: '/' },
        { label: 'NPM Package' },
      ]}
      backHref="/"
      backLabel="Back to Home"
      content={content}
    />
  )
}
