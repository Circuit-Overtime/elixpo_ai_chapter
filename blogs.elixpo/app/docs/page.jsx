import Link from 'next/link';
import { docsNav } from '../../src/config/docsNav';

export const metadata = {
  title: 'Documentation',
  description: 'Guides for publishing, media, analytics, integrations, search, and the LixEditor API.',
  alternates: { canonical: 'https://blogs.elixpo.com/docs' },
};

export default function DocsIndex() {
  return (
    <div className="w-full min-w-0">
      <div className="mb-10 max-w-3xl">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">LixBlogs documentation</p>
        <h1 className="text-4xl font-extrabold tracking-tight text-[var(--text-primary)]">Publish with confidence</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[var(--text-muted)]">
          Learn how to write, collaborate, manage media, automate with the CLI, understand your audience, connect services, and build with LixEditor.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/docs/writing-publishing" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white">Start writing</Link>
          <Link href="/docs/integrations" className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)]">Connect a service</Link>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {docsNav.map((section) => (
          <section key={section.title}>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">{section.title}</h2>
            <div className="grid gap-2">
              {section.items.map((item) => (
                <Link key={item.slug} href={`/docs/${item.slug}`} className="group rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 transition-colors hover:border-[var(--accent)]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)]">{item.title}</h3>
                      <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{item.description}</p>
                    </div>
                    <span aria-hidden="true" className="text-[var(--text-faint)] group-hover:text-[var(--accent)]">→</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
