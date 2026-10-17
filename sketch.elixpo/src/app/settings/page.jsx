import { redirect } from 'next/navigation'

export const runtime = 'edge'


export default async function SettingsPage({ searchParams }) {
  const params = new URLSearchParams(await searchParams)
  params.set('tab', params.get('tab') || 'integrations')
  redirect(`/profile?${params.toString()}#integrations`)
}
