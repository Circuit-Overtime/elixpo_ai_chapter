import { baseLayout, muted, escHtml } from './base.js';

/**
 * Blog collaboration invite — bright, professional, center-aligned.
 */
export function blogInvite(data) {
  const {
    blogTitle, blogEmoji,
    inviterName, inviterAvatar,
    recipientName, recipientAvatar,
    role, editUrl, declineUrl,
  } = data;

  const roleLabels = { viewer: 'Viewer', editor: 'Editor', admin: 'Admin' };
  const roleLabel = roleLabels[role] || role;
  const displayTitle = blogEmoji ? `${blogEmoji} ${blogTitle}` : blogTitle;

  const subject = `${inviterName} invited you to collaborate on "${blogTitle}"`;

  const body = `
    <div style="text-align:center">

      ${circleAvatar(inviterAvatar, inviterName, 64)}
      <div style="margin:8px 0;font-size:20px;color:#c0c0cc;font-weight:300">+</div>
      ${circleAvatar(recipientAvatar, recipientName, 64)}

      <p style="margin:24px 0 4px;font-size:18px;font-weight:700;color:#1a1a2e">
        @${escHtml(inviterName)} invited you to collaborate
      </p>
      <p style="margin:0 0 20px;font-size:14px;color:#7a7a8e">
        You've been invited as <strong style="color:#3a3a50">${escHtml(roleLabel)}</strong> on a blog post
      </p>

      <!-- Blog title pill -->
      <div style="display:inline-block;background-color:#f7f7fa;border:1px solid #ececf0;border-radius:8px;padding:10px 20px;margin-bottom:24px">
        <span style="font-size:15px;font-weight:700;color:#1a1a2e">${escHtml(displayTitle || 'Untitled')}</span>
        <span style="font-size:12px;color:#a0a0b0;margin-left:6px">by @${escHtml(inviterName)}</span>
      </div>

      <!-- Buttons -->
      <div style="margin-bottom:28px">
        <a href="${escHtml(editUrl)}" style="display:inline-block;background-color:#9b7bf7;border-radius:8px;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none">Accept invitation</a>
        &nbsp;
        <a href="${escHtml(declineUrl || editUrl)}" style="display:inline-block;border:1px solid #d8d8e4;border-radius:8px;padding:12px 28px;background-color:#f7f7fa;color:#3a3a50;font-size:14px;font-weight:600;text-decoration:none">Decline</a>
      </div>

      <div style="height:1px;background-color:#ececf0;margin-bottom:20px"></div>

      <p style="margin:0 0 6px;font-size:12px;color:#a0a0b0">
        As <strong style="color:#7a7a8e">${escHtml(roleLabel)}</strong>, you will be able to:
      </p>
      <p style="margin:0;font-size:13px;color:#7a7a8e;line-height:1.8">
        ${role === 'admin' ? 'Edit, publish, and manage blog settings<br/>' : ''}${role === 'editor' || role === 'admin' ? 'Edit the blog content<br/>' : ''}View the blog in the editor<br/>
        Be credited as a co-author on the published post
      </p>

      ${muted(`If you don't recognize this invitation, you can safely ignore this email.`)}
    </div>
  `;

  return {
    subject,
    html: baseLayout({ title: subject, body, preheader: `@${inviterName} invited you to collaborate on "${blogTitle}"` }),
  };
}

function circleAvatar(url, name, size) {
  if (url) {
    return `<img src="${escHtml(url)}" alt="${escHtml(name)}" width="${size}" height="${size}" style="display:inline-block;border-radius:50%;border:2px solid #ececf0;object-fit:cover" />`;
  }
  const initial = (name || '?')[0].toUpperCase();
  return `<div style="display:inline-block;width:${size}px;height:${size}px;border-radius:50%;background-color:#f0f0f3;border:2px solid #ececf0;color:#7a7a8e;font-size:${Math.round(size * 0.36)}px;font-weight:700;line-height:${size}px;text-align:center">${initial}</div>`;
}
