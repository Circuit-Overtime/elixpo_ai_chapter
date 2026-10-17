/**
 * Base email layout — bright, content-focused, no full-page dark background.
 * Content sits in a clean card on a subtle bg, not edge-to-edge darkness.
 */
export function baseLayout({ title, body, preheader = '' }) {
  const { text: quoteText, author: quoteAuthor } = pickQuote();

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${escHtml(title)}</title>
  <!--[if mso]>
  <style>body,table,td{font-family:Arial,Helvetica,sans-serif!important}</style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f0f0f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#1a1a2e;-webkit-text-size-adjust:100%">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escHtml(preheader)}${'&zwnj;&nbsp;'.repeat(30)}</div>` : ''}

  <!-- Outer wrapper — just enough bg to frame the card -->
  <div style="max-width:520px;margin:0 auto;padding:32px 16px">

    <!-- Logo -->
    <div style="text-align:center;padding-bottom:24px">
      <img src="https://res.cloudinary.com/ds4qzqb4y/image/upload/v1774950476/lixblogs/logo-dark.png" alt="LixBlogs" width="32" height="32" style="display:inline-block;border-radius:8px;vertical-align:middle" />
      <span style="font-size:18px;font-weight:700;color:#1a1a2e;letter-spacing:-0.3px;vertical-align:middle;margin-left:8px">LixBlogs</span>
    </div>

    <!-- Card -->
    <div style="background-color:#ffffff;border-radius:16px;border:1px solid #e2e2ea;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06)">

      <!-- Accent line -->
      <div style="height:3px;background:linear-gradient(90deg,#9b7bf7 0%,#60a5fa 50%,#4ade80 100%)"></div>

      <!-- Body -->
      <div style="padding:36px 32px 32px">
        ${body}
      </div>
    </div>

    <!-- Quote -->
    <div style="text-align:center;padding:24px 0 16px">
      <div style="display:inline-block;text-align:left;border-left:3px solid #9b7bf7;padding:10px 16px;max-width:400px">
        <p style="margin:0;font-size:12px;color:#7a7a8e;line-height:1.55;font-style:italic">&ldquo;${quoteText}&rdquo;</p>
        <p style="margin:4px 0 0;font-size:11px;color:#a0a0b0;font-weight:600">&mdash; ${quoteAuthor}</p>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:8px 0 0">
      <p style="margin:0;font-size:11px;color:#a0a0b0;line-height:1.6">
        You received this because of your account on
        <a href="https://blogs.elixpo.com" style="color:#9b7bf7;text-decoration:none">LixBlogs</a>.
      </p>
      <p style="margin:4px 0 0;font-size:11px;color:#c0c0cc">
        &copy; ${new Date().getFullYear()} Elixpo &middot;
        <a href="https://blogs.elixpo.com/about" style="color:#a0a0b0;text-decoration:none">About</a> &middot;
        <a href="https://blogs.elixpo.com/settings?tab=notifications" style="color:#a0a0b0;text-decoration:none">Unsubscribe</a>
      </p>
    </div>

  </div>
</body>
</html>`;
}

// ─── Quotes ─────────────────────────────────────────────────────────────
const QUOTES = [
  { text: 'The scariest moment is always just before you start.', author: 'Stephen King' },
  { text: 'Start writing, no matter what. The water does not flow until the faucet is turned on.', author: 'Louis L\'Amour' },
  { text: 'There is no greater agony than bearing an untold story inside you.', author: 'Maya Angelou' },
  { text: 'You can always edit a bad page. You can\'t edit a blank page.', author: 'Jodi Picoult' },
  { text: 'A writer is someone for whom writing is more difficult than it is for other people.', author: 'Thomas Mann' },
  { text: 'If you want to be a writer, you must do two things above all others: read a lot and write a lot.', author: 'Stephen King' },
  { text: 'The first draft is just you telling yourself the story.', author: 'Terry Pratchett' },
  { text: 'Write what should not be forgotten.', author: 'Isabel Allende' },
  { text: 'We write to taste life twice, in the moment and in retrospect.', author: 'Anaïs Nin' },
  { text: 'Either write something worth reading or do something worth writing.', author: 'Benjamin Franklin' },
  { text: 'Ideas are like rabbits. You get a couple and learn how to handle them, and pretty soon you have a dozen.', author: 'John Steinbeck' },
  { text: 'One day I will find the right words, and they will be simple.', author: 'Jack Kerouac' },
  { text: 'Fill your paper with the breathings of your heart.', author: 'William Wordsworth' },
  { text: 'Writing is thinking on paper.', author: 'William Zinsser' },
  { text: 'All you have to do is write one true sentence. Write the truest sentence that you know.', author: 'Ernest Hemingway' },
];

function pickQuote() {
  const day = Math.floor(Date.now() / 86400000);
  return QUOTES[day % QUOTES.length];
}

// ─── Helpers ────────────────────────────────────────────────────────────

export function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function ctaButton(text, href) {
  return `
    <div style="text-align:center;margin:24px 0 8px">
      <a href="${escHtml(href)}" style="display:inline-block;background-color:#9b7bf7;border-radius:8px;padding:12px 32px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none">
        ${escHtml(text)}
      </a>
    </div>`;
}

export function buttonRow(primary, secondary) {
  return `
    <div style="text-align:center;margin:24px 0 8px">
      <a href="${escHtml(primary.href)}" style="display:inline-block;background-color:#9b7bf7;border-radius:8px;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none">${escHtml(primary.text)}</a>
      &nbsp;
      <a href="${escHtml(secondary.href)}" style="display:inline-block;border:1px solid #d8d8e4;border-radius:8px;padding:12px 28px;background-color:#f7f7fa;color:#3a3a50;font-size:14px;font-weight:600;text-decoration:none">${escHtml(secondary.text)}</a>
    </div>`;
}

export function secondaryLink(text, href) {
  return `<a href="${escHtml(href)}" style="color:#9b7bf7;font-size:13px;text-decoration:none">${escHtml(text)}</a>`;
}

export function muted(text) {
  return `<p style="margin:14px 0 0;font-size:12px;color:#a0a0b0;line-height:1.5;text-align:center">${text}</p>`;
}

export function divider() {
  return `<div style="height:1px;background-color:#ececf0;margin:24px 0"></div>`;
}

export function avatar(url, name, size = 40) {
  if (url) {
    return `<img src="${escHtml(url)}" alt="" width="${size}" height="${size}" style="border-radius:50%;display:inline-block;object-fit:cover;border:2px solid #ececf0" />`;
  }
  const initial = (name || '?')[0].toUpperCase();
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background-color:#f0f0f3;border:2px solid #ececf0;color:#7a7a8e;font-size:${Math.round(size * 0.4)}px;font-weight:700;line-height:${size}px;text-align:center;display:inline-block">${initial}</div>`;
}
