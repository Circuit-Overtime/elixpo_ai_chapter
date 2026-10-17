const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const API_KEY_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function generateShortCode(length = 6): string {
  let result = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (const byte of array) {
    result += CHARS[byte % CHARS.length];
  }
  return result;
}

export function generateSessionId(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateApiKey(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const key = Array.from(array, (b) => API_KEY_CHARS[b % API_KEY_CHARS.length]).join('');
  return `elu_${key}`;
}

export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(key));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function parseUserAgent(ua: string | null): { device: string; browser: string; os: string } {
  if (!ua) return { device: 'unknown', browser: 'unknown', os: 'unknown' };

  let device = 'desktop';
  if (/mobile/i.test(ua)) device = 'mobile';
  else if (/tablet|ipad/i.test(ua)) device = 'tablet';

  let browser = 'other';
  if (/firefox/i.test(ua)) browser = 'Firefox';
  else if (/edg/i.test(ua)) browser = 'Edge';
  else if (/chrome/i.test(ua)) browser = 'Chrome';
  else if (/safari/i.test(ua)) browser = 'Safari';

  let os = 'other';
  if (/windows/i.test(ua)) os = 'Windows';
  else if (/mac/i.test(ua)) os = 'macOS';
  else if (/linux/i.test(ua)) os = 'Linux';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad/i.test(ua)) os = 'iOS';

  return { device, browser, os };
}

export function isLikelyBot(userAgent: string | null): boolean {
  if (!userAgent) return true;
  return /bot|crawler|spider|slurp|preview|headless|curl|wget|python|httpclient|facebookexternalhit|discordbot|slackbot|telegrambot|whatsapp/i.test(userAgent);
}

export async function hmacSha256Hex(
  value: string,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function hashIp(
  ip: string | null,
  secret: string,
): Promise<string | null> {
  if (!ip || !secret) return null;
  let prefix: string | null = null;
  const v4Parts = ip.split('.');
  if (v4Parts.length === 4) prefix = `${v4Parts[0]}.${v4Parts[1]}.x.x`;
  else if (ip.includes(':')) {
    const segments = ip.split(':').slice(0, 4);
    prefix = `${segments.join(':')}::`;
  }
  return prefix ? hmacSha256Hex(`click-network-v1|${prefix}`, secret) : null;
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
