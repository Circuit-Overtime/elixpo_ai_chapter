'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import LandingNav from '@/components/landing/LandingNav'
import LandingFooter from '@/components/landing/LandingFooter'

const plans = [
  {
    name: 'Guest',
    eyebrow: 'Try it instantly',
    description: 'Open the canvas without an account and keep one lightweight workspace.',
    monthly: 0,
    annual: 0,
    annualTotal: 0,
    cta: 'Draw as guest',
    href: '/',
    features: [
      '1 encrypted workspace',
      '2 MB of images per workspace',
      'Local-first canvas recovery',
      'Canvas, docs, and split view',
      'Solo live room · 1 person',
      'PNG and SVG export',
    ],
  },
  {
    name: 'Free',
    eyebrow: 'For personal projects',
    description: 'Sign in for more project space and small-group collaboration at no cost.',
    monthly: 0,
    annual: 0,
    annualTotal: 0,
    cta: 'Sign in free',
    href: '/',
    features: [
      '2 encrypted cloud workspaces',
      '5 MB of images per workspace',
      'Real-time collaboration · 3 people',
      'Canvas, docs, and split view',
      'PNG and SVG export',
      'End-to-end encrypted sync',
      'AI image generation · free with Pollinations',
    ],
  },
  {
    name: 'Pro',
    eyebrow: 'Best value for active work',
    description: 'Turn LixSketch into a daily workspace with room for every active project.',
    monthly: 249,
    annual: 199,
    annualTotal: 2388,
    cta: 'Request Pro access',
    href: 'mailto:ayushman@myceli.ai?subject=LixSketch%20Pro%20early%20access',
    badge: 'Most popular',
    features: [
      'Everything in Free',
      '10 workspaces · 5× more than Free',
      '10 MB of images per workspace',
      'Real-time collaboration · 5 people',
      'High-resolution PDF export',
      'Personal usage dashboard',
      'Priority email support',
    ],
  },
]

const comparison = [
  { feature: 'Canvas, docs, and split view', values: ['Included', 'Included', 'Included'] },
  { feature: 'End-to-end encrypted sync', values: ['Included', 'Included', 'Included'] },
  { feature: 'Cloud workspaces', values: ['1', '2', '10'] },
  { feature: 'Images per workspace', values: ['2 MB', '5 MB', '10 MB'] },
  { feature: 'Live room participants', values: ['1', '3', '5'] },
  { feature: 'PNG and SVG export', values: ['Included', 'Included', 'Included'] },
  { feature: 'PDF export', values: ['—', '—', 'Included'] },
  { feature: 'AI image generation', values: ['—', 'Free with Pollinations', 'Free with Pollinations'] },
]

const faqs = [
  {
    question: 'Is Pro available today?',
    answer: 'Guest and Free are available now. Pro is in early access while billing is rolled out. Requesting access does not charge you or change your current plan.',
  },
  {
    question: 'Are taxes included?',
    answer: 'Prices are shown in Indian rupees and exclude applicable GST. Your final invoice will show taxes before payment.',
  },
  {
    question: 'Can I use LixSketch without paying?',
    answer: 'Yes. Free includes two encrypted cloud workspaces, canvas and docs, PNG and SVG export, and real-time collaboration for up to three people.',
  },
  {
    question: 'Is the AI connector included?',
    answer: 'Yes. Free and Pro include AI image generation with Flux and Klein at no extra LixSketch charge after you connect Pollinations. Each generation uses your personal Pollen balance; LixSketch does not provide or resell Pollen credits.',
  },
]

function Price({ plan, annual }) {
  if (plan.monthly === 0) {
    return (
      <div className="flex min-h-14 items-end gap-2">
        <span className="text-4xl text-white">₹0</span>
        <span className="mb-1.5 text-sm text-text-dim">forever</span>
      </div>
    )
  }

  const price = annual ? plan.annual : plan.monthly
  return (
    <div className="min-h-14">
      <div className="flex items-end gap-1.5">
        <span className="text-4xl text-white tabular-nums">₹{price}</span>
        <span className="mb-1.5 text-sm text-text-dim">/ {plan.unit ? `${plan.unit} / ` : ''}month</span>
      </div>
      <p className="mt-1 min-h-4 text-[11px] text-text-dim">
        {annual ? `₹${plan.annualTotal.toLocaleString('en-IN')}${plan.unit ? ` / ${plan.unit}` : ''} billed yearly` : 'Billed monthly'}
      </p>
    </div>
  )
}

export default function PricingPage() {
  const [annual, setAnnual] = useState(true)

  return (
    <div className="min-h-screen overflow-hidden bg-[#120e1a] font-[lixFont] text-text-primary">
      <LandingNav />

      <main>
        <section className="relative px-5 pb-16 pt-36 sm:px-6 sm:pt-40">
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="absolute left-1/2 top-10 h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-[#8b6de0]/15 blur-[120px]" />
            <div className="absolute -right-24 top-64 h-64 w-64 rounded-full bg-[#c873e4]/10 blur-[100px]" />
            <div className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:48px_48px]" />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="relative mx-auto max-w-3xl text-center"
          >
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#8b6de0]/30 bg-[#8b6de0]/10 px-3 py-1.5 text-xs text-[#d6c2ff]">
              <i className="bx bx-rupee" aria-hidden="true" />
              Simple pricing for India
            </div>
            <h1 className="text-4xl leading-tight text-white sm:text-5xl md:text-6xl">
              Make space for every idea.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-text-muted sm:text-base">
              Try the full creative toolkit without an account. Sign in free for collaboration, then upgrade when active projects need more room.
            </p>

            <div className="mt-8 inline-flex rounded-xl border border-border-light bg-[#191222]/90 p-1" role="group" aria-label="Billing period">
              <button
                type="button"
                onClick={() => setAnnual(false)}
                aria-pressed={!annual}
                className={`cursor-pointer rounded-lg px-4 py-2 text-xs transition-colors ${!annual ? 'bg-[#8b6de0] text-white' : 'text-text-muted hover:text-white'}`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setAnnual(true)}
                aria-pressed={annual}
                className={`cursor-pointer rounded-lg px-4 py-2 text-xs transition-colors ${annual ? 'bg-[#8b6de0] text-white' : 'text-text-muted hover:text-white'}`}
              >
                Yearly <span className={annual ? 'text-[#efe7ff]' : 'text-[#b99be9]'}>· save 20%</span>
              </button>
            </div>
          </motion.div>

          <div className="relative mx-auto mt-12 grid max-w-6xl gap-5 lg:grid-cols-3">
            {plans.map((plan, index) => (
              <motion.article
                key={plan.name}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.08 * index }}
                className={`relative flex min-h-full flex-col rounded-2xl border p-6 sm:p-7 ${
                  plan.badge
                    ? 'border-[#9b7be5]/70 bg-gradient-to-b from-[#2a1d3d] to-[#1b1425] shadow-[0_20px_80px_-38px_rgba(139,109,224,.8)]'
                    : 'border-border-light bg-[#1a1423]/90'
                }`}
              >
                {plan.badge && (
                  <span className="absolute right-5 top-5 rounded-full bg-[#8b6de0]/20 px-2.5 py-1 text-[10px] uppercase tracking-wider text-[#d9c7ff]">
                    {plan.badge}
                  </span>
                )}
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#b99be9]">{plan.eyebrow}</p>
                <h2 className="mt-3 text-2xl text-white">{plan.name}</h2>
                <p className="mt-3 min-h-12 text-sm leading-6 text-text-muted">{plan.description}</p>
                <div className="mt-7"><Price plan={plan} annual={annual} /></div>

                <Link
                  href={plan.href}
                  className={`mt-7 flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm transition-all ${
                    plan.badge
                      ? 'bg-[#8b6de0] text-white hover:bg-[#a080ef] hover:shadow-lg hover:shadow-[#8b6de0]/20'
                      : 'border border-border-light bg-white/[0.035] text-text-secondary hover:border-[#8b6de0]/60 hover:bg-[#8b6de0]/10 hover:text-white'
                  }`}
                >
                  {plan.cta}
                  <i className={`bx ${plan.monthly === 0 ? 'bx-right-arrow-alt' : 'bx-envelope'} text-base`} aria-hidden="true" />
                </Link>

                <div className="my-6 h-px bg-white/[0.07]" />
                <ul className="space-y-3.5 text-sm text-text-muted">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-3">
                      <i className="bx bx-check-circle mt-0.5 text-base text-[#b99be9]" aria-hidden="true" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </motion.article>
            ))}
          </div>

          <p className="relative mx-auto mt-6 max-w-3xl text-center text-[11px] leading-5 text-text-dim">
            Pro is currently offered as early access. Displayed prices exclude applicable GST. Requesting access does not initiate a charge.
          </p>
        </section>

        <section className="border-y border-white/[0.06] bg-[#0f0b16]/70 px-5 py-20 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[#b99be9]">Compare plans</p>
                <h2 className="mt-3 text-3xl text-white">The essentials, side by side.</h2>
              </div>
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#9b7be5]/30 bg-[#8b6de0]/10 px-3 py-1.5 text-xs text-[#d9c7ff]">
                <i className="bx bx-sparkles" aria-hidden="true" />
                AI image generation · Free with Pollinations
              </div>
            </div>

            <div className="mt-9 overflow-x-auto rounded-2xl border border-border-light bg-[#181120]">
              <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border-light text-white">
                    <th className="w-[40%] px-6 py-4 font-normal">Feature</th>
                    {plans.map((plan) => <th key={plan.name} className="px-5 py-4 font-normal">{plan.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((row) => (
                    <tr key={row.feature} className="border-b border-white/[0.055] last:border-0">
                      <th className="px-6 py-4 font-normal text-text-muted">{row.feature}</th>
                      {row.values.map((value, index) => (
                        <td key={`${row.feature}-${plans[index].name}`} className="px-5 py-4 text-text-secondary">
                          {value === 'Included' ? (
                            <span className="inline-flex items-center gap-1.5"><i className="bx bx-check text-[#b99be9]" />{value}</span>
                          ) : value}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="px-5 py-20 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.16em] text-[#b99be9]">Questions</p>
              <h2 className="mt-3 text-3xl text-white">Clear before you choose.</h2>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-2">
              {faqs.map((faq) => (
                <article key={faq.question} className="rounded-2xl border border-border-light bg-[#1a1423]/75 p-6">
                  <h3 className="text-base text-white">{faq.question}</h3>
                  <p className="mt-3 text-sm leading-6 text-text-muted">{faq.answer}</p>
                </article>
              ))}
            </div>

            <div className="mt-16 overflow-hidden rounded-3xl border border-[#8b6de0]/30 bg-gradient-to-br from-[#2b1d40] via-[#20152e] to-[#17101f] px-6 py-10 text-center sm:px-10">
              <h2 className="text-3xl text-white">Your first workspace is a click away.</h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-text-muted">No card required. Draw, write, collaborate, and decide whether you need more later.</p>
              <Link href="/" className="mt-7 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#8b6de0] px-5 py-3 text-sm text-white transition-all hover:bg-[#a080ef] hover:shadow-lg hover:shadow-[#8b6de0]/25">
                Start with Free
                <i className="bx bx-right-arrow-alt text-lg" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  )
}
