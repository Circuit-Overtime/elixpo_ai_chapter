import Link from 'next/link';
import AppShell from '../../src/components/AppShell';
import DocsSidebar from '../../src/components/docs/DocsSidebar';
import DocsSearch from '../../src/components/docs/DocsSearch';

export default function DocsLayout({ children }) {
  return (
    <AppShell showSidebar={false}>
      <div className="w-full max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-[13px] font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
          >
            <span aria-hidden="true">←</span>
            Back to LixBlogs
          </Link>
          <DocsSearch />
        </div>
        <div className="flex gap-8">
          <DocsSidebar />
          <div className="flex-1 min-w-0 flex gap-8">{children}</div>
        </div>
      </div>
    </AppShell>
  );
}
