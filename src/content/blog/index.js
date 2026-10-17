/**
 * Blog post registry.
 * Each entry maps a slug to metadata. The actual content is loaded
 * from .md files via raw imports at build time.
 */

export const blogPosts = [
  {
    slug: 'lixeditor-integration',
    title: 'Integrating @elixpo/lixeditor: A Notion-Style WYSIWYG Editor',
    description: 'How we dropped a full WYSIWYG editor into LixSketch using the @elixpo/lixeditor npm package — three CSS imports, one provider, one component, plus the bugs we hit along the way.',
    icon: 'bx bx-text',
    date: '2026-05-02',
    tags: ['integration', 'editor', 'npm', 'blocknote'],
  },
  {
    slug: 'engine-package-launch',
    title: 'Introducing @elixpo/lixsketch: Build Your Own Whiteboard',
    description: 'We\'re open-sourcing the LixSketch engine as an npm package and launching a VS Code extension. Install it, mount on any SVG, and build your own whiteboard.',
    icon: 'bx bx-package',
    date: '2026-03-21',
    tags: ['launch', 'npm', 'vscode', 'open-source'],
  },
  {
    slug: 'image-pipeline',
    title: 'The Image Pipeline: From Pixels to Canvas to Cloud',
    description: 'How LixSketch handles images from file uploads, AI generation, clipboard pastes, and frame backgrounds — compress, place, upload, replace.',
    icon: 'bx bx-image-alt',
    date: '2026-03-14',
    tags: ['images', 'architecture', 'cloudinary'],
  },
  {
    slug: 'roughjs-canvas',
    title: 'Why We Chose RoughJS for the Canvas',
    description: 'The design philosophy behind hand-drawn aesthetics and why SVG beats HTML5 Canvas for diagramming.',
    icon: 'bx bx-pen',
    date: '2026-03-10',
    tags: ['design', 'rendering'],
  },
  {
    slug: 'lixscript-dsl',
    title: 'Designing LixScript: A DSL for Diagrams',
    description: 'Why we built a custom declarative language for diagram generation and how the parser works.',
    icon: 'bx bx-code-curly',
    date: '2026-03-05',
    tags: ['lixscript', 'language-design'],
  },
  {
    slug: 'websocket-collaboration',
    title: 'Real-Time Collaboration with Durable Objects',
    description: 'How we use Cloudflare Durable Objects and WebSockets for zero-conflict real-time editing.',
    icon: 'bx bx-broadcast',
    date: '2026-02-28',
    tags: ['collaboration', 'infrastructure'],
  },
  {
    slug: 'e2e-encryption',
    title: 'How LixSketch Ensures End-to-End Encryption',
    description: 'A deep dive into our E2E encryption architecture — how your canvas data stays private even from our servers.',
    icon: 'bx bx-shield-quarter',
    date: '2026-02-15',
    tags: ['security', 'architecture'],
  },
]

export function getBlogPost(slug) {
  return blogPosts.find(p => p.slug === slug) || null
}
