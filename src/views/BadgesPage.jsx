'use client';

import AppShell from '../components/AppShell';
import { CreatorBadgeMark } from '../components/CreatorBadge';
import { CREATOR_BADGES } from '../../lib/badgeDefinitions';

const CATEGORY_COPY = {
  'Getting started': 'The first milestones that help a new creator complete their profile and begin publishing.',
  Writing: 'Achievements for publishing consistently and developing substantial bodies of work.',
  'Reader impact': 'Qualified, deduplicated audience activity. Self-activity and suspicious traffic do not count.',
  Collaboration: 'Recognition for creating published work with other writers.',
  Community: 'Achievements for starting and participating in useful reader conversations.',
  Publication: 'Recognition for building healthy multi-author publications.',
  Recognition: 'Badges awarded directly by the LixBlogs team.',
};

export default function BadgesPage() {
  const categories = [...new Set(CREATOR_BADGES.map((badge) => badge.category))];
  return (
    <AppShell>
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
        <header className="max-w-2xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#9b7bf7]">Creator programme</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>Creator badges</h1>
          <p className="mt-4 text-[15px] leading-7" style={{ color: 'var(--text-muted)' }}>
            Badges recognize publishing milestones, reader impact, collaboration, and community work. Awards are attached automatically but hidden by default—you decide which ones appear publicly.
          </p>
        </header>

        <section className="mt-8 grid gap-3 sm:grid-cols-3">
          {[
            ['Private by default', 'A newly earned badge is visible only to you until you choose to show it.'],
            ['Qualified activity', 'Self-views, known bots, removed work, and suspicious repeated events are excluded.'],
            ['Creator controlled', 'Show or hide any award and pin up to three badges on your profile.'],
          ].map(([title, copy]) => (
            <div key={title} className="rounded-2xl p-5" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
              <h2 className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
              <p className="mt-2 text-[12px] leading-5" style={{ color: 'var(--text-muted)' }}>{copy}</p>
            </div>
          ))}
        </section>

        <div className="mt-12 space-y-12">
          {categories.map((category) => (
            <section key={category}>
              <div className="mb-5">
                <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{category}</h2>
                <p className="mt-1 text-[13px]" style={{ color: 'var(--text-muted)' }}>{CATEGORY_COPY[category]}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {CREATOR_BADGES.filter((badge) => badge.category === category).map((badge) => (
                  <article key={badge.id} className="flex gap-4 rounded-2xl p-4" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
                    <CreatorBadgeMark badge={badge} size={46} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>{badge.name}</h3>
                        <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ color: 'var(--accent)', backgroundColor: 'var(--accent-subtle)' }}>{badge.difficulty}</span>
                      </div>
                      <p className="mt-1.5 text-[12px] leading-5" style={{ color: 'var(--text-muted)' }}>{badge.description}</p>
                      <span className="mt-2 inline-flex rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-faint)', backgroundColor: 'var(--bg-elevated)' }}>{category}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="mt-12 rounded-2xl p-6" style={{ backgroundColor: 'var(--accent-subtle)', border: '1px solid color-mix(in srgb, var(--accent) 24%, var(--border-default))' }}>
          <h2 className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>Choose what represents you</h2>
          <p className="mt-2 text-[13px] leading-6" style={{ color: 'var(--text-muted)' }}>
            Earned badges start private. Open your profile settings to show the awards you want visitors to see and pin up to three as profile highlights.
          </p>
        </section>
      </main>
    </AppShell>
  );
}
