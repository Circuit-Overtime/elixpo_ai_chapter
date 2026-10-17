'use client'

import CanvasPageLayout from '@/components/landing/CanvasPageLayout'
import content from '@/content/pages/security.md'

export default function SecurityPage() {
  return (
    <CanvasPageLayout
      title="Security at LixSketch"
      description="Your canvas data belongs to you. Zero-knowledge architecture, E2E encryption, and full open-source transparency."
      icon="bx bx-shield-quarter"
      tags={['security', 'encryption', 'privacy']}
      breadcrumbs={[
        { label: 'Resources', href: '/' },
        { label: 'Security' },
      ]}
      backHref="/"
      backLabel="Back to Home"
      content={content}
    />
  )
}
