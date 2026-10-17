import { baseLayout, ctaButton, buttonRow, muted, divider, escHtml } from './base.js';

/**
 * Email notification templates — only for significant events worth emailing.
 *
 * Types: blog_published, org_created
 *
 * Follower/comment/like notifications are in-app only, not emailed.
 */
export function notification(data) {
  const { type } = data;

  switch (type) {
    case 'blog_published': return publishedEmail(data);
    case 'org_created': return orgCreatedEmail(data);
    default: return publishedEmail(data);
  }
}

// ─── Blog Published ─────────────────────────────────────────────────────
function publishedEmail(data) {
  const { actorName, actorAvatar, blogTitle, blogSubtitle, blogCover, blogTags, blogReadTime, actionUrl } = data;
  const tags = blogTags || [];

  const subject = `${actorName} published "${blogTitle}"`;

  const body = `
    <div style="text-align:center">

      ${circleAvatar(actorAvatar, actorName, 48)}

      <p style="margin:14px 0 2px;font-size:11px;color:#a0a0b0;font-weight:600;text-transform:uppercase;letter-spacing:1px">New Post</p>
      <p style="margin:0 0 24px;font-size:15px;color:#5a5a70">
        <strong style="color:#1a1a2e">${escHtml(actorName)}</strong> published a new blog
      </p>

      ${blogCard({ blogTitle, blogSubtitle, blogCover, blogTags: tags, blogReadTime, actorName })}

      ${ctaButton('Read Post', actionUrl)}

      ${muted('Manage notifications in <a href="https://blogs.elixpo.com/settings?tab=notifications" style="color:#9b7bf7;text-decoration:none">Settings</a>.')}
    </div>
  `;

  return {
    subject,
    html: baseLayout({ title: subject, body, preheader: `${actorName} published "${blogTitle}"` }),
  };
}

// ─── Org Created ────────────────────────────────────────────────────────
function orgCreatedEmail(data) {
  const { orgName, orgSlug, orgDescription, orgLogoUrl, actorName, actorAvatar, memberCount, actionUrl } = data;

  const subject = `${actorName} created a new organization: ${orgName}`;

  const body = `
    <div style="text-align:center">

      ${squareAvatar(orgLogoUrl, orgName, 64)}

      <p style="margin:16px 0 2px;font-size:20px;font-weight:700;color:#1a1a2e">${escHtml(orgName)}</p>
      <p style="margin:0 0 4px;font-size:13px;color:#a0a0b0">@${escHtml(orgSlug)}</p>

      ${orgDescription ? `<p style="margin:12px auto 0;font-size:13px;color:#5a5a70;line-height:1.55;max-width:380px">${escHtml(orgDescription)}</p>` : ''}

      <div style="display:inline-block;margin:20px 0;padding:10px 20px;background-color:#f7f7fa;border:1px solid #ececf0;border-radius:24px">
        ${circleAvatar(actorAvatar, actorName, 22)}
        <span style="font-size:13px;color:#5a5a70;vertical-align:middle;margin-left:6px">Created by <strong style="color:#1a1a2e">${escHtml(actorName)}</strong></span>
      </div>

      ${memberCount ? `<p style="margin:0 0 4px;font-size:12px;color:#a0a0b0">${memberCount} member${memberCount !== 1 ? 's' : ''}</p>` : ''}

      ${divider()}

      <p style="margin:0;font-size:13px;color:#7a7a8e;line-height:1.6">
        You're receiving this because you follow <strong style="color:#3a3a50">@${escHtml(actorName)}</strong>.
        <br/>Check out their new organization and its upcoming publications.
      </p>

      ${buttonRow(
        { text: 'View Organization', href: actionUrl },
        { text: 'View Profile', href: `https://blogs.elixpo.com/${actorName}` },
      )}

      ${muted('Manage notifications in <a href="https://blogs.elixpo.com/settings?tab=notifications" style="color:#9b7bf7;text-decoration:none">Settings</a>.')}
    </div>
  `;

  return {
    subject,
    html: baseLayout({ title: subject, body, preheader: `${actorName} created ${orgName} on LixBlogs` }),
  };
}

// ─── Shared: Blog Card ──────────────────────────────────────────────────
function blogCard({ blogTitle, blogSubtitle, blogCover, blogTags = [], blogReadTime, actorName }) {
  return `
    <div style="display:inline-block;text-align:left;width:100%;max-width:440px;background-color:#f7f7fa;border:1px solid #ececf0;border-radius:12px;overflow:hidden;margin-bottom:20px">
      ${blogCover ? `<img src="${escHtml(blogCover)}" alt="" width="440" style="display:block;width:100%;height:160px;object-fit:cover" />` : ''}
      <div style="padding:18px 20px">
        <p style="margin:0;font-size:17px;font-weight:700;color:#1a1a2e;line-height:1.35">${escHtml(blogTitle || 'Untitled')}</p>
        ${blogSubtitle ? `<p style="margin:5px 0 0;font-size:13px;color:#7a7a8e;line-height:1.45">${escHtml(blogSubtitle)}</p>` : ''}
        <p style="margin:10px 0 0;font-size:12px;color:#a0a0b0">
          by <strong style="color:#5a5a70">@${escHtml(actorName)}</strong>${blogReadTime ? ` &middot; ${blogReadTime} min read` : ''}
        </p>
        ${blogTags.length > 0 ? `
        <div style="margin-top:12px">
          ${blogTags.map(t => `<span style="display:inline-block;padding:3px 10px;background-color:#ffffff;border:1px solid #e2e2ea;border-radius:12px;font-size:11px;color:#5a5a70;margin:0 4px 4px 0">${escHtml(t)}</span>`).join('')}
        </div>` : ''}
      </div>
    </div>`;
}

// ─── Avatar helpers ─────────────────────────────────────────────────────
function circleAvatar(url, name, size) {
  if (url) {
    return `<img src="${escHtml(url)}" alt="${escHtml(name)}" width="${size}" height="${size}" style="display:inline-block;border-radius:50%;border:2px solid #ececf0;object-fit:cover" />`;
  }
  const initial = (name || '?')[0].toUpperCase();
  return `<div style="display:inline-block;width:${size}px;height:${size}px;border-radius:50%;background-color:#f0f0f3;border:2px solid #ececf0;color:#7a7a8e;font-size:${Math.round(size * 0.36)}px;font-weight:700;line-height:${size}px;text-align:center">${initial}</div>`;
}

function squareAvatar(url, name, size) {
  if (url) {
    return `<img src="${escHtml(url)}" alt="${escHtml(name)}" width="${size}" height="${size}" style="display:inline-block;border-radius:14px;border:2px solid #ececf0;object-fit:cover" />`;
  }
  const initial = (name || '?')[0].toUpperCase();
  return `<div style="display:inline-block;width:${size}px;height:${size}px;border-radius:14px;background-color:#f0f0f3;border:2px solid #ececf0;color:#7a7a8e;font-size:${Math.round(size * 0.36)}px;font-weight:700;line-height:${size}px;text-align:center">${initial}</div>`;
}
