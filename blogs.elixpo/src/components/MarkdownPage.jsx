'use client';

import AppShell from './AppShell';

// Renders pre-converted markdown HTML in a full-width, vertically-spaced
// document layout. HTML is built server-side from our own trusted .md files.
export default function MarkdownPage({ html }) {
  return (
    <AppShell>
      <div
        className="w-full max-w-3xl mx-auto px-6 py-12 block legal-md"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </AppShell>
  );
}
