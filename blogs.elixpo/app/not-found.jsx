import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--bg-app)' }}>
      <div className="text-center max-w-md">
        <div className="h-14 w-14 mx-auto rounded-full bg-[url('/logo-mark.png')] bg-cover mb-6 opacity-40" />
        <h1 className="text-7xl font-extrabold mb-2" style={{ color: 'var(--border-default)' }}>404</h1>
        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Page not found</h2>
        <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/" className="px-6 py-2.5 bg-[#9b7bf7] text-white font-semibold rounded-full text-sm hover:bg-[#8b6ae6] transition-colors">
            Go to Feed
          </Link>
          <Link href="/sign-in" className="px-6 py-2.5 font-medium rounded-full text-sm transition-colors" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-muted)' }}>
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
