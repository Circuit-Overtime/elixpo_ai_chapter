import { redirect } from 'next/navigation'

function safeReturnTo(value: string | string[] | undefined): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/profile/connectors'
}

export default async function LoginRedirect({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const returnTo = safeReturnTo(params.return_to)
  redirect(`/api/auth/login?return_to=${encodeURIComponent(returnTo)}`)
}
