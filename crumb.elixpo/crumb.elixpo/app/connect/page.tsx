import { redirect } from 'next/navigation'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({ title: 'Connections', description: 'Continue to Crumb Profiles and connections.', path: '/connect', noIndex: true })

export default async function LegacyConnectPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (typeof value === 'string') query.set(key, value)
  redirect(`/profile/connectors${query.size ? `?${query}` : ''}`)
}
