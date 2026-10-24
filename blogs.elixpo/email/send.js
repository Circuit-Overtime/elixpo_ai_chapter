/**
 * Email sending abstraction.
 *
 * - Local / Node.js testing:  uses nodemailer + Gmail SMTP (reads .env)
 * - Cloudflare Workers:       uses MailChannels API (free, no credentials needed on CF)
 *
 * Usage:
 *   import { sendEmail } from './send.js';
 *   await sendEmail({ to: 'user@example.com', subject: '...', html: '...' });
 */

/**
 * @param {object} opts
 * @param {string} opts.to       - Recipient email
 * @param {string} opts.subject  - Subject line
 * @param {string} opts.html     - HTML body
 * @param {string} [opts.from]   - Sender (default: env MAIL_FROM)
 * @param {string} [opts.replyTo]
 * @returns {Promise<{ ok: boolean, messageId?: string, error?: string }>}
 */
export async function sendEmail(opts) {
  // Detect runtime: Cloudflare Workers have no `process` global
  const isCF = typeof process === 'undefined' || typeof process.env === 'undefined';

  if (isCF) {
    return sendViaMailChannels(opts);
  }
  return sendViaNodemailer(opts);
}

// ─── Cloudflare Workers: MailChannels API ───────────────────────────────
// Free for Cloudflare Workers, no credentials needed.
// Requires DNS SPF record: v=spf1 include:relay.mailchannels.net ~all
// Docs: https://blog.cloudflare.com/sending-email-from-workers-with-mailchannels
async function sendViaMailChannels(opts) {
  const from = opts.from || 'noreply@elixpo.com';
  const fromName = 'LixBlogs';

  try {
    const res = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: opts.to }],
        }],
        from: { email: from, name: fromName },
        reply_to: opts.replyTo ? { email: opts.replyTo } : undefined,
        subject: opts.subject,
        content: [{
          type: 'text/html',
          value: opts.html,
        }],
      }),
    });

    if (res.ok || res.status === 202) {
      return { ok: true };
    }
    const text = await res.text();
    return { ok: false, error: `MailChannels ${res.status}: ${text}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─── Node.js / Local: nodemailer + SMTP ─────────────────────────────────
async function sendViaNodemailer(opts) {
  try {
    const nodemailer = await import('nodemailer');

    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT || '465', 10);
    const user = process.env.SMTP_FROM_EMAIL;
    const pass = process.env.SMTP_PASS;

    if (!user || !pass) {
      return { ok: false, error: 'Missing SMTP_FROM_EMAIL or SMTP_PASS in .env' };
    }

    const transporter = nodemailer.default.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    const fromName = process.env.SMTP_FROM_NAME || 'LixBlogs';
    const from = opts.from || `${fromName} <${user}>`;

    const info = await transporter.sendMail({
      from,
      to: opts.to,
      replyTo: opts.replyTo,
      subject: opts.subject,
      html: opts.html,
    });

    return { ok: true, messageId: info.messageId };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
