interface CloudflareEnv {
  DB: D1Database;
  KV: KVNamespace;
  OAUTH_CLIENT_ID: string;
  OAUTH_CLIENT_SECRET: string;
  OAUTH_REDIRECT_URI: string;
  BASE_URL: string;
  SAFE_BROWSING_API_KEY: string;
  GUEST_FINGERPRINT_SECRET: string;
  ELIXPO_WEBHOOK_SECRET: string;
  BLOGS_INTEGRATION_TOKEN: string;
  // Elixpo Pay — subscriptions / autopay.
  ELIXPO_PAY_BASE_URL: string;
  ELIXPO_PAY_APP_ID: string;
  ELIXPO_PAY_API_KEY: string;
  ELIXPO_PAY_WEBHOOK_SECRET: string;
  // Elixpo Mails — transactional triggers.
  ELIXPO_MAILS_BASE_URL: string;
  ELIXPO_MAILS_SECRET: string;
  ELIXPO_MAILS_HOOK_RECEIPT: string;
  ELIXPO_MAILS_HOOK_CANCELED: string;
  ELIXPO_MAILS_HOOK_PAYMENT_FAILED: string;
  ELIXPO_MAILS_HOOK_DOWNGRADED: string;
}

declare module '@cloudflare/next-on-pages' {
  export function getRequestContext(): {
    env: CloudflareEnv;
    ctx: ExecutionContext;
    cf: IncomingRequestCfProperties;
  };
}
