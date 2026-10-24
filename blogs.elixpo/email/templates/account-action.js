import { baseLayout, escHtml, ctaButton, muted } from './base.js';

/**
 * Account disable email.
 * @param {object} data
 * @param {string} data.displayName
 */
export function accountDisabled(data) {
  const body = `
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#1a1a2e">Account disabled</h1>
    <p style="margin:0 0 20px;font-size:14px;color:#6a6a7e;line-height:1.6">
      Hi ${escHtml(data.displayName || 'there')}, your LixBlogs account has been disabled as requested.
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:#6a6a7e;line-height:1.6">
      Your profile and blogs are now hidden from other users. You can reactivate your account at any time by simply signing back in.
    </p>
    ${ctaButton('Reactivate Account', 'https://blogs.elixpo.com/sign-in')}
    ${muted('If you did not request this, please sign in immediately to secure your account.')}
  `;

  return {
    subject: 'Your LixBlogs account has been disabled',
    html: baseLayout({ title: 'Account Disabled', body, preheader: 'Your account has been disabled — sign back in to reactivate.' }),
  };
}

/**
 * Account deletion email.
 * @param {object} data
 * @param {string} data.displayName
 */
export function accountDeleted(data) {
  const body = `
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#1a1a2e">Account deleted</h1>
    <p style="margin:0 0 20px;font-size:14px;color:#6a6a7e;line-height:1.6">
      Hi ${escHtml(data.displayName || 'there')}, your LixBlogs account has been permanently deleted as requested.
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:#6a6a7e;line-height:1.6">
      All your blogs, comments, and personal data have been removed. This action cannot be undone.
    </p>
    <p style="margin:0 0 4px;font-size:14px;color:#6a6a7e;line-height:1.6">
      We're sorry to see you go. If you ever want to come back, you can create a new account at any time.
    </p>
    ${ctaButton('Visit LixBlogs', 'https://blogs.elixpo.com')}
    ${muted('This is the last email you will receive from us.')}
  `;

  return {
    subject: 'Your LixBlogs account has been deleted',
    html: baseLayout({ title: 'Account Deleted', body, preheader: 'Your LixBlogs account and data have been permanently removed.' }),
  };
}
