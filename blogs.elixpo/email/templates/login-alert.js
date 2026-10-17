import { baseLayout, escHtml, ctaButton, muted, divider } from './base.js';

/**
 * Login alert email — sent when a user signs in.
 * @param {object} data
 * @param {string} data.displayName
 * @param {string} data.ip
 * @param {string} data.location  — city/country from IP lookup
 * @param {string} data.userAgent
 * @param {string} data.time      — formatted timestamp
 */
export function loginAlert(data) {
  const { displayName, ip, location, userAgent, time } = data;

  const body = `
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#1a1a2e">New sign-in detected</h1>
    <p style="margin:0 0 20px;font-size:14px;color:#6a6a7e;line-height:1.6">
      Hi ${escHtml(displayName || 'there')}, your LixBlogs account was just signed into.
    </p>

    <div style="background-color:#f7f7fa;border-radius:12px;padding:20px;margin:0 0 20px">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr>
          <td style="padding:6px 0;color:#a0a0b0;width:100px">Time</td>
          <td style="padding:6px 0;color:#1a1a2e;font-weight:500">${escHtml(time)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#a0a0b0">Location</td>
          <td style="padding:6px 0;color:#1a1a2e;font-weight:500">${escHtml(location || 'Unknown')}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#a0a0b0">IP Address</td>
          <td style="padding:6px 0;color:#1a1a2e;font-weight:500">${escHtml(ip || 'Unknown')}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#a0a0b0">Device</td>
          <td style="padding:6px 0;color:#1a1a2e;font-weight:500">${escHtml(simplifyUA(userAgent))}</td>
        </tr>
      </table>
    </div>

    <p style="margin:0 0 4px;font-size:13px;color:#6a6a7e;line-height:1.6">
      If this was you, no action is needed. If you don't recognize this activity, secure your account immediately.
    </p>

    ${ctaButton('Review Account Settings', 'https://blogs.elixpo.com/settings')}
    ${muted('You can manage login notifications in your <a href="https://blogs.elixpo.com/settings?tab=notifications" style="color:#9b7bf7;text-decoration:none">notification settings</a>.')}
  `;

  return {
    subject: 'New sign-in to your LixBlogs account',
    html: baseLayout({ title: 'New Sign-In', body, preheader: `Sign-in from ${location || 'a new location'}` }),
  };
}

function simplifyUA(ua) {
  if (!ua) return 'Unknown device';
  if (ua.includes('Mobile')) return 'Mobile browser';
  if (ua.includes('Chrome')) return 'Chrome browser';
  if (ua.includes('Firefox')) return 'Firefox browser';
  if (ua.includes('Safari')) return 'Safari browser';
  if (ua.includes('Edge')) return 'Edge browser';
  return 'Web browser';
}
