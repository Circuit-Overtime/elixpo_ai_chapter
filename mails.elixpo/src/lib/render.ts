/**
 * Template → email rendering. Two jobs:
 *   1. Substitute {{variables}} into the subject and body.
 *   2. Wrap the editor's HTML in an email-safe document (light background,
 *      table-based container, structural styles inlined + a <style> block for
 *      content tags that Gmail/Apple/Outlook-web honor).
 *
 * Web HTML breaks in mail clients (gotcha #5). This is the v1 email shell;
 * a full CSS inliner pass can harden it later for legacy Outlook.
 *
 * Pure + edge-safe (no DOM) so it runs in a Pages route or the sender Worker.
 */

import { substituteVariables } from "./template-vars";

/** Default email canvas colour (the area around the white content card). */
export const DEFAULT_BG_COLOR = "#f4f4f7";

export interface RenderableTemplate {
    subject: string;
    content_html: string | null;
    /** Email canvas colour; falls back to DEFAULT_BG_COLOR. */
    background_color?: string | null;
}

export interface RenderedEmail {
    subject: string;
    html: string;
    text: string;
}

/** Brand footer appended below the content (built from the sending product). */
export interface EmailFooter {
    name?: string | null;
    logoUrl?: string | null;
    homepageUrl?: string | null;
    supportEmail?: string | null;
    address?: string | null;
    phone?: string | null;
    quote?: string | null;
    /** Per-recipient unsubscribe link (added at send for non-transactional mail). */
    unsubscribeUrl?: string | null;
}

export function renderTemplate(
    template: RenderableTemplate,
    vars: Record<string, any> = {},
    footer?: EmailFooter | null,
): RenderedEmail {
    const subject = substituteVariables(template.subject || "", vars);
    const content = substituteVariables(template.content_html || "", vars);
    return {
        subject,
        html: wrapEmailHtml(content, template.background_color, footer),
        text: htmlToText(content),
    };
}

/** Wrap rendered content in a responsive, email-client-safe HTML document. */
export function wrapEmailHtml(
    content: string,
    bgColor?: string | null,
    footer?: EmailFooter | null,
): string {
    const bg = sanitizeColor(bgColor) || DEFAULT_BG_COLOR;
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<style>
  body { margin:0; padding:0; background:${bg}; -webkit-text-size-adjust:100%; }
  .e-content { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#1a1a1a; font-size:16px; line-height:1.6; }
  .e-content p { margin:0 0 16px; }
  .e-content h1 { font-size:26px; line-height:1.25; margin:0 0 16px; }
  .e-content h2 { font-size:21px; margin:24px 0 12px; }
  .e-content h3 { font-size:18px; margin:20px 0 10px; }
  .e-content a { color:#7c5cff; text-decoration:underline; }
  .e-content img { max-width:100%; height:auto; border-radius:8px; }
  .e-content ul, .e-content ol { margin:0 0 16px; padding-left:22px; }
  .e-content li { margin:0 0 6px; }
  .e-content hr { border:none; border-top:1px solid #e5e7eb; margin:24px 0; }
  .e-content blockquote { margin:0 0 16px; padding:8px 16px; border-left:3px solid #d8d3f0; color:#555; }
  .e-content pre { background:#0b0d12; color:#e5e7eb; padding:14px; border-radius:8px; overflow:auto; font-size:13px; }
  .e-content code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:0.9em; }
</style>
</head>
<body>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td class="e-content" style="padding:32px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;font-size:16px;line-height:1.6;">
${content || '<p style="color:#9aa0a6">(empty)</p>'}
</td></tr>
</table>
${renderFooter(footer)}
</td></tr>
</table>
</body>
</html>`;
}

function esc(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** Email-safe brand footer below the content card (muted, on the canvas). */
function renderFooter(footer?: EmailFooter | null): string {
    const f = footer || {};
    const logo = f.logoUrl
        ? `<img src="${esc(f.logoUrl)}" alt="${esc(f.name || "")}" height="28" style="height:28px;width:auto;margin:0 auto 8px;display:block;">`
        : "";
    const name = f.name
        ? `<div style="font-weight:700;color:#6b7280;margin-bottom:2px;">${esc(f.name)}</div>`
        : "";
    const quote = f.quote
        ? `<div style="font-style:italic;color:#9aa0a6;margin-bottom:6px;">${esc(f.quote)}</div>`
        : "";
    const address = f.address ? `<div>${esc(f.address)}</div>` : "";
    const contactBits: string[] = [];
    if (f.phone) contactBits.push(esc(f.phone));
    if (f.supportEmail)
        contactBits.push(
            `<a href="mailto:${esc(f.supportEmail)}" style="color:#7c5cff;text-decoration:none;">${esc(f.supportEmail)}</a>`,
        );
    if (f.homepageUrl)
        contactBits.push(
            `<a href="${esc(f.homepageUrl)}" style="color:#7c5cff;text-decoration:none;">${esc(f.homepageUrl.replace(/^https?:\/\//, ""))}</a>`,
        );
    const contact = contactBits.length
        ? `<div style="margin-top:4px;">${contactBits.join(" &nbsp;·&nbsp; ")}</div>`
        : "";

    // Concatenate the brand pieces (not ||, which would keep only the logo).
    const brand = `${logo}${name}${quote}${address}${contact}`;
    const unsub = f.unsubscribeUrl
        ? `<div style="margin-top:10px;"><a href="${esc(f.unsubscribeUrl)}" style="color:#9aa0a6;text-decoration:underline;">Unsubscribe</a></div>`
        : "";
    const startYear = 2024;
    const year = new Date().getFullYear();
    const years = year > startYear ? `${startYear}–${year}` : `${startYear}`;
    // Platform attribution: a small inline Elixpo Mails mark + copyright (subtle,
    // so it doesn't compete with the sender's own brand above).
    const platform = `<div style="margin-top:16px;padding-top:13px;border-top:1px solid #e8e8ee;color:#b6bcc4;font-size:11px;">
<img src="https://mails.elixpo.com/logo.png" alt="" width="14" height="14" style="width:14px;height:14px;vertical-align:middle;opacity:0.65;margin-right:6px;">Sent with <a href="https://mails.elixpo.com" style="color:#9aa0a6;text-decoration:none;font-weight:700;">Elixpo Mails</a> &nbsp;·&nbsp; © ${years} Elixpo Mails
</div>`;
    return `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
<tr><td style="padding:18px 24px 16px;text-align:center;font-family:Arial,Helvetica,sans-serif;color:#9aa0a6;font-size:12px;line-height:1.6;">
${brand}
${unsub}
${platform}
</td></tr>
</table>`;
}

/**
 * Allow only a safe colour literal in the email's inline styles: a #hex (3/6/8)
 * or a basic CSS colour keyword. Anything else → null (caller uses the default),
 * so a stored value can never break out of the style attribute.
 */
export function sanitizeColor(value?: string | null): string | null {
    if (!value) return null;
    const v = value.trim();
    if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) return v;
    if (/^[a-zA-Z]{3,20}$/.test(v)) return v.toLowerCase(); // named colour (white, transparent, …)
    return null;
}

/** Cheap HTML → plain-text fallback for the multipart/alternative text part. */
export function htmlToText(html: string): string {
    return html
        .replace(/<\s*(br|\/p|\/div|\/h[1-6]|\/li)\s*>/gi, "\n")
        .replace(/<li[^>]*>/gi, "• ")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, "\n\n")
        .split("\n")
        .map((l) => l.trim())
        .join("\n")
        .trim();
}
