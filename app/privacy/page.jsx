import { readFileSync } from 'fs';
import path from 'path';
import { marked } from 'marked';
import MarkdownPage from '../../src/components/MarkdownPage';
import { staticPageMeta } from '../../lib/pageMeta';

export const metadata = staticPageMeta({
  title: 'Privacy Policy',
  description: 'How LixBlogs collects, uses, and protects your data.',
  path: '/privacy',
});

export default function PrivacyPage() {
  const md = readFileSync(path.join(process.cwd(), 'content/privacy.md'), 'utf8');
  const html = marked.parse(md, { breaks: true });
  return <MarkdownPage html={html} />;
}
