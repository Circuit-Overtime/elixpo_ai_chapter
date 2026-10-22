'use client'

import { useEffect, useState } from 'react'
import useAuthStore from '@/store/useAuthStore'

const EMPTY_PROFILE = {
  displayName: '',
  email: '',
  bio: '',
  location: '',
  timezone: '',
  pronouns: '',
  website: '',
  company: '',
  links: [],
}

const inputClass = 'mt-1.5 w-full rounded-lg border border-white/10 bg-black/15 px-3 py-2.5 text-xs text-text-primary outline-none placeholder:text-text-dim focus:border-[#8B88E8]/60'

function Field({ label, hint, children }) {
  return (
    <label className="block text-[10px] uppercase tracking-wider text-text-dim">
      {label}
      {children}
      {hint && <span className="mt-1 block normal-case tracking-normal text-[9px] text-text-dim/80">{hint}</span>}
    </label>
  )
}

export default function PersonalDetailsCard() {
  const updateUser = useAuthStore((state) => state.updateUser)
  const [profile, setProfile] = useState(EMPTY_PROFILE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const completedFields = [
    profile.displayName,
    profile.bio,
    profile.location,
    profile.timezone,
    profile.pronouns,
    profile.website,
    profile.company,
    profile.links.some((link) => link.label && link.url),
  ].filter(Boolean).length
  const completion = Math.round((completedFields / 8) * 100)

  useEffect(() => {
    let cancelled = false
    fetch('/api/profile', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Could not load personal details')
        if (!cancelled) setProfile({ ...EMPTY_PROFILE, ...data, links: data.links || [] })
      })
      .catch((error) => !cancelled && setMessage({ ok: false, text: error.message }))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [])

  const update = (field, value) => setProfile((current) => ({ ...current, [field]: value }))
  const updateLink = (index, field, value) => setProfile((current) => ({
    ...current,
    links: current.links.map((link, linkIndex) => linkIndex === index ? { ...link, [field]: value } : link),
  }))
  const addLink = () => setProfile((current) => current.links.length >= 6
    ? current
    : { ...current, links: [...current.links, { label: '', url: '' }] })
  const removeLink = (index) => setProfile((current) => ({
    ...current,
    links: current.links.filter((_, linkIndex) => linkIndex !== index),
  }))

  const save = async (event) => {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not save personal details')
      setProfile({ ...EMPTY_PROFILE, ...data, links: data.links || [] })
      updateUser({ displayName: data.displayName })
      setMessage({ ok: true, text: 'Personal details saved' })
    } catch (error) {
      setMessage({ ok: false, text: error.message })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="h-48 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.025]" />

  return (
    <form onSubmit={save} className="rounded-2xl border border-[#8B88E8]/25 bg-[#8B88E8]/[0.04] p-5">
      <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] pb-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <i className="bx bx-id-card text-[#A99CF1]" />
            Personal details
          </h2>
          <p className="mt-1 text-xs leading-5 text-text-dim">Information used across your LixSketch profile and shared workspace identity.</p>
        </div>
        <button type="submit" disabled={saving} className="cursor-pointer rounded-lg bg-[#8B88E8] px-4 py-2 text-xs text-white hover:bg-[#9E91EE] disabled:cursor-wait disabled:opacity-60">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3 sm:col-span-2">
          <div className="flex items-center justify-between gap-3 text-[10px]">
            <span className="uppercase tracking-wider text-text-dim">Profile completeness</span>
            <span className="font-mono text-[#A99CF1]">{completion}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
            <div className="h-full rounded-full bg-[#8B88E8] transition-all duration-500" style={{ width: `${completion}%` }} />
          </div>
          <p className="mt-2 text-[9px] text-text-dim">Complete details help collaborators identify you in shared rooms.</p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
          <p className="text-[9px] uppercase tracking-wider text-text-dim">Public links</p>
          <p className="mt-1 text-lg text-text-primary">{profile.links.filter((link) => link.label && link.url).length} / 6</p>
          <p className="mt-1 text-[9px] text-text-dim">Portfolio and social profiles</p>
        </div>
      </div>

      <div className="mt-5">
        <h3 className="flex items-center gap-2 text-xs font-medium text-text-secondary">
          <i className="bx bx-user-circle text-[#A99CF1]" /> Identity
        </h3>
        <p className="mt-1 text-[10px] text-text-dim">Core information visible to people collaborating with you.</p>
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <Field label="Display name">
          <input className={inputClass} value={profile.displayName} maxLength={80} required onChange={(event) => update('displayName', event.target.value)} placeholder="How people see you" />
        </Field>
        <Field label="Email" hint="Managed by your Elixpo account">
          <input className={`${inputClass} cursor-not-allowed opacity-60`} value={profile.email} readOnly />
        </Field>
        <Field label="Pronouns">
          <input className={inputClass} value={profile.pronouns} maxLength={40} onChange={(event) => update('pronouns', event.target.value)} placeholder="e.g. they/them" />
        </Field>
        <Field label="Timezone">
          <input className={inputClass} value={profile.timezone} maxLength={80} onChange={(event) => update('timezone', event.target.value)} placeholder={Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'} />
        </Field>
      </div>

      <div className="mt-5 border-t border-white/[0.07] pt-4">
        <h3 className="flex items-center gap-2 text-xs font-medium text-text-secondary">
          <i className="bx bx-briefcase text-[#A99CF1]" /> About and presence
        </h3>
        <p className="mt-1 text-[10px] text-text-dim">Optional context for your profile and public links.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Company or team">
            <input className={inputClass} value={profile.company} maxLength={100} onChange={(event) => update('company', event.target.value)} placeholder="Where you work or create" />
          </Field>
          <Field label="Location">
            <input className={inputClass} value={profile.location} maxLength={100} onChange={(event) => update('location', event.target.value)} placeholder="City, country" />
          </Field>
          <Field label="Website">
            <input className={inputClass} value={profile.website} maxLength={300} onChange={(event) => update('website', event.target.value)} placeholder="https://your-site.com" inputMode="url" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Bio">
              <textarea className={`${inputClass} min-h-24 resize-y`} value={profile.bio} maxLength={280} onChange={(event) => update('bio', event.target.value)} placeholder="A short introduction about you and what you use LixSketch for" />
            </Field>
            <p className="mt-1 text-right text-[9px] text-text-dim">{profile.bio.length} / 280</p>
          </div>
        </div>
      </div>

      <div className="mt-5 border-t border-white/[0.07] pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-medium text-text-secondary">Links</h3>
            <p className="mt-1 text-[10px] text-text-dim">Add a portfolio, GitHub, LinkedIn, or another public profile.</p>
          </div>
          <button type="button" onClick={addLink} disabled={profile.links.length >= 6} className="cursor-pointer rounded-lg border border-[#8B88E8]/25 px-3 py-1.5 text-[10px] text-[#A99CF1] hover:bg-[#8B88E8]/10 disabled:cursor-not-allowed disabled:opacity-40">
            <i className="bx bx-plus mr-1" /> Add link
          </button>
        </div>
        {profile.links.length > 0 && (
          <div className="mt-3 space-y-2">
            {profile.links.map((link, index) => (
              <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.5fr)_auto]">
                <input className={inputClass.replace('mt-1.5 ', '')} value={link.label} maxLength={30} onChange={(event) => updateLink(index, 'label', event.target.value)} placeholder="Label" aria-label={`Link ${index + 1} label`} />
                <input className={inputClass.replace('mt-1.5 ', '')} value={link.url} maxLength={300} onChange={(event) => updateLink(index, 'url', event.target.value)} placeholder="https://" inputMode="url" aria-label={`Link ${index + 1} URL`} />
                <button type="button" onClick={() => removeLink(index)} className="min-h-9 cursor-pointer rounded-lg border border-red-500/20 px-3 text-red-400 hover:bg-red-500/10" aria-label={`Remove link ${index + 1}`}>
                  <i className="bx bx-trash" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {message && (
        <p className={`mt-4 rounded-lg px-3 py-2 text-xs ${message.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`} role="status">
          {message.text}
        </p>
      )}
    </form>
  )
}
