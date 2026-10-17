'use client'

import CanvasPageLayout from '@/components/landing/CanvasPageLayout'
import content from '@/content/pages/teams.md'

export default function TeamsPage() {
  return (
    <CanvasPageLayout
      title="Teams & Collaboration"
      description="Start an encrypted room, share its link, and draw together with live cursors and synchronized updates."
      icon="bx bx-group"
      tags={['collaboration', 'teams', 'real-time']}
      breadcrumbs={[
        { label: 'Teams' },
      ]}
      backHref="/"
      backLabel="Back to Home"
      content={content}
    />
  )
}
