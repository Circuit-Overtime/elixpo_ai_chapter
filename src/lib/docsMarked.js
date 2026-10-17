import { marked } from 'marked';
import { slugifyHeading } from './extractHeadings';

const renderer = new marked.Renderer();
renderer.heading = function ({ tokens, depth }) {
  const text = this.parser.parseInline(tokens);
  const id = slugifyHeading(text.replace(/<[^>]*>/g, ''));
  return `<h${depth} id="${id}">${text}</h${depth}>`;
};
marked.use({ renderer });

export function renderDocsMarkdown(md) {
  return marked.parse(md, { breaks: true });
}
