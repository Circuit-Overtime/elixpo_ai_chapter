'use client'

import CanvasPageLayout from '@/components/landing/CanvasPageLayout'
import content from '@/content/pages/use-cases.md'

export default function UseCasesPage() {
  return (
    <CanvasPageLayout
      title="Use Cases"
      description="Architecture diagrams, wireframes, brainstorming, documentation — see how teams use LixSketch."
      icon="bx bx-bulb"
      tags={['use-cases', 'workflows', 'examples']}
      breadcrumbs={[
        { label: 'Resources', href: '/' },
        { label: 'Use Cases' },
      ]}
      backHref="/"
      backLabel="Back to Home"
      content={content}
    />
  )
}
