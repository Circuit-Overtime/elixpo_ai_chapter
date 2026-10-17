export const metadata = {
  title: 'MCP Server — LixSketch Docs',
  description: 'Configure the package-native LixSketch MCP server for structured canvas edits, previews, and marketplace templates.',
  openGraph: {
    title: 'LixSketch MCP Server',
    description: 'Setup, tools, safety model, and examples for the LixSketch MCP server.',
    url: '/docs/mcp',
    images: [{ url: '/og-image.png', width: 1280, height: 720, alt: 'LixSketch MCP server documentation' }],
  },
  alternates: { canonical: '/docs/mcp' },
}

export default function McpDocsLayout({ children }) {
  return children
}
