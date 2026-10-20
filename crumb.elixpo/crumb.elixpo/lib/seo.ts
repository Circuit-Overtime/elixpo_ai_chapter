import type { Metadata } from 'next'

const SITE = 'https://crumb.elixpo.com'

export function pageMetadata({ title, description, path, keywords = [], noIndex = false }: {
  title: string
  description: string
  path: string
  keywords?: string[]
  noIndex?: boolean
}): Metadata {
  return {
    title,
    description,
    keywords,
    alternates: { canonical: path },
    robots: noIndex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: { title: `${title} · Crumb`, description, url: `${SITE}${path}`, type: 'website', siteName: 'Crumb NLT' },
    twitter: { card: 'summary', title: `${title} · Crumb`, description },
  }
}
