import { getCloudflareContext } from '@opennextjs/cloudflare'

export async function bindings(): Promise<CloudflareEnv> {
  return (await getCloudflareContext({ async: true })).env
}

export async function config() {
  const runtime = await bindings()
    .then(env => env as unknown as Record<string, unknown>)
    .catch(() => undefined)
  const value = (name: string): string => {
    const candidate = runtime?.[name] ?? process.env[name]
    if (typeof candidate !== 'string' || candidate.startsWith('ENC[')) return ''
    return candidate
  }
  return {
    accountsOrigin: value('ACCOUNTS_ORIGIN') || 'https://accounts.elixpo.com',
    accountsClientId: value('NEXT_PUBLIC_ELIXPO_CLIENT_ID'),
    accountsCliClientId: value('NEXT_PUBLIC_ELIXPO_CLIENT_ID_CLI'),
    accountsClientSecret: value('ELIXPO_CLIENT_SECRET'),
    accountsWebhookSecret: value('ELIXPO_ACCOUNTS_WEBHOOK_SECRET'),
    accountsCliAudience: value('ACCOUNTS_CLI_AUDIENCE') || 'crumb.elixpo.com',
    pollinationsAppKey: value('POLLINATIONS_APP_KEY'),
    connectorEncryptionKey: value('CONNECTOR_ENCRYPTION_KEY'),
  }
}

export function originFor(requestUrl: string): string {
  return new URL(requestUrl).origin
}
