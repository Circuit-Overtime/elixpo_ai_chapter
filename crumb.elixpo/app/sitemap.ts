import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    { path: '', frequency: 'weekly' as const, priority: 1 },
    { path: '/features', frequency: 'weekly' as const, priority: 0.9 },
    { path: '/skills', frequency: 'weekly' as const, priority: 0.9 },
    { path: '/plugins', frequency: 'weekly' as const, priority: 0.9 },
    { path: '/about', frequency: 'monthly' as const, priority: 0.7 },
    { path: '/docs', frequency: 'weekly' as const, priority: 0.9 },
    { path: '/docs/getting-started', frequency: 'weekly' as const, priority: 0.8 },
    { path: '/docs/cli', frequency: 'weekly' as const, priority: 0.8 },
    { path: '/docs/authentication', frequency: 'monthly' as const, priority: 0.8 },
    { path: '/docs/pollinations', frequency: 'monthly' as const, priority: 0.8 },
    { path: '/docs/security', frequency: 'monthly' as const, priority: 0.8 },
    { path: '/privacy', frequency: 'yearly' as const, priority: 0.4 },
    { path: '/terms', frequency: 'yearly' as const, priority: 0.4 },
  ]
  return routes.map(route => ({ url: `https://crumb.elixpo.com${route.path}`, changeFrequency: route.frequency, priority: route.priority }))
}
