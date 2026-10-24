import Link from 'next/link';
import AppShell from '../components/AppShell';

const FEATURES = [
  {
    icon: 'create-outline',
    title: 'Rich Block Editor',
    desc: 'A Notion-style WYSIWYG editor with 20+ block types — code, equations, diagrams, embeds, images, and more.',
  },
  {
    icon: 'terminal-outline',
    title: 'CLI & API Publishing',
    desc: 'Draft, revise and publish through the browser or automate a complete editorial workflow with the supported CLI and API.',
  },
  {
    icon: 'people-outline',
    title: 'Real-Time Collaboration',
    desc: 'Invite co-authors to edit together in real-time with presence indicators and conflict-free merging.',
  },
  {
    icon: 'business-outline',
    title: 'Organizations',
    desc: 'Create teams with roles and collections. Publish under your org brand with shared contributor access.',
  },
  {
    icon: 'cloud-done-outline',
    title: 'Auto-Save & Cloud Sync',
    desc: 'Your drafts save locally and sync to the cloud automatically. Never lose a word.',
  },
  {
    icon: 'color-palette-outline',
    title: 'Theming & Customization',
    desc: 'Light and dark modes, custom page colors, cover images with zoom and pan, and page emojis.',
  },
];

const STATS = [
  { icon: 'cube-outline', value: '20+', label: 'Block types' },
  { icon: 'terminal-outline', value: '3', label: 'Publishing interfaces' },
  { icon: 'git-merge-outline', value: 'Real-time', label: 'Collaboration' },
  { icon: 'globe-outline', value: 'Edge', label: 'Deployed globally' },
];

export default function AboutPage() {
  return (
    <AppShell>
      <div className="max-w-[860px] mx-auto px-6 py-16">

        {/* Hero */}
        <section className="text-center mb-20">
          <div
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[12px] font-medium mb-6"
            style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent)' }}
          >
            <ion-icon name="sparkles-outline" style={{ fontSize: '14px' }} />
            Open blogging platform
          </div>
          <h1
            className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight mb-5"
            style={{ color: 'var(--text-primary)' }}
          >
            Write, collaborate, and<br />
            <span style={{ color: 'var(--accent)' }}>publish beautifully</span>
          </h1>
          <p
            className="text-[16px] leading-relaxed max-w-[540px] mx-auto mb-8"
            style={{ color: 'var(--text-muted)' }}
          >
            LixBlogs is an open-source publishing platform with a rich block
            editor, real-time collaboration, organizations, and first-class
            web, CLI, and API workflows.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/new-blog"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-[14px] font-medium text-white bg-[#9b7bf7] hover:bg-[#8b6ae6] transition-colors"
            >
              <ion-icon name="create-outline" style={{ fontSize: '16px' }} />
              Start writing
            </Link>
            <Link
              href="/explore"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-[14px] font-medium transition-colors"
              style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}
            >
              Explore blogs
            </Link>
          </div>
        </section>

        {/* Stats bar */}
        <section
          className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-2xl p-6 mb-20"
          style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}
        >
          {STATS.map((s, i) => (
            <div key={i} className="flex flex-col items-center gap-2 text-center">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: 'var(--accent-subtle)' }}
              >
                <ion-icon name={s.icon} style={{ fontSize: '20px', color: 'var(--accent)' }} />
              </div>
              <div>
                <p className="text-lg font-bold" style={{ color: 'var(--accent)' }}>{s.value}</p>
                <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
              </div>
            </div>
          ))}
        </section>

        {/* Features grid */}
        <section className="mb-20">
          <h2
            className="text-2xl font-bold mb-2 text-center"
            style={{ color: 'var(--text-primary)' }}
          >
            Everything you need to publish
          </h2>
          <p
            className="text-[14px] text-center mb-10"
            style={{ color: 'var(--text-muted)' }}
          >
            A complete writing toolkit — no plugins, no setup.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className="rounded-xl p-5 transition-colors"
                style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center mb-3.5"
                  style={{ backgroundColor: 'var(--accent-subtle)' }}
                >
                  <ion-icon name={f.icon} style={{ fontSize: '18px', color: 'var(--accent)' }} />
                </div>
                <h3 className="text-[15px] font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                  {f.title}
                </h3>
                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Open source */}
        <section
          className="mb-20 text-center rounded-xl p-8"
          style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: 'var(--accent-subtle)' }}
          >
            <ion-icon name="logo-github" style={{ fontSize: '24px', color: 'var(--accent)' }} />
          </div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Built in the open
          </h2>
          <p className="text-[14px] mb-6 max-w-[420px] mx-auto" style={{ color: 'var(--text-muted)' }}>
            LixBlogs is open source. Explore the codebase, report issues, or contribute on GitHub.
          </p>
          <a
            href="https://github.com/elixpo/blogs.elixpo"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 px-6 py-2.5 rounded-full text-[14px] font-medium transition-colors"
            style={{ backgroundColor: 'var(--text-primary)', color: 'var(--bg-app)' }}
          >
            <ion-icon name="logo-github" style={{ fontSize: '18px' }} />
            View on GitHub
            <ion-icon name="open-outline" style={{ fontSize: '14px', opacity: 0.6 }} />
          </a>
        </section>

        {/* CTA */}
        <section
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(155,123,247,0.12) 0%, rgba(96,165,250,0.08) 100%)',
            border: '1px solid rgba(155,123,247,0.25)',
          }}
        >
          {/* Mock blog post artifact */}
          <div className="px-8 pt-8 pb-0">
            <div
              className="rounded-t-xl overflow-hidden mx-auto max-w-[480px]"
              style={{ backgroundColor: 'var(--bg-app)', border: '1px solid var(--border-default)', borderBottom: 'none' }}
            >
              {/* Mock blog header */}
              <div
                className="h-24 w-full relative"
                style={{ background: 'linear-gradient(135deg, #9b7bf7 0%, #60a5fa 50%, #4ade80 100%)' }}
              >
                <div className="absolute bottom-3 left-4 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-[10px] font-bold text-white">Y</div>
                  <div className="px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-sm text-[10px] text-white font-medium">Draft</div>
                </div>
              </div>
              {/* Mock blog content lines */}
              <div className="px-5 py-4 space-y-3">
                <div className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>My First Blog Post</div>
                <div className="space-y-2">
                  <div className="h-2.5 rounded-full w-full" style={{ backgroundColor: 'var(--bg-elevated)' }} />
                  <div className="h-2.5 rounded-full w-[90%]" style={{ backgroundColor: 'var(--bg-elevated)' }} />
                  <div className="h-2.5 rounded-full w-[75%]" style={{ backgroundColor: 'var(--bg-elevated)' }} />
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3.5 h-3.5 rounded" style={{ backgroundColor: 'var(--accent-subtle)' }} />
                    <div className="h-2 w-12 rounded-full" style={{ backgroundColor: 'var(--bg-elevated)' }} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3.5 h-3.5 rounded" style={{ backgroundColor: 'var(--accent-subtle)' }} />
                    <div className="h-2 w-16 rounded-full" style={{ backgroundColor: 'var(--bg-elevated)' }} />
                  </div>
                </div>
                {/* Mock publishing status line */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--accent-subtle)' }}>
                  <ion-icon name="cloud-done-outline" style={{ fontSize: '12px', color: 'var(--accent)' }} />
                  <div className="h-2 w-32 rounded-full" style={{ backgroundColor: 'rgba(155,123,247,0.2)' }} />
                  <div className="h-2 w-20 rounded-full" style={{ backgroundColor: 'rgba(155,123,247,0.15)' }} />
                </div>
              </div>
            </div>
          </div>

          {/* CTA text */}
          <div className="text-center px-8 pt-6 pb-10">
            <h2 className="text-2xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
              Ready to start writing?
            </h2>
            <p className="text-[14px] mb-6 max-w-[400px] mx-auto" style={{ color: 'var(--text-muted)' }}>
              Create your first blog post in seconds. No credit card, no setup.
            </p>
            <Link
              href="/new-blog"
              className="inline-flex items-center gap-2 px-7 py-3 rounded-full text-[15px] font-medium text-white bg-[#9b7bf7] hover:bg-[#8b6ae6] transition-colors"
            >
              Get started free
              <ion-icon name="arrow-forward-outline" style={{ fontSize: '16px' }} />
            </Link>
          </div>
        </section>

        {/* Footer links */}
        <footer className="mt-16 pt-8 text-center" style={{ borderTop: '1px solid var(--divider)' }}>
          <div className="flex items-center justify-center gap-6 mb-4">
            {[
              { label: 'Home', href: '/' },
              { label: 'Explore', href: '/explore' },
              { label: 'Docs', href: '/docs' },
              { label: 'Pricing', href: '/pricing' },
              { label: 'Privacy', href: '/privacy' },
              { label: 'Terms', href: '/terms' },
            ].map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="text-[13px] transition-colors"
                style={{ color: 'var(--text-faint)' }}
              >
                {l.label}
              </Link>
            ))}
          </div>
          <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
            LixBlogs is an open-source publishing platform by <a href="https://elixpo.com" className="font-semibold hover:text-[var(--accent)]">Elixpo</a>.
          </p>
        </footer>
      </div>
    </AppShell>
  );
}
