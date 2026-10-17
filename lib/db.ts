import { getRequestContext } from '@cloudflare/next-on-pages';

export function getDB(): D1Database {
  return getRequestContext().env.DB;
}

export function getKV(): KVNamespace {
  return getRequestContext().env.KV;
}

export function getEnv() {
  const ctx = getRequestContext().env;
  return {
    DB: ctx.DB as D1Database,
    KV: ctx.KV as KVNamespace,
    NEXT_PUBLIC_ELIXPO_CLIENT_ID: (ctx as any).NEXT_PUBLIC_ELIXPO_CLIENT_ID || process.env.NEXT_PUBLIC_ELIXPO_CLIENT_ID || '',
    ELIXPO_CLIENT_SECRET: (ctx as any).ELIXPO_CLIENT_SECRET || process.env.ELIXPO_CLIENT_SECRET || '',
    // Public OAuth client identifier registered for the Lixrl CLI device flow.
    ELIXPO_LIXRL_CLI_CLIENT_ID:
      (ctx as any).ELIXPO_LIXRL_CLI_CLIENT_ID ||
      process.env.ELIXPO_LIXRL_CLI_CLIENT_ID ||
      'lixrl-cli-prod',
    BASE_URL: (ctx as any).BASE_URL || process.env.BASE_URL || '',
    SAFE_BROWSING_API_KEY: (ctx as any).SAFE_BROWSING_API_KEY || process.env.SAFE_BROWSING_API_KEY || '',
    GUEST_FINGERPRINT_SECRET: (ctx as any).GUEST_FINGERPRINT_SECRET || process.env.GUEST_FINGERPRINT_SECRET || '',
    // DEV-ONLY: when set (e.g. `pro` / `business` / `enterprise`),
    // every authenticated user is promoted to this tier in-memory. Used
    // for local QA of paid-only flows without mutating D1. Leave unset
    // in production.
    DEV_TIER_OVERRIDE: (ctx as any).DEV_TIER_OVERRIDE || process.env.DEV_TIER_OVERRIDE || '',
    // Shared secret with Elixpo Accounts for signed webhooks. Used to
    // verify the HMAC on /api/webhooks/elixpo. Must match the secret
    // configured on the accounts.elixpo side.
    ELIXPO_WEBHOOK_SECRET: (ctx as any).ELIXPO_WEBHOOK_SECRET || process.env.ELIXPO_WEBHOOK_SECRET || '',
    // Server-to-server credential used by Blogs for delegated link creation.
    // This is never a browser-facing or per-user API key.
    BLOGS_INTEGRATION_TOKEN: (ctx as any).BLOGS_INTEGRATION_TOKEN || process.env.BLOGS_INTEGRATION_TOKEN || '',
    // Elixpo Pay — subscriptions / autopay. API key creates checkout
    // sessions + authorizes catalog sync (POST /v1/sync); webhook secret
    // verifies the inbound entitlement.updated signature (t=,v1= scheme).
    ELIXPO_PAY_BASE_URL: (ctx as any).ELIXPO_PAY_BASE_URL || process.env.ELIXPO_PAY_BASE_URL || 'https://payouts.elixpo.com',
    ELIXPO_PAY_APP_ID: (ctx as any).ELIXPO_PAY_APP_ID || process.env.ELIXPO_PAY_APP_ID || '',
    ELIXPO_PAY_API_KEY: (ctx as any).ELIXPO_PAY_API_KEY || process.env.ELIXPO_PAY_API_KEY || '',
    ELIXPO_PAY_WEBHOOK_SECRET: (ctx as any).ELIXPO_PAY_WEBHOOK_SECRET || process.env.ELIXPO_PAY_WEBHOOK_SECRET || '',
    // Elixpo Mails — transactional triggers. Secret signs the request; each
    // HOOK_* is a template's endpoint_key.
    ELIXPO_MAILS_BASE_URL: (ctx as any).ELIXPO_MAILS_BASE_URL || process.env.ELIXPO_MAILS_BASE_URL || 'https://mails.elixpo.com',
    ELIXPO_MAILS_SECRET: (ctx as any).ELIXPO_MAILS_SECRET || process.env.ELIXPO_MAILS_SECRET || '',
    ELIXPO_MAILS_HOOK_RECEIPT: (ctx as any).ELIXPO_MAILS_HOOK_RECEIPT || process.env.ELIXPO_MAILS_HOOK_RECEIPT || '',
    ELIXPO_MAILS_HOOK_CANCELED: (ctx as any).ELIXPO_MAILS_HOOK_CANCELED || process.env.ELIXPO_MAILS_HOOK_CANCELED || '',
    ELIXPO_MAILS_HOOK_PAYMENT_FAILED: (ctx as any).ELIXPO_MAILS_HOOK_PAYMENT_FAILED || process.env.ELIXPO_MAILS_HOOK_PAYMENT_FAILED || '',
    ELIXPO_MAILS_HOOK_DOWNGRADED: (ctx as any).ELIXPO_MAILS_HOOK_DOWNGRADED || process.env.ELIXPO_MAILS_HOOK_DOWNGRADED || '',
  };
}

/** Derive the origin from a request URL (works for both localhost and production) */
export function getOrigin(requestUrl: string): string {
  const { origin } = new URL(requestUrl);
  return origin; // e.g. http://localhost:3000 or https://lixrl.com
}
