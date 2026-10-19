import AppShell from '../../src/components/AppShell';

export const metadata = {
  title: 'Help',
  description: 'Get help with LixBlogs — contact support or report an issue.',
  alternates: { canonical: 'https://blogs.elixpo.com/help' },
};

export default function HelpPage() {
  return (
    <AppShell>
      <div className="w-full max-w-3xl mx-auto px-6 py-20 flex flex-col items-center text-center">
        <div className="h-14 w-14 rounded-2xl flex items-center justify-center mb-5" style={{ backgroundColor: 'var(--accent-subtle, rgba(155,123,247,0.1))' }}>
          <ion-icon name="help-buoy-outline" style={{ fontSize: '28px', color: '#9b7bf7' }} />
        </div>
        <h1 className="text-3xl font-extrabold mb-2" style={{ color: 'var(--text-primary)' }}>Help &amp; support</h1>
        <p className="text-[15px] mb-8 max-w-md" style={{ color: 'var(--text-muted)' }}>
          Need a hand, found a bug, or have a feature idea? Reach us either way:
        </p>

        <div className="grid gap-4 sm:grid-cols-2 w-full text-left">
          <a
            href="mailto:hello@elixpo.com"
            className="block rounded-2xl p-5 transition-colors"
            style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}
          >
            <div className="h-10 w-10 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: 'var(--accent-subtle, rgba(155,123,247,0.1))' }}>
              <ion-icon name="mail-outline" style={{ fontSize: '20px', color: '#9b7bf7' }} />
            </div>
            <p className="text-[15px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Email us</p>
            <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>hello@elixpo.com — we usually reply within a day.</p>
          </a>

          <a
            href="https://github.com/elixpo/blogs.elixpo/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-2xl p-5 transition-colors"
            style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}
          >
            <div className="h-10 w-10 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: 'var(--bg-elevated)' }}>
              <ion-icon name="logo-github" style={{ fontSize: '20px', color: 'var(--text-primary)' }} />
            </div>
            <p className="text-[15px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Open a GitHub issue</p>
            <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Report a bug or request a feature on the public tracker.</p>
          </a>
        </div>

        <p className="text-[13px] mt-8" style={{ color: 'var(--text-faint)' }}>
          See also our <a href="/docs" className="underline">docs</a>, <a href="/privacy" className="underline">privacy policy</a>, and <a href="/terms" className="underline">terms</a>.
        </p>
      </div>
    </AppShell>
  );
}
