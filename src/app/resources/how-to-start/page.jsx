'use client'

import CanvasPageLayout from '@/components/landing/CanvasPageLayout'
import content from '@/content/pages/how-to-start.md'

export default function HowToStartPage() {
  return (
    <CanvasPageLayout
      title="How to Start with LixSketch"
      description="Everything you need to go from zero to diagram. No account, no install, no friction."
      icon="bx bx-rocket"
      tags={['guide', 'tutorial', 'getting-started']}
      breadcrumbs={[
        { label: 'Resources', href: '/' },
        { label: 'How to Start' },
      ]}
      backHref="/"
      backLabel="Back to Home"
      content={content}
    />
  )
}
