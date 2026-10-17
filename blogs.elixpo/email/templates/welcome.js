import { baseLayout, buttonRow, muted, escHtml } from './base.js';

/**
 * Welcome email — bright, center-aligned, compact feature cards.
 */
export function welcome(data) {
  const { displayName, username, avatarUrl } = data;
  const name = displayName || username;

  const subject = `Welcome to LixBlogs, ${name}!`;

  const body = `
    <div style="text-align:center">

      ${avatarUrl
        ? `<img src="${escHtml(avatarUrl)}" alt="" width="68" height="68" style="display:inline-block;border-radius:50%;border:2px solid #ececf0;object-fit:cover" />`
        : `<div style="display:inline-block;width:68px;height:68px;border-radius:50%;background-color:#f0f0f3;border:2px solid #ececf0;color:#7a7a8e;font-size:26px;font-weight:700;line-height:68px">${(name || '?')[0].toUpperCase()}</div>`
      }

      <p style="margin:18px 0 4px;font-size:22px;font-weight:800;color:#1a1a2e;letter-spacing:-0.3px">Welcome aboard, ${escHtml(name)}!</p>
      <p style="margin:0 0 28px;font-size:15px;color:#7a7a8e;line-height:1.6">
        Your LixBlogs account is ready. Here's what you can do next.
      </p>

      ${feature('Write your first blog', 'Block editor with AI, images, code blocks, and more.')}
      ${feature('Create an organization', 'Invite your team, create collections, publish together.')}
      ${feature('Complete your profile', 'Add a bio, location, links, and pronouns.')}

      ${buttonRow(
        { text: 'Start Writing', href: 'https://blogs.elixpo.com/new-blog' },
        { text: 'Visit Profile', href: `https://blogs.elixpo.com/${username}` },
      )}

      ${muted(`Your profile: <a href="https://blogs.elixpo.com/${escHtml(username)}" style="color:#9b7bf7;text-decoration:none">blogs.elixpo.com/${escHtml(username)}</a>`)}
    </div>
  `;

  return {
    subject,
    html: baseLayout({ title: subject, body, preheader: `Your LixBlogs account is ready. Start writing!` }),
  };
}

function feature(title, desc) {
  return `
    <div style="display:inline-block;text-align:left;width:100%;max-width:400px;background-color:#f7f7fa;border:1px solid #ececf0;border-radius:8px;padding:14px 18px;margin-bottom:8px">
      <p style="margin:0;font-size:14px;font-weight:600;color:#1a1a2e">${title}</p>
      <p style="margin:4px 0 0;font-size:12px;color:#7a7a8e;line-height:1.5">${desc}</p>
    </div><br/>`;
}
