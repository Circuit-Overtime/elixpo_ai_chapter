import { readFileSync } from 'fs';
import path from 'path';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { docsNavFlat, getDocsSiblings } from '../../../src/config/docsNav';
import { extractHeadings } from '../../../src/lib/extractHeadings';
import { renderDocsMarkdown } from '../../../src/lib/docsMarked';
import DocsToc from '../../../src/components/docs/DocsToc';

const LEGACY_REDIRECTS = {
  'editor-overview': 'editor-overview',
  'installation': 'installation',
  'quick-start': 'quick-start',
  'props': 'props',
  'imperative-api': 'imperative-api',
  'block-model': 'block-model',
  'markdown-shortcuts': 'markdown-shortcuts',
  'rendering': 'rendering',
};

export function generateStaticParams() {
  return docsNavFlat.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const item = docsNavFlat.find((i) => i.slug === slug);
  if (!item) return {};
  return {
    title: `${item.title} — Docs`,
    description: item.description,
    alternates: { canonical: `https://blogs.elixpo.com/docs/${encodeURIComponent(slug)}` },
  };
}

export default async function DocsPage({ params }) {
  params = await params;
  const item = docsNavFlat.find((i) => i.slug === params.slug);
  if (!item) {
    if (LEGACY_REDIRECTS[params.slug]) {
      redirect(`/docs/lixeditor#${LEGACY_REDIRECTS[params.slug]}`);
    }
    notFound();
  }

  const filePath = path.join(process.cwd(), 'content/docs', `${params.slug}.md`);
  const md = readFileSync(filePath, 'utf8');
  const html = renderDocsMarkdown(md);
  const headings = extractHeadings(md);
  const { prev, next } = getDocsSiblings(params.slug);

  return (
    <>
      <div className="flex-1 min-w-0 max-w-3xl">
        <h1 className="text-3xl font-extrabold mb-1" style={{ color: 'var(--text-primary)' }}>
          {item.title}
        </h1>
        <p className="text-[14px] mb-8" style={{ color: 'var(--text-muted)' }}>{item.description}</p>

        <div className="legal-md" dangerouslySetInnerHTML={{ __html: html }} />

        <div className="flex justify-between mt-12 pt-6" style={{ borderTop: '1px solid var(--border-default)' }}>
          {prev ? (
            <Link href={`/docs/${prev.slug}`} className="text-[13px]" style={{ color: 'var(--accent)' }}>
              ← {prev.title}
            </Link>
          ) : <span />}
          {next ? (
            <Link href={`/docs/${next.slug}`} className="text-[13px]" style={{ color: 'var(--accent)' }}>
              {next.title} →
            </Link>
          ) : <span />}
        </div>
      </div>
      <DocsToc headings={headings} />
    </>
  );
}
