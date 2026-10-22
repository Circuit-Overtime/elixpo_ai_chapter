'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import ContestMarkdown from './ContestMarkdown';

const field = 'w-full rounded-xl border border-[var(--border-default)] bg-[var(--input-bg)] px-4 py-3 text-[15px] text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-subtle)]';

const steps = [
  { id: 'overview', label: 'Overview', detail: 'Identity and artwork', icon: 'sparkles-outline' },
  { id: 'brief', label: 'Challenge', detail: 'Prompt, rules, and template', icon: 'document-text-outline' },
  { id: 'eligibility', label: 'Eligibility', detail: 'Who and what can enter', icon: 'people-outline' },
  { id: 'timeline', label: 'Timeline', detail: 'Opening and deadlines', icon: 'calendar-outline' },
  { id: 'review', label: 'Review', detail: 'Check and create draft', icon: 'checkmark-circle-outline' },
];

const initialValues = {
  title: '', slug: '', description: '', theme: '', coverUrl: '', problemStatement: '', rules: '', templateContent: '', tags: '',
  requiredTopics: '', allowedTargets: '', minimumAccountAgeMonths: '0', requireBio: false,
  startsAt: '', submissionsCloseAt: '', judgingClosesAt: '', perAuthorLimit: '1',
};

function SummaryItem({ label, value }) {
  return <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4"><dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-faint)]">{label}</dt><dd className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">{value || 'Not provided'}</dd></div>;
}

function slugify(value) {
  return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}

function localDateTime(value = Date.now()) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function MarkdownField({ label, name, value, onChange, required = false, placeholder, rows = 10, help }) {
  return <label className="grid gap-2 text-sm font-bold text-[var(--text-secondary)]"><span className="flex flex-wrap items-center justify-between gap-2"><span>{label}</span><span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">Markdown supported</span></span><textarea name={name} value={value} onChange={onChange} required={required} rows={rows} placeholder={placeholder} className={`${field} min-h-52 resize-y font-mono text-[15px] leading-7`} /><span className="font-normal leading-5 text-[var(--text-faint)]">{help}</span><details className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 font-normal"><summary className="cursor-pointer text-xs font-semibold text-[var(--text-muted)]">Markdown formatting examples</summary><code className="mt-2 block whitespace-pre-wrap text-xs leading-6 text-[var(--text-faint)]">{'## Section heading\n**Bold emphasis** and [helpful link](https://example.com)\n- Clear requirement\n- Another point'}</code></details></label>;
}

export default function ContestCreateForm({ organizer }) {
  const router = useRouter();
  const formRef = useRef(null);
  const [activeStep, setActiveStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [values, setValues] = useState(initialValues);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [minimumStart] = useState(() => localDateTime(Date.now() + 5 * 60_000));

  function update(event) {
    const { name, type, checked, value } = event.target;
    setValues((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
      ...(name === 'title' && !slugTouched ? { slug: slugify(value) } : {}),
    }));
  }

  function nextStep() {
    const requiredFields = formRef.current?.querySelectorAll('[required]') || [];
    for (const input of requiredFields) {
      if (!input.checkValidity()) { input.reportValidity(); return; }
    }
    if (activeStep === 3) {
      const starts = Date.parse(values.startsAt);
      const closes = Date.parse(values.submissionsCloseAt);
      const judging = Date.parse(values.judgingClosesAt);
      if (!(starts > Date.now() && starts < closes && closes <= judging)) {
        setError('Choose future dates in this order: contest start, submission deadline, judging deadline.');
        return;
      }
    }
    const next = Math.min(activeStep + 1, steps.length - 1);
    setActiveStep(next);
    setFurthestStep((current) => Math.max(current, next));
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit(event) {
    event.preventDefault();
    if (activeStep < steps.length - 1) { nextStep(); return; }
    if (!values.title.trim() || values.slug.length < 3) { setActiveStep(0); setError('Add a title and a valid contest slug.'); return; }
    if (values.coverUrl) {
      try { const cover = new URL(values.coverUrl); if (cover.protocol !== 'https:' || !cover.hostname || cover.username || cover.password) throw new Error(); }
      catch { setActiveStep(0); setError('Cover image URL must be a complete HTTPS URL.'); return; }
    }
    if (!values.problemStatement.trim() || !values.rules.trim()) { setActiveStep(1); setError('Problem statement and rules are required.'); return; }
    const months = Number(values.minimumAccountAgeMonths);
    const entryLimit = Number(values.perAuthorLimit);
    if (!Number.isInteger(months) || months < 0 || !Number.isInteger(entryLimit) || entryLimit < 1 || entryLimit > 5) { setActiveStep(2); setError('Account age must be a whole number of months from 0, and entries per author must be between 1 and 5.'); return; }
    const starts = Date.parse(values.startsAt), closes = Date.parse(values.submissionsCloseAt), judging = Date.parse(values.judgingClosesAt);
    if (!(starts > Date.now() && starts < closes && closes <= judging)) { setActiveStep(3); setError('Choose future dates in this order: contest start, submission deadline, judging deadline.'); return; }
    setBusy(true); setError('');
    const body = {
      ...values,
      requiredTopics: values.requiredTopics.split(',').map((item) => item.trim()).filter(Boolean),
      tags: values.tags.split(',').map((item) => item.trim()).filter(Boolean),
      allowedTargets: String(values.allowedTargets || 'personal').split(',').map((item) => item.trim()).filter(Boolean),
      perAuthorLimit: Number(values.perAuthorLimit || 1),
      eligibility: { minimumAccountAgeMonths: Math.max(0, Number(values.minimumAccountAgeMonths || 0)), requireBio: values.requireBio },
    };
    delete body.minimumAccountAgeMonths; delete body.requireBio;
    const response = await fetch('/api/contests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(result.error || 'Contest could not be created'); return; }
    router.push(`/contests/${result.slug}`);
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">Organizer workspace</p>
      <h1 className="mt-2 font-serif text-4xl font-extrabold text-[var(--text-primary)]">Create a contest</h1>
      <p className="mt-3 text-sm text-[var(--text-muted)]">Build the contest one section at a time. It stays private until you publish it.</p>

      <nav aria-label="Contest setup" className="mt-8 overflow-x-auto rounded-2xl border border-[var(--border-default)] bg-[var(--card-bg)] p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ol className="flex min-w-max gap-1 lg:min-w-0">
          {steps.map((step, index) => {
            const selected = index === activeStep;
            const completed = index < furthestStep;
            const available = index <= furthestStep;
            return <li key={step.id} className="flex-1"><button type="button" disabled={!available} onClick={() => available && setActiveStep(index)} aria-current={selected ? 'step' : undefined} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition ${selected ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-surface)]'} disabled:cursor-not-allowed disabled:opacity-45`}><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-sm ${selected || completed ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--border-default)] bg-[var(--input-bg)]'}`}>{completed ? <ion-icon name="checkmark-outline" /> : <span>{index + 1}</span>}</span><span><span className="block text-xs font-bold">{step.label}</span><span className="mt-0.5 block text-[10px] font-normal text-[var(--text-faint)]">{step.detail}</span></span></button></li>;
          })}
        </ol>
      </nav>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-[var(--bg-surface)]"><div className="h-full rounded-full bg-[var(--accent)] transition-all duration-300" style={{ width: `${((activeStep + 1) / steps.length) * 100}%` }} /></div>

      <form ref={formRef} onSubmit={submit} className="mt-6 rounded-2xl border border-[var(--border-default)] bg-[var(--card-bg)] p-6 sm:p-8">
        <header className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--divider)] pb-5"><div><div className="flex items-center gap-2 text-[var(--accent)]"><ion-icon name={steps[activeStep].icon} /><span className="text-[11px] font-bold uppercase tracking-[0.16em]">Step {activeStep + 1} of {steps.length}</span></div><h2 className="mt-2 font-serif text-2xl font-bold text-[var(--text-primary)]">{steps[activeStep].label}</h2><p className="mt-1 text-[15px] text-[var(--text-muted)]">{steps[activeStep].detail}</p></div>{activeStep < steps.length - 1 && <button type="button" onClick={nextStep} className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white">Continue <span aria-hidden="true">→</span></button>}</header>

        {activeStep === 0 && <section className="grid gap-6"><label className="grid gap-2 text-sm font-bold text-[var(--text-secondary)]">Contest title<input name="title" value={values.title} onChange={update} required maxLength={160} placeholder="The Future of Open Knowledge" className={field} /></label><label className="grid gap-2 text-sm font-bold text-[var(--text-secondary)]">Contest URL slug<div className="flex items-center rounded-xl border border-[var(--border-default)] bg-[var(--input-bg)] px-4 focus-within:border-[var(--accent)]"><span className="shrink-0 text-sm text-[var(--text-faint)]">/contests/</span><input name="slug" value={values.slug} onChange={(event) => { setSlugTouched(true); setValues((current) => ({ ...current, slug: slugify(event.target.value) })); }} required minLength={3} maxLength={64} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="future-of-open-knowledge" className="min-w-0 flex-1 bg-transparent py-3 text-[15px] text-[var(--text-primary)] outline-none" /></div><span className="font-normal text-[var(--text-faint)]">Lowercase letters, numbers, and hyphens. Choose carefully before publishing.</span></label><label className="grid gap-2 text-sm font-bold text-[var(--text-secondary)]">Short description<textarea name="description" value={values.description} onChange={update} rows={4} maxLength={500} placeholder="Tell writers what this contest is about in a few sentences." className={`${field} resize-y leading-7`} /></label><div className="grid gap-6 md:grid-cols-2"><label className="grid gap-2 text-sm font-bold text-[var(--text-secondary)]">Theme<input name="theme" value={values.theme} onChange={update} placeholder="Technology for public good" className={field} /></label><label className="grid gap-2 text-sm font-bold text-[var(--text-secondary)]">Contest tags<input name="tags" value={values.tags} onChange={update} placeholder="technology, community, future" className={field} /><span className="font-normal text-[var(--text-faint)]">Discovery tags, separated by commas.</span></label></div><label className="grid gap-2 text-sm font-bold text-[var(--text-secondary)]">Cover image URL<input name="coverUrl" value={values.coverUrl} onChange={update} type="url" pattern="https://.*" placeholder="https://example.com/contest-cover.jpg" className={field} /><span className="font-normal text-[var(--text-faint)]">Optional. Must be a complete HTTPS image URL.</span></label></section>}

        {activeStep === 1 && <section className="grid gap-8"><MarkdownField label="Problem statement" name="problemStatement" value={values.problemStatement} onChange={update} required placeholder={'## The challenge\n\nExplain the question writers should answer.\n\n### What a strong entry covers\n\n- A clear position\n- Evidence and practical examples'} help="Give writers a focused question, context, and evaluation direction." /><MarkdownField label="Rules" name="rules" value={values.rules} onChange={update} required placeholder={'## Entry requirements\n\n1. Publish original work on LixBlogs.\n2. Credit every external source.\n3. Submit before the deadline.\n\n## Conduct\n\nBe constructive and respectful.'} help="State originality, attribution, language, conduct, and submission requirements." /><MarkdownField label="Optional writing template" name="templateContent" value={values.templateContent} onChange={update} rows={8} placeholder={'# Opening\n\nIntroduce the problem.\n\n## Main argument\n\nBuild the case with evidence.\n\n## Sources and conclusion'} help="Entrants can use this Markdown outline as the starting structure for their post." /></section>}

        {activeStep === 2 && <section className="grid gap-6"><label className="grid gap-2 text-sm font-bold text-[var(--text-secondary)]">Required blog topics<input name="requiredTopics" value={values.requiredTopics} onChange={update} placeholder="open-source, education, community" className={field} /><span className="font-normal text-[var(--text-faint)]">Every submitted blog must include these topics. Separate them with commas.</span></label><label className="grid gap-2 text-sm font-bold text-[var(--text-secondary)]">Where can entries be published?<input name="allowedTargets" value={values.allowedTargets} onChange={update} placeholder="personal, org:your-organization-id" className={field} /><span className="font-normal leading-5 text-[var(--text-faint)]">Leave blank to accept personal blogs only. To accept organization posts too, add an exact target such as <code className="rounded bg-[var(--accent-subtle)] px-1 py-0.5 text-[var(--accent)]">org:design-team</code>.</span></label><div className="grid gap-6 md:grid-cols-2"><label className="grid gap-2 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 text-sm font-bold text-[var(--text-secondary)]"><span>Minimum account age</span><div className="relative"><input name="minimumAccountAgeMonths" value={values.minimumAccountAgeMonths} onChange={update} type="number" inputMode="numeric" step="1" min="0" className={`${field} pr-20`} /><span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-[var(--text-faint)]">months</span></div><span className="font-normal text-[var(--text-faint)]">Whole months only. Use 0 for no age requirement.</span></label><label className="grid gap-2 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 text-sm font-bold text-[var(--text-secondary)]"><span>Entries per author</span><input name="perAuthorLimit" value={values.perAuthorLimit} onChange={update} type="number" inputMode="numeric" step="1" min="1" max="5" className={field} /><span className="font-normal text-[var(--text-faint)]">Choose a whole number from 1 to 5.</span></label></div><label className="flex items-start gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 text-sm font-bold text-[var(--text-secondary)]"><input name="requireBio" checked={values.requireBio} onChange={update} type="checkbox" className="mt-0.5" /><span>Require a completed profile bio<span className="mt-1 block text-xs font-normal text-[var(--text-faint)]">Entrants without a bio will be asked to complete their profile first.</span></span></label></section>}

        {activeStep === 3 && <section className="grid gap-6"><div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm leading-6 text-[var(--text-muted)]"><strong className="text-[var(--text-primary)]">All dates must be in the future.</strong> Times use your browser's local timezone. Deadlines lock after the contest opens or receives its first submission.</div><div className="grid gap-6 lg:grid-cols-3"><label className="grid gap-2 text-sm font-bold text-[var(--text-secondary)]">Contest starts<input name="startsAt" value={values.startsAt} onChange={update} type="datetime-local" required min={minimumStart} className={field} /><span className="font-normal text-[var(--text-faint)]">When the contest becomes live.</span></label><label className="grid gap-2 text-sm font-bold text-[var(--text-secondary)]">Submissions close<input name="submissionsCloseAt" value={values.submissionsCloseAt} onChange={update} type="datetime-local" required min={values.startsAt || minimumStart} className={field} /><span className="font-normal text-[var(--text-faint)]">Last moment authors can enter or withdraw.</span></label><label className="grid gap-2 text-sm font-bold text-[var(--text-secondary)]">Judging closes<input name="judgingClosesAt" value={values.judgingClosesAt} onChange={update} type="datetime-local" required min={values.submissionsCloseAt || values.startsAt || minimumStart} className={field} /><span className="font-normal text-[var(--text-faint)]">Deadline for publishing final results.</span></label></div></section>}

        {activeStep === 4 && <section><div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm leading-6 text-[var(--text-secondary)]"><strong className="text-[var(--text-primary)]">Ready for a private draft.</strong> This preview mirrors the public contest page. You can still edit it and invite judges before publishing.</div><article className="mt-6 overflow-hidden rounded-3xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-sm">{values.coverUrl ? <img src={values.coverUrl} alt="Contest cover preview" className="h-56 w-full object-cover" /> : <div className="grid h-44 place-items-center bg-[radial-gradient(circle_at_25%_25%,rgba(139,92,246,0.32),transparent_36%),linear-gradient(135deg,var(--bg-surface),var(--card-bg))] text-5xl text-[var(--accent)]"><ion-icon name="trophy-outline" /></div>}<div className="p-6 sm:p-8"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[var(--accent-subtle)] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--accent)]">Private draft</span>{values.theme && <span className="text-xs font-semibold text-[var(--text-faint)]">{values.theme}</span>}{values.tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 4).map((tag) => <span key={tag} className="rounded-full bg-[var(--card-bg)] px-2.5 py-1 text-[10px] text-[var(--text-muted)]">#{tag}</span>)}</div><h3 className="mt-4 max-w-3xl font-serif text-3xl font-extrabold leading-tight text-[var(--text-primary)]">{values.title || 'Untitled contest'}</h3><p className="mt-3 max-w-2xl text-[15px] leading-7 text-[var(--text-muted)]">{values.description || 'No short description added.'}</p><div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--divider)] pt-5"><div className="flex items-center gap-3">{organizer?.avatarUrl ? <img src={organizer.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--accent-subtle)] font-bold text-[var(--accent)]">{String(organizer?.displayName || organizer?.username || '?').slice(0, 1).toUpperCase()}</span>}<span><span className="block text-sm font-bold text-[var(--text-primary)]">{organizer?.displayName || organizer?.username || 'Contest organizer'}</span><span className="block text-xs text-[var(--text-faint)]">@{organizer?.username || 'organizer'}</span></span></div><div className="text-right text-xs leading-5 text-[var(--text-muted)]"><span className="block">Starts {values.startsAt ? new Date(values.startsAt).toLocaleString() : 'not set'}</span><span className="block">Entries close {values.submissionsCloseAt ? new Date(values.submissionsCloseAt).toLocaleString() : 'not set'}</span></div></div></div></article><dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><SummaryItem label="Public URL" value={`/contests/${values.slug || 'contest-slug'}`} /><SummaryItem label="Required topics" value={values.requiredTopics || 'No required topics'} /><SummaryItem label="Publication targets" value={values.allowedTargets || 'Personal blogs'} /><SummaryItem label="Account age" value={`${values.minimumAccountAgeMonths || 0} month(s)`} /><SummaryItem label="Entry limit" value={`${values.perAuthorLimit || 1} per author`} /><SummaryItem label="Judging deadline" value={values.judgingClosesAt ? new Date(values.judgingClosesAt).toLocaleString() : ''} /></dl><div className="mt-6 grid gap-3"><details open className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5"><summary className="cursor-pointer font-serif text-lg font-bold text-[var(--text-primary)]">Problem statement</summary><ContestMarkdown className="mt-4">{values.problemStatement}</ContestMarkdown></details><details className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5"><summary className="cursor-pointer font-serif text-lg font-bold text-[var(--text-primary)]">Rules</summary><ContestMarkdown className="mt-4">{values.rules}</ContestMarkdown></details>{values.templateContent && <details className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5"><summary className="cursor-pointer font-serif text-lg font-bold text-[var(--text-primary)]">Optional writing template</summary><ContestMarkdown className="mt-4">{values.templateContent}</ContestMarkdown></details>}</div></section>}

        {error && <p role="alert" className="mt-5 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p>}
        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--divider)] pt-5"><button type="button" disabled={activeStep === 0 || busy} onClick={() => setActiveStep((current) => Math.max(0, current - 1))} className="rounded-full border border-[var(--border-default)] px-5 py-2.5 text-sm font-bold text-[var(--text-secondary)] disabled:opacity-40">Back</button>{activeStep < steps.length - 1 ? <button type="button" onClick={nextStep} className="rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-bold text-white">Continue <span aria-hidden="true">→</span></button> : <button disabled={busy} className="rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Creating draft…' : 'Create contest draft'}</button>}</footer>
      </form>
    </main>
  );
}
