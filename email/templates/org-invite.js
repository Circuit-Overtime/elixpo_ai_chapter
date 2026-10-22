import { baseLayout, muted, escHtml } from './base.js';

/**
 * Org invite email — bright, professional, center-aligned.
 */
export function orgInvite(data) {
  const {
    orgName, orgSlug, orgLogoUrl,
    inviterName, inviterAvatar,
    recipientName, recipientAvatar,
    role, inviteUrl, declineUrl,
  } = data;

  const roleLabels = { admin: 'Admin', maintain: 'Maintainer', write: 'Writer', read: 'Reader' };
  const roleLabel = roleLabels[role] || role;

  const subject = `${inviterName} invited you to join ${orgName}`;

  const body = `
    <div style="text-align:center">

      ${circleAvatar(recipientAvatar, recipientName, 64)}
      <div style="margin:8px 0;font-size:20px;color:#c0c0cc;font-weight:300">+</div>
      ${squareAvatar(orgLogoUrl, orgName, 64)}

      <p style="margin:24px 0 4px;font-size:18px;font-weight:700;color:#1a1a2e">
        @${escHtml(inviterName)} invited you to collaborate
      </p>
      <p style="margin:0 0 24px;font-size:14px;color:#7a7a8e">
        Join <strong style="color:#3a3a50">${escHtml(orgName)}</strong> as <strong style="color:#3a3a50">${escHtml(roleLabel)}</strong>
      </p>

      <!-- Buttons -->
      <div style="margin-bottom:28px">
        <a href="${escHtml(inviteUrl)}" style="display:inline-block;background-color:#9b7bf7;border-radius:8px;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none">Accept invitation</a>
        &nbsp;
        <a href="${escHtml(declineUrl || inviteUrl)}" style="display:inline-block;border:1px solid #d8d8e4;border-radius:8px;padding:12px 28px;background-color:#f7f7fa;color:#3a3a50;font-size:14px;font-weight:600;text-decoration:none">Decline</a>
      </div>

      <div style="height:1px;background-color:#ececf0;margin-bottom:20px"></div>

      <p style="margin:0 0 6px;font-size:12px;color:#a0a0b0">
        By accepting, <strong style="color:#7a7a8e">${escHtml(orgName)}</strong> members will be able to:
      </p>
      <p style="margin:0;font-size:13px;color:#7a7a8e;line-height:1.8">
        See your public profile information<br/>
        See your published blogs within the organization<br/>
        Assign you the ${escHtml(roleLabel)} role and its permissions
      </p>

      ${muted(`If you don't recognize this invitation, you can safely ignore this email.`)}
    </div>
  `;

  return {
    subject,
    html: baseLayout({ title: subject, body, preheader: `@${inviterName} invited you to join ${orgName}` }),
  };
}

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
