import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/auth/', '/connect', '/login', '/profile/', '/profiles'] }, sitemap: 'https://crumb.elixpo.com/sitemap.xml' }
}
