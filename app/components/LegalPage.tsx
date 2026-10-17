import type { ReactNode } from 'react';
import Footer from './Footer';
import Navbar from './Navbar';

export interface LegalSummary {
  title: string;
  detail: string;
}

export interface LegalNavItem {
  id: string;
  label: string;
}

export function LegalPage({
  eyebrow,
  title,
  intro,
  summaries,
  navigation,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  summaries: LegalSummary[];
  navigation: LegalNavItem[];
  children: ReactNode;
}) {
  return (
    <div className="theme-light min-h-screen bg-white text-[#111]">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 md:px-6 md:pt-16">
        <header className="max-w-3xl">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#c62828]">
            {eyebrow}
          </p>
          <h1 className="text-4xl font-extrabold tracking-[-0.04em] text-[#111] md:text-6xl">
            {title}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[#555] md:text-lg">
            {intro}
          </p>
        </header>

        <section aria-label="At a glance" className="mt-10 grid gap-3 md:grid-cols-3">
          {summaries.map((item) => (
            <div key={item.title} className="rounded-2xl border border-[#e7e7e7] bg-[#fafafa] p-5">
              <h2 className="text-sm font-bold text-[#111]">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[#666]">{item.detail}</p>
            </div>
          ))}
        </section>

        <div className="mt-12 grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
          <aside className="lg:sticky lg:top-24">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#777]">
              On this page
            </p>
            <nav aria-label="Page sections" className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">
              {navigation.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-[#555] no-underline transition-colors hover:bg-[#f6f1ef] hover:text-[#c62828]"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </aside>

          <article className="min-w-0 max-w-3xl space-y-10 text-[15px] leading-7 text-[#4f4f4f] md:text-base">
            {children}
          </article>
        </div>
      </main>
      <Footer />
    </div>
  );
}

export function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-[#ececec] pt-8 first:border-0 first:pt-0">
      <h2 className="mb-4 text-2xl font-bold tracking-[-0.025em] text-[#111]">{title}</h2>
      <div className="space-y-4 [&_a]:font-medium [&_a]:text-[#c62828] [&_a]:underline [&_a]:decoration-[#efc1bf] [&_a]:underline-offset-4 [&_li]:ml-5 [&_li]:pl-1 [&_ul]:list-disc [&_ul]:space-y-2">
        {children}
      </div>
    </section>
  );
}

export function LegalNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#f0d2d0] bg-[#fff7f6] px-5 py-4 text-sm leading-6 text-[#6d3a37]">
      {children}
    </div>
  );
}
