import { baseLayout, escHtml, ctaButton, muted } from './base.js';

/**
 * Blog removed (moderation takedown) email.
 * @param {object} data
 * @param {string} data.displayName
 * @param {string} data.title - the removed blog's title
 */
export function blogRemoved(data) {
  const body = `
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#1a1a2e">Your post was removed</h1>
    <p style="margin:0 0 20px;font-size:14px;color:#6a6a7e;line-height:1.6">
      Hi ${escHtml(data.displayName || 'there')}, your post
      "<strong>${escHtml(data.title || 'your post')}</strong>" has been removed following a
      moderation review for violating our community guidelines.
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:#6a6a7e;line-height:1.6">
      The post and its content have been permanently deleted. Repeated violations may lead to
      further action on your account.
    </p>
    ${ctaButton('Read the Community Guidelines', 'https://blogs.elixpo.com/about')}
    ${muted('If you believe this was a mistake, reply to this email to appeal.')}
  `;

  return {
    subject: 'Your LixBlogs post was removed',
    html: baseLayout({ title: 'Post Removed', body, preheader: 'Your post was removed for violating community guidelines.' }),
  };
}
