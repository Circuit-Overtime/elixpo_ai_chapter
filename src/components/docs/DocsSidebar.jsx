'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { docsNav } from '../../config/docsNav';

export default function DocsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:block w-56 flex-shrink-0 sticky top-20 self-start max-h-[calc(100vh-6rem)] overflow-y-auto pr-4">
      {docsNav.map((section) => (
        <div key={section.title} className="mb-6">
          <h4
            className="text-[11px] font-bold uppercase tracking-wide mb-2"
            style={{ color: 'var(--text-muted)' }}
          >
            {section.title}
          </h4>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const href = `/docs/${item.slug}`;
              const active = pathname === href;
              return (
                <li key={item.slug}>
                  <Link
                    href={href}
                    className="block text-[13px] px-2 py-1.5 rounded-md transition-colors"
                    style={{
                      color: active ? 'var(--accent)' : 'var(--text-muted)',
                      backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                      fontWeight: active ? 600 : 400,
                      borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                    }}
                  >
                    {item.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </aside>
  );
}
