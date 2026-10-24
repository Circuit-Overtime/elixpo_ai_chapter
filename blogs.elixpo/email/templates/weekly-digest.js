import { baseLayout, escHtml, ctaButton, divider, avatar, muted } from './base.js';

/**
 * Weekly digest email with top 5 picks.
 * @param {object} data
 * @param {string} data.displayName
 * @param {Array}  data.picks — top 5 blog posts [{ title, slug, authorName, authorAvatar, subtitle, emoji, readTime }]
 * @param {string} data.weekLabel — e.g. "Mar 31 – Apr 6, 2026"
 */
export function weeklyDigest(data) {
  const { displayName, picks = [], weekLabel } = data;

  const postRows = picks.map((p, i) => `
    <tr>
      <td style="padding:16px 0;${i < picks.length - 1 ? 'border-bottom:1px solid #ececf0;' : ''}">
        <a href="https://blogs.elixpo.com/${escHtml(p.authorUsername || 'blog')}/${escHtml(p.slug)}" style="text-decoration:none;display:block">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            ${avatar(p.authorAvatar, p.authorName, 20)}
            <span style="font-size:12px;color:#a0a0b0;font-weight:500">${escHtml(p.authorName)}</span>
          </div>
          <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#1a1a2e;line-height:1.35">
            ${p.emoji ? `${p.emoji} ` : ''}${escHtml(p.title)}
          </p>
          ${p.subtitle ? `<p style="margin:0;font-size:13px;color:#6a6a7e;line-height:1.5">${escHtml(p.subtitle.slice(0, 120))}${p.subtitle.length > 120 ? '...' : ''}</p>` : ''}
          <p style="margin:6px 0 0;font-size:11px;color:#a0a0b0">${p.readTime || 1} min read</p>
        </a>
      </td>
    </tr>
  `).join('');

  const body = `
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#1a1a2e">Your weekly digest</h1>
    <p style="margin:0 0 4px;font-size:14px;color:#6a6a7e;line-height:1.6">
      Hi ${escHtml(displayName || 'there')}, here are the top picks from this week on LixBlogs.
    </p>
    <p style="margin:0 0 24px;font-size:12px;color:#a0a0b0">${escHtml(weekLabel || 'This week')}</p>

    ${picks.length > 0 ? `
      <table style="width:100%;border-collapse:collapse">
        ${postRows}
      </table>

      ${ctaButton('Read More on LixBlogs', 'https://blogs.elixpo.com')}
    ` : `
      <p style="margin:0 0 20px;font-size:14px;color:#6a6a7e;text-align:center">
        No new posts this week — check back next time!
      </p>
    `}

    ${muted('You receive this digest weekly. <a href="https://blogs.elixpo.com/settings?tab=notifications" style="color:#9b7bf7;text-decoration:none">Manage preferences</a>')}
  `;

  return {
    subject: `Top picks this week on LixBlogs — ${weekLabel || 'Weekly Digest'}`,
    html: baseLayout({ title: 'Weekly Digest', body, preheader: picks.length > 0 ? `${picks[0].title} and ${picks.length - 1} more` : 'Your weekly digest from LixBlogs' }),
  };
}
