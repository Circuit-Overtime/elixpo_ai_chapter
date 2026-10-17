// Elixpo Mails — outbound transactional triggers.
// Signs a request with the product shared secret (ELIXPO_MAILS_SECRET) and
// POSTs to a template's hook. Scheme (see refers/mail.md):
//   X-Elixpo-Signature: t=<unix>,v1=<hex HMAC-SHA256 of `${t}.${rawBody}`>
// CRITICAL: sign and send the SAME bytes — build the JSON string once.
import { getEnv } from './db';

interface TriggerOpts {
  endpointKey: string;
  to: string;
  variables: Record<string, string>;
  /** Dedupe key — the same key won't send twice. */
  idempotencyKey?: string;
}

/**
 * Fire a transactional email. Best-effort: returns false (never throws) if the
 * service isn't configured or the send fails, so a webhook handler can call it
 * without risking its own 2xx. Logs failures for the delivery log.
 */
export async function triggerMail(opts: TriggerOpts): Promise<boolean> {
  const env = getEnv();
  const secret = env.ELIXPO_MAILS_SECRET;
  if (!secret || !opts.endpointKey || !opts.to) return false; // not configured → no-op

  const base = (env.ELIXPO_MAILS_BASE_URL || 'https://mails.elixpo.com').replace(/\/$/, '');
  // Build the body string ONCE — HMAC over it and send the same bytes.
  const body = JSON.stringify({
    to: opts.to,
    variables: opts.variables,
    ...(opts.idempotencyKey ? { idempotency_key: opts.idempotencyKey } : {}),
  });
  const t = Math.floor(Date.now() / 1000);
  const v1 = await hmacHex(secret, `${t}.${body}`);

  try {
    const res = await fetch(`${base}/v1/hooks/${opts.endpointKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Elixpo-Signature': `t=${t},v1=${v1}` },
      body,
    });
    if (!res.ok) {
      console.error('[mail] trigger failed', res.status, await res.text().catch(() => ''));
      return false;
    }
    return true; // 200 sent or suppressed (both are non-errors)
  } catch (err) {
    console.error('[mail] trigger error', err);
    return false;
  }
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
