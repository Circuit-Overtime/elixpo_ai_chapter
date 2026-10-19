import { readFileSync } from 'fs';
import path from 'path';
import { marked } from 'marked';
import MarkdownPage from '../../src/components/MarkdownPage';

export const metadata = {
  title: 'Terms of Service',
  description: 'The terms governing your use of LixBlogs.',
  alternates: { canonical: 'https://blogs.elixpo.com/terms' },
};

export default function TermsPage() {
  const md = readFileSync(path.join(process.cwd(), 'content/terms-of-service.md'), 'utf8');
  const html = marked.parse(md, { breaks: true });
  return <MarkdownPage html={html} />;
}
