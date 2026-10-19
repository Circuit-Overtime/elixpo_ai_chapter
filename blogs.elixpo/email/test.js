/**
 * Email template test runner.
 *
 * Usage:
 *   node email/test.js                     # Preview all templates (writes HTML files)
 *   node email/test.js --send <template>   # Send a specific template to GMAIL_USER
 *
 * Templates: org-invite, blog-invite, welcome, notification
 *
 * Requires .env:
 *   GMAIL_USER=you@gmail.com
 *   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
 */

import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'fs';
import { sendEmail } from './send.js';
import { orgInvite } from './templates/org-invite.js';
import { blogInvite } from './templates/blog-invite.js';
import { welcome } from './templates/welcome.js';
import { notification } from './templates/notification.js';

// ── Sample data ──
const SAMPLES = {
  'org-invite': () => orgInvite({
    orgName: 'Elixpo',
    orgSlug: 'elixpo',
    orgLogoUrl: '',
    inviterName: 'selenium-cutlet',
    inviterAvatar: 'https://lh3.googleusercontent.com/a/ACg8ocJlCSczaUeHuK0Vu79xKBwghqBj60V9evGwmf0aO_k36BCZ1aE=s96-c',
    recipientName: 'Ada Lovelace',
    recipientAvatar: '',
    role: 'write',
    inviteUrl: 'https://blogs.elixpo.com/org/join/abc123',
    declineUrl: 'https://blogs.elixpo.com/org/join/abc123?decline=1',
  }),

  'blog-invite': () => blogInvite({
    blogTitle: 'Building AI-Powered Editors',
    blogEmoji: '',
    inviterName: 'selenium-cutlet',
    inviterAvatar: 'https://lh3.googleusercontent.com/a/ACg8ocJlCSczaUeHuK0Vu79xKBwghqBj60V9evGwmf0aO_k36BCZ1aE=s96-c',
    recipientName: 'Ada Lovelace',
    recipientAvatar: '',
    role: 'editor',
    editUrl: 'https://blogs.elixpo.com/edit/abc123',
    declineUrl: 'https://blogs.elixpo.com/edit/abc123?decline=1',
  }),

  'welcome': () => welcome({
    displayName: 'selenium-cutlet',
    username: 'selenium-cutlet',
    avatarUrl: 'https://lh3.googleusercontent.com/a/ACg8ocJlCSczaUeHuK0Vu79xKBwghqBj60V9evGwmf0aO_k36BCZ1aE=s96-c',
  }),

  'notification-published': () => notification({
    type: 'blog_published',
    actorName: 'Elixpo',
    actorAvatar: '',
    blogTitle: 'Introducing LixBlogs 2.0',
    blogSubtitle: 'A complete rewrite with organizations, collaborative editing, and AI-powered writing.',
    blogCover: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600&h=300&fit=crop',
    blogTags: ['Announcement', 'Product', 'Open Source'],
    blogReadTime: 5,
    actionUrl: 'https://blogs.elixpo.com/elixpo/introducing-lixblogs-2',
  }),

  'notification-org-created': () => notification({
    type: 'org_created',
    actorName: 'selenium-cutlet',
    actorAvatar: 'https://lh3.googleusercontent.com/a/ACg8ocJlCSczaUeHuK0Vu79xKBwghqBj60V9evGwmf0aO_k36BCZ1aE=s96-c',
    orgName: 'Elixpo',
    orgSlug: 'elixpo',
    orgDescription: 'Building tools for the modern web. Open source, collaborative, and creative.',
    orgLogoUrl: '',
    memberCount: 1,
    actionUrl: 'https://blogs.elixpo.com/elixpo',
  }),
};

// ── CLI ──
const args = process.argv.slice(2);
const sendMode = args.includes('--send');
const templateArg = args.find(a => !a.startsWith('--'));

async function main() {
  if (sendMode) {
    // Send a specific template
    const key = templateArg || 'welcome';
    const gen = SAMPLES[key];
    if (!gen) {
      console.error(`Unknown template: ${key}`);
      console.error(`Available: ${Object.keys(SAMPLES).join(', ')}`);
      process.exit(1);
    }

    const to = process.env.SMTP_FROM_EMAIL;
    if (!to) {
      console.error('Set SMTP_FROM_EMAIL in .env to send test emails');
      process.exit(1);
    }

    const { subject, html } = gen();
    console.log(`Sending "${key}" to ${to}...`);
    const result = await sendEmail({ to, subject, html });

    if (result.ok) {
      console.log(`Sent! Message ID: ${result.messageId || '(mailchannels)'}`);
    } else {
      console.error(`Failed: ${result.error}`);
      process.exit(1);
    }
    return;
  }

  // Preview mode: write all templates to email/preview/
  const dir = new URL('./preview', import.meta.url).pathname;
  mkdirSync(dir, { recursive: true });

  for (const [name, gen] of Object.entries(SAMPLES)) {
    const { subject, html } = gen();
    const path = `${dir}/${name}.html`;
    writeFileSync(path, html);
    console.log(`  ${name}.html  —  "${subject}"`);
  }

  console.log(`\nPreview files written to email/preview/`);
  console.log(`Open them in a browser to check the design.`);
  console.log(`\nTo send a test email:  node email/test.js --send <template>`);
}

main().catch(e => { console.error(e); process.exit(1); });
