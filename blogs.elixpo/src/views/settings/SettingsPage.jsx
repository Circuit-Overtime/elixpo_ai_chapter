'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { generatePixelAvatar } from '../../utils/pixelAvatar';
import AppShell from '../../components/AppShell';
import TabBar from '../../components/TabBar';
import Link from 'next/link';
import TopicPreferences from '../../components/TopicPreferences';

const TABS = [
  { label: 'Account', icon: 'person-outline' },
  { label: 'Publishing', icon: 'create-outline' },
  { label: 'Notifications', icon: 'notifications-outline' },
  { label: 'Organization', icon: 'people-outline' },
  { label: 'Integrations', icon: 'git-network-outline' },
  { label: 'API', icon: 'key-outline' },
  { label: 'Media', icon: 'images-outline' },
  { label: 'Subscription', icon: 'diamond-outline' },
];

function Toggle({ checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-[22px] rounded-full transition-colors flex-shrink-0 disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-[#9b7bf7]' : 'bg-[var(--bg-elevated)]'}`}
    >
      <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'left-[22px]' : 'left-[3px]'}`} />
    </button>
  );
}

function SettingRow({ title, description, right, border = true }) {
  return (
    <>
      <div className="flex items-start justify-between py-4 gap-6">
        <div className="min-w-0">
          <p className="text-[14px] text-[var(--text-primary)] font-medium">{title}</p>
          {description && <p className="text-[12px] text-[var(--text-muted)] mt-0.5 leading-relaxed">{description}</p>}
        </div>
        <div className="flex-shrink-0">{right}</div>
      </div>
      {border && <div className="h-px bg-[var(--bg-elevated)]" />}
    </>
  );
}

function SectionHeader({ title }) {
  return <h3 className="text-[13px] font-bold text-[var(--text-primary)] uppercase tracking-wider mt-8 mb-2">{title}</h3>;
}

function StorageScope({ title, icon, bytes, count, children, emptyText = 'No stored media' }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-[var(--bg-elevated)]"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--bg-elevated)] text-[var(--text-muted)]">
          <ion-icon name={icon} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--text-primary)]">{title}</span>
          <span className="block text-[11px] text-[var(--text-muted)]">{count ? `${count} asset${count === 1 ? '' : 's'}` : emptyText}</span>
        </span>
        <span className="text-xs font-semibold text-[var(--text-body)]">{formatBytes(bytes)}</span>
        <ion-icon className={open ? 'rotate-180 transition-transform' : 'transition-transform'} name="chevron-down-outline" />
      </button>
      {open && (
        <div className="border-t border-[var(--border-default)] px-4 py-3">
          {children || <p className="text-xs text-[var(--text-faint)]">{emptyText}</p>}
        </div>
      )}
    </div>
  );
}

function DropdownSelect({ value, options, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg px-3 py-1.5 text-[13px] text-[var(--text-body)] outline-none focus:border-[var(--border-hover)] transition-colors cursor-pointer appearance-none pr-8"
      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23777' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

const TIMEZONES = [
  '', 'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Sao_Paulo', 'America/Argentina/Buenos_Aires', 'Europe/London', 'Europe/Paris',
  'Europe/Berlin', 'Europe/Moscow', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai',
  'Asia/Tokyo', 'Asia/Seoul', 'Asia/Singapore', 'Australia/Sydney', 'Pacific/Auckland',
  'Africa/Cairo', 'Africa/Nairobi', 'Africa/Lagos',
];

const USER_LINK_PRESETS = [
  { key: 'website', label: 'Website', icon: 'globe-outline', placeholder: 'https://example.com', prefix: 'https://' },
  { key: 'github', label: 'GitHub', icon: 'logo-github', placeholder: 'https://github.com/username', prefix: 'https://github.com/' },
  { key: 'twitter', label: 'X / Twitter', icon: 'logo-twitter', placeholder: 'https://x.com/username', prefix: 'https://x.com/' },
  { key: 'linkedin', label: 'LinkedIn', icon: 'logo-linkedin', placeholder: 'https://linkedin.com/in/username', prefix: 'https://linkedin.com/in/' },
  { key: 'mastodon', label: 'Mastodon', icon: 'globe-outline', placeholder: 'https://mastodon.social/@user', prefix: 'https://' },
  { key: 'custom', label: 'Custom Link', icon: 'link-outline', placeholder: 'https://...', prefix: 'https://' },
];

function OrganizationMentionField({ value, onChange, organizations, multiline = false, className, ...props }) {
  const mention = value.match(/(?:^|\s)@([a-z0-9-]*)$/i);
  const query = mention?.[1]?.toLowerCase() || '';
  const suggestions = mention
    ? organizations.filter(org => org.slug?.toLowerCase().includes(query) || org.name?.toLowerCase().includes(query)).slice(0, 5)
    : [];

  const choose = (org) => {
    const start = mention.index + mention[0].lastIndexOf('@');
    onChange(`${value.slice(0, start)}@${org.slug} ${value.slice(mention.index + mention[0].length)}`);
  };
  const Field = multiline ? 'textarea' : 'input';

  return (
    <div className="relative">
      <Field value={value} onChange={e => onChange(e.target.value)} className={className} {...props} />
      {suggestions.length > 0 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xl">
          {suggestions.map(org => (
            <button key={org.id} type="button" onMouseDown={event => event.preventDefault()} onClick={() => choose(org)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--bg-elevated)]">
              <span className="text-xs font-semibold text-[var(--accent)]">@{org.slug}</span>
              <span className="truncate text-xs text-[var(--text-muted)]">{org.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Account Tab ──
function AccountTab({ user, refetchUser }) {
  const [displayName, setDisplayName] = useState(user.display_name || '');
  const [designation, setDesignation] = useState(user.designation || '');
  const [bio, setBio] = useState(user.bio || '');
  const [pronouns, setPronouns] = useState(user.pronouns || '');
  const [location, setLocation] = useState(user.location || '');
  const [timezone, setTimezone] = useState(user.timezone || '');
  const [website, setWebsite] = useState(user.website || '');
  const [company, setCompany] = useState(user.company || '');
  const [links, setLinks] = useState(() => {
    try { const p = JSON.parse(user.links || '[]'); return Array.isArray(p) ? p : []; } catch { return []; }
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [organizations, setOrganizations] = useState([]);

  const profileFingerprint = JSON.stringify({ displayName, designation, bio, pronouns, location, timezone, website, company, links });
  const [savedFingerprint, setSavedFingerprint] = useState(profileFingerprint);
  const hasChanges = profileFingerprint !== savedFingerprint;

  useEffect(() => {
    fetch('/api/orgs')
      .then(response => response.ok ? response.json() : { orgs: [] })
      .then(data => setOrganizations((data.orgs || []).filter(org => org.visibility !== 'private')))
      .catch(() => setOrganizations([]));
  }, []);

  const addLink = (preset) => setLinks([...links, { type: preset.key, label: preset.label, url: preset.prefix }]);
  const updateLink = (i, field, value) => { const u = [...links]; u[i] = { ...u[i], [field]: value }; setLinks(u); };
  const removeLink = (i) => setLinks(links.filter((_, idx) => idx !== i));
  const addedTypes = new Set(links.map(l => l.type));

  const handleSave = async () => {
    if (saving || !hasChanges) return;
    setSaving(true);
    try {
      const activeLinks = links.filter(link => {
        const preset = USER_LINK_PRESETS.find(item => item.key === link.type);
        return link.url?.trim() && link.url.trim() !== preset?.prefix;
      });
      const res = await fetch('/api/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName, designation, bio, pronouns, location, timezone,
          website: website === 'https://' ? '' : website, company, links: activeLinks,
        }),
      });
      if (res.ok) {
        setSavedFingerprint(profileFingerprint);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
        refetchUser?.();
      }
    } catch {}
    setSaving(false);
  };

  const inputCls = "w-full bg-[var(--bg-base)] text-[var(--text-primary)] rounded-lg px-3.5 py-2.5 outline-none text-[13px] border border-[var(--border-default)] focus:border-[#9b7bf7]/50 transition-colors placeholder-[var(--text-faint)]";

  return (
    <div className="space-y-8">
      {/* ── Identity ── */}
      <section>
        <h3 className="text-[11px] font-semibold text-[var(--text-faint)] uppercase tracking-widest mb-4">Profile</h3>
        <div className="space-y-4">
          <div className="flex items-center gap-4 p-4 bg-[var(--card-bg)] border border-[var(--border-default)] rounded-xl">
            <img src={user.avatar_url || generatePixelAvatar(user.username || user.display_name)} alt="" className="h-16 w-16 rounded-full object-cover ring-2 ring-[var(--border-default)]" />
            <div className="min-w-0">
              <p className="text-[15px] text-[var(--text-primary)] font-semibold">{user.display_name || user.username}</p>
              <p className="text-[13px] text-[var(--text-faint)]">@{user.username} &middot; {user.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[13px] text-[var(--text-primary)] mb-1 block font-medium">Display name</label>
              <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name" className={inputCls} />
            </div>
            <div>
              <label className="text-[13px] text-[var(--text-primary)] mb-1 block font-medium">Pronouns</label>
              <select value={pronouns} onChange={e => setPronouns(e.target.value)} className={inputCls}>
                <option value="">Don&apos;t specify</option>
                <option value="he/him">he/him</option>
                <option value="she/her">she/her</option>
                <option value="they/them">they/them</option>
                <option value="he/they">he/they</option>
                <option value="she/they">she/they</option>
                <option value="custom">Custom</option>
              </select>
              {pronouns === 'custom' && (
                <input value={pronouns} onChange={e => setPronouns(e.target.value)} placeholder="Your pronouns" className={`${inputCls} mt-2`} />
              )}
            </div>
          </div>

          <div>
            <label className="text-[13px] text-[var(--text-primary)] mb-1 block font-medium">Designation</label>
            <p className="text-[11px] text-[var(--text-faint)] mb-2">A short professional headline shown beside your authorship</p>
            <input
              value={designation}
              onChange={e => setDesignation(e.target.value)}
              placeholder="Software engineer and technical writer"
              maxLength={100}
              className={inputCls}
            />
            <p className="text-[10px] text-[var(--text-muted)] mt-1 text-right">{designation.length}/100</p>
          </div>

          <div>
            <label className="text-[13px] text-[var(--text-primary)] mb-1 block font-medium">Bio</label>
            <p className="text-[11px] text-[var(--text-faint)] mb-2">Tell readers a little about yourself</p>
            <OrganizationMentionField
              value={bio} onChange={setBio} organizations={organizations} multiline rows={3} placeholder="Developer, writer, creator... Mention an organization with @"
              maxLength={300}
              className={`${inputCls} resize-none`}
            />
            <p className="text-[10px] text-[var(--text-muted)] mt-1 text-right">{bio.length}/300</p>
          </div>
        </div>
      </section>

      <div className="h-px bg-[#1e2736]" />

      {/* ── Location & Work ── */}
      <section>
        <h3 className="text-[11px] font-semibold text-[var(--text-faint)] uppercase tracking-widest mb-4">Location & Work</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[13px] text-[var(--text-primary)] mb-1 block font-medium">Location</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"><ion-icon name="location-outline" style={{ fontSize: '15px' }} /></span>
              <input value={location} onChange={e => setLocation(e.target.value)} placeholder="City, Country" className={`${inputCls} pl-9`} />
            </div>
          </div>
          <div>
            <label className="text-[13px] text-[var(--text-primary)] mb-1 block font-medium">Company</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"><ion-icon name="business-outline" style={{ fontSize: '15px' }} /></span>
              <OrganizationMentionField value={company} onChange={setCompany} organizations={organizations}
                placeholder="Where you work — type @ to tag an organization" className={`${inputCls} pl-9`} />
            </div>
          </div>
          <div>
            <label className="text-[13px] text-[var(--text-primary)] mb-1 block font-medium">Timezone</label>
            <select value={timezone} onChange={e => setTimezone(e.target.value)} className={inputCls}>
              <option value="">Select timezone...</option>
              {TIMEZONES.filter(Boolean).map(tz => <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[13px] text-[var(--text-primary)] mb-1 block font-medium">Website</label>
            <div className="flex items-center overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] focus-within:border-[#9b7bf7]/50">
              <span className="shrink-0 pl-3 text-[13px] text-[var(--text-muted)]">https://</span>
              <input value={website.replace(/^https?:\/\//, '')} onChange={e => setWebsite(e.target.value ? `https://${e.target.value.replace(/^https?:\/\//, '')}` : '')}
                placeholder="yoursite.com" className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-[13px] text-[var(--text-primary)] outline-none placeholder-[var(--text-faint)]" />
            </div>
          </div>
        </div>
      </section>

      <div className="h-px bg-[#1e2736]" />

      {/* ── Social Links ── */}
      <section>
        <h3 className="text-[11px] font-semibold text-[var(--text-faint)] uppercase tracking-widest mb-1">Social Links</h3>
        <p className="text-[11px] text-[var(--text-faint)] mb-4">Add links to your profiles on other platforms.</p>

        {links.length > 0 && (
          <div className="space-y-2.5 mb-4">
            {links.map((link, i) => {
              const preset = USER_LINK_PRESETS.find(p => p.key === link.type) || USER_LINK_PRESETS.at(-1);
              return (
                <div key={i} className="flex items-center gap-3 p-3 bg-[var(--card-bg)] border border-[var(--border-default)] rounded-xl group">
                  <div className="h-8 w-8 rounded-lg bg-[var(--bg-base)] flex items-center justify-center shrink-0">
                    <ion-icon name={preset.icon} style={{ fontSize: '16px', color: '#7c8a9e' }} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    {link.type === 'custom' && (
                      <input value={link.label || ''} onChange={e => updateLink(i, 'label', e.target.value)} placeholder="Label"
                        className="w-full bg-transparent text-[12px] text-[var(--text-primary)] outline-none placeholder-[var(--text-faint)] font-medium" />
                    )}
                    {link.type !== 'custom' && (
                      <p className="text-[11px] text-[var(--text-faint)] font-medium">{preset.label}</p>
                    )}
                    <input value={link.url || ''} onChange={e => updateLink(i, 'url', e.target.value)} placeholder={preset.placeholder}
                      className="w-full bg-transparent text-[13px] text-[var(--text-primary)] outline-none placeholder-[var(--text-faint)]" />
                  </div>
                  <button onClick={() => removeLink(i)} className="text-[var(--text-muted)] hover:text-[#f87171] transition-colors p-1 opacity-0 group-hover:opacity-100">
                    <ion-icon name="trash-outline" style={{ fontSize: '15px' }} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {USER_LINK_PRESETS.map(preset => (
            <button key={preset.key} onClick={() => addLink(preset)}
              disabled={preset.key !== 'custom' && addedTypes.has(preset.key)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--card-bg)] border border-[var(--border-default)] rounded-lg text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[#2d3a4d] transition-all disabled:opacity-30 disabled:cursor-not-allowed">
              <ion-icon name={preset.icon} style={{ fontSize: '13px' }} />
              {preset.label}
            </button>
          ))}
        </div>
      </section>

      <div className="h-px bg-[#1e2736]" />

      <TopicPreferences />

      <div className="h-px bg-[#1e2736]" />

      {/* ── Save ── */}
      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving || !hasChanges}
          className="px-6 py-2.5 bg-[#9b7bf7] text-white font-semibold rounded-lg text-[13px] hover:bg-[#b69aff] transition-colors disabled:opacity-40">
          {saving ? 'Saving...' : saved && !hasChanges ? 'Saved!' : 'Save changes'}
        </button>
        {saved && !hasChanges && <span className="text-[12px] text-[#4ade80] flex items-center gap-1"><ion-icon name="checkmark-circle" style={{ fontSize: '14px' }} /> Profile updated</span>}
      </div>

      <div className="h-px bg-[#1e2736]" />

      {/* ── Danger zone ── */}
      <DangerZone />
    </div>
  );
}

// ── Publishing Tab ──
function PublishingTab({ user }) {
  const [privateNotes, setPrivateNotes] = useState(true);
  const [tipping, setTipping] = useState(false);
  const [emailReplies, setEmailReplies] = useState(false);
  const [replyTo, setReplyTo] = useState(user.email || '');
  const [license, setLicense] = useState('all-rights-reserved');
  const [allowPublicCuration, setAllowPublicCuration] = useState(true);
  const [curationLoading, setCurationLoading] = useState(true);
  const [curationSaved, setCurationSaved] = useState(false);

  useEffect(() => {
    fetch('/api/library/curation-preferences')
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(data => {
        setAllowPublicCuration(data.allowPublicCuration !== false);
        setLicense(data.defaultLicense || 'all-rights-reserved');
      })
      .catch(() => {})
      .finally(() => setCurationLoading(false));
  }, []);

  const updateCurationPreferences = async (changes) => {
    setCurationSaved(false);
    const response = await fetch('/api/library/curation-preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
    if (response.ok) {
      setCurationSaved(true);
      setTimeout(() => setCurationSaved(false), 1800);
    }
  };

  return (
    <div>
      <SettingRow
        title="Manage publications"
        description="Create and manage your publications on LixBlogs."
        right={
          <Link href="/settings/publisher" className="text-[13px] text-[#9b7bf7] hover:text-[#b69aff] transition-colors font-medium">
            Manage
          </Link>
        }
      />

      <SettingRow
        title="Manage tipping on your stories"
        description="Readers can send you tips through the third-party platform of your choice."
        right={
          <span className="text-[13px] text-[var(--text-muted)]">{tipping ? 'Enabled' : 'Disabled'}</span>
        }
      />

      <SettingRow
        title="Default content license"
        description="Applied to new stories unless overridden per-post."
        right={
          <DropdownSelect
            value={license}
            onChange={(value) => { setLicense(value); updateCurationPreferences({ defaultLicense: value }); }}
            options={[
              { value: 'all-rights-reserved', label: 'All Rights Reserved' },
              { value: 'cc-by-4.0', label: 'CC BY 4.0' },
              { value: 'cc-by-sa-4.0', label: 'CC BY-SA 4.0' },
              { value: 'cc-by-nc-4.0', label: 'CC BY-NC 4.0' },
              { value: 'cc0-1.0', label: 'Public Domain (CC0)' },
            ]}
          />
        }
      />

      <SettingRow
        title="Allow public curation"
        description="Let other users add your public stories to their collections. Attribution, canonical ownership, and your selected license are always preserved."
        right={<Toggle checked={allowPublicCuration} disabled={curationLoading} onChange={(value) => { setAllowPublicCuration(value); updateCurationPreferences({ allowPublicCuration: value }); }} />}
      />
      {curationSaved && <p className="px-1 pb-3 text-[12px] text-emerald-500">Publishing preferences saved.</p>}

      <div className="h-px bg-[var(--bg-elevated)] mt-2" />

      <SettingRow
        title="Allow email replies"
        description="Let readers reply to your stories directly from their email."
        right={<Toggle checked={emailReplies} onChange={setEmailReplies} />}
      />

      <SettingRow
        title="'Reply To' email address"
        description="Shown to your subscribers when they reply."
        right={<span className="text-[13px] text-[var(--text-muted)]">{replyTo}</span>}
      />

    </div>
  );
}

// ── Notifications Tab ──
function NotificationsTab() {
  const [prefs, setPrefs] = useState({
    digest: true,
    digestFreq: 'daily',
    recommended: true,
    newListStories: true,
    follows: true,
    highlights: true,
    replies: true,
    mentions: 'network',
    publishedActivity: true,
    listActivity: true,
    featureStories: true,
    submissions: true,
    submissionStatus: true,
    newFeatures: true,
    membership: true,
    announcements: true,
    allowEmail: true,
  });

  const update = (key, val) => setPrefs((p) => ({ ...p, [key]: val }));

  return (
    <div>
      <SectionHeader title="Story recommendations" />
      <SettingRow
        title="LixBlogs Digest"
        description="The best stories on LixBlogs personalized based on your interests, as well as outstanding stories selected by our editors."
        right={<Toggle checked={prefs.digest} onChange={(v) => update('digest', v)} />}
      />
      <SettingRow
        title="Your LixBlogs Digest frequency"
        description="Adjust how often you see a new Digest."
        right={
          <DropdownSelect
            value={prefs.digestFreq}
            onChange={(v) => update('digestFreq', v)}
            options={[
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
            ]}
          />
        }
      />
      <SettingRow
        title="Recommended reading"
        description="Featured stories, columns, and collections that we think you'll enjoy based on your reading history."
        right={<Toggle checked={prefs.recommended} onChange={(v) => update('recommended', v)} />}
      />

      <SectionHeader title="From writers and publications" />
      <SettingRow
        title="New stories added to lists you've saved"
        right={<Toggle checked={prefs.newListStories} onChange={(v) => update('newListStories', v)} />}
      />

      <SectionHeader title="Social activity" />
      <SettingRow
        title="Follows and matching highlights"
        right={<Toggle checked={prefs.follows} onChange={(v) => update('follows', v)} />}
      />
      <SettingRow
        title="Replies to your responses"
        right={<Toggle checked={prefs.replies} onChange={(v) => update('replies', v)} />}
      />
      <SettingRow
        title="Story mentions"
        right={
          <DropdownSelect
            value={prefs.mentions}
            onChange={(v) => update('mentions', v)}
            options={[
              { value: 'network', label: 'In network' },
              { value: 'everyone', label: 'Everyone' },
              { value: 'off', label: 'Off' },
            ]}
          />
        }
      />

      <SectionHeader title="For writers" />
      <SettingRow
        title="Activity on your published stories"
        right={<Toggle checked={prefs.publishedActivity} onChange={(v) => update('publishedActivity', v)} />}
      />
      <SettingRow
        title="Activity on your lists"
        right={<Toggle checked={prefs.listActivity} onChange={(v) => update('listActivity', v)} />}
      />
      <SettingRow
        title="From editors about featuring your stories"
        right={<Toggle checked={prefs.featureStories} onChange={(v) => update('featureStories', v)} />}
      />

      <SectionHeader title="For publications" />
      <SettingRow
        title="New submissions"
        right={<Toggle checked={prefs.submissions} onChange={(v) => update('submissions', v)} />}
      />

      <SectionHeader title="For submissions" />
      <SettingRow
        title="Submission status changes"
        right={<Toggle checked={prefs.submissionStatus} onChange={(v) => update('submissionStatus', v)} />}
      />

      <SectionHeader title="Others from LixBlogs" />
      <SettingRow
        title="New product features from LixBlogs"
        right={<Toggle checked={prefs.newFeatures} onChange={(v) => update('newFeatures', v)} />}
      />
      <SettingRow
        title="Information about LixBlogs subscription"
        right={<Toggle checked={prefs.membership} onChange={(v) => update('membership', v)} />}
      />
      <SettingRow
        title="Writing updates and announcements"
        right={<Toggle checked={prefs.announcements} onChange={(v) => update('announcements', v)} />}
      />

      <div className="h-px bg-[var(--bg-elevated)] mt-4" />
      <SettingRow
        title="Allow email notifications"
        description="You'll still receive administrative emails even if this setting is off."
        right={<Toggle checked={prefs.allowEmail} onChange={(v) => update('allowEmail', v)} />}
        border={false}
      />
    </div>
  );
}

// Random org name suggestions (GitHub-style)
const ORG_NAME_ADJECTIVES = ['curious', 'bold', 'swift', 'bright', 'calm', 'cool', 'epic', 'kind', 'lucky', 'neat', 'rare', 'wise', 'keen', 'cozy', 'zesty'];
const ORG_NAME_NOUNS = ['panda', 'falcon', 'lotus', 'spark', 'pixel', 'orbit', 'coral', 'cedar', 'flint', 'prism', 'ridge', 'bloom', 'ember', 'drift', 'grove'];

function getRandomOrgNames(count = 3) {
  const names = [];
  const used = new Set();
  while (names.length < count) {
    const adj = ORG_NAME_ADJECTIVES[Math.floor(Math.random() * ORG_NAME_ADJECTIVES.length)];
    const noun = ORG_NAME_NOUNS[Math.floor(Math.random() * ORG_NAME_NOUNS.length)];
    const combo = `${adj}-${noun}`;
    if (!used.has(combo)) { used.add(combo); names.push(combo); }
  }
  return names;
}

// ── Create Org Modal ──
function CreateOrgModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [bio, setBio] = useState('');
  const [website, setWebsite] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [category, setCategory] = useState('');
  const [bioPreview, setBioPreview] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [slugAvailable, setSlugAvailable] = useState(null);
  const [suggestions] = useState(() => getRandomOrgNames(3));
  const [avatarSeed] = useState(() => `org-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);

  useEffect(() => {
    if (name) {
      setSlug(name.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 40));
    }
  }, [name]);

  // Check slug availability (debounced)
  const [slugError, setSlugError] = useState('');
  useEffect(() => {
    if (!slug || slug.length < 2) { setSlugAvailable(null); setSlugError(''); return; }
    const timer = setTimeout(() => {
      fetch(`/api/check-name?name=${encodeURIComponent(slug)}`)
        .then(r => r.json())
        .then(d => {
          setSlugAvailable(d.available);
          setSlugError(d.available ? '' : (d.error || 'Already taken'));
        })
        .catch(() => { setSlugAvailable(null); setSlugError(''); });
    }, 800);
    return () => clearTimeout(timer);
  }, [slug]);

  const handleCreate = async () => {
    if (!name.trim() || !slug.trim() || creating) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), slug, tagline, description, bio, website, visibility: 'public' }),
      });
      const data = await res.json();
      if (res.ok) {
        onCreated?.(data);
        onClose();
      } else {
        setError(data.error || 'Failed to create');
      }
    } catch { setError('Network error'); }
    setCreating(false);
  };

  const ORG_CATEGORIES = ['Tech', 'Open Source', 'Education', 'Media', 'Community', 'Business', 'Non-profit', 'Creative', 'Research', 'Other'];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-[var(--border-default)]">
          <div>
            <h2 className="text-[18px] font-bold text-[var(--text-primary)]">Create Organization</h2>
            <p className="text-[12px] text-[var(--text-muted)] mt-0.5">Organizations are always public and visible to everyone.</p>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Avatar centered */}
          <div className="flex flex-col items-center mb-2">
            <img src={generatePixelAvatar(slug || name || avatarSeed)} alt="" className="w-28 h-28 rounded-2xl" />
            <p className="text-[10px] text-[var(--text-faint)] mt-2">Auto-generated — change later in settings</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[12px] text-[var(--text-muted)] mb-1.5 block font-medium">Organization name *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Name"
                className="w-full bg-[var(--bg-app)] text-[var(--text-primary)] rounded-lg px-3 py-2 outline-none text-[13px] border border-[var(--border-default)] focus:border-[var(--border-hover)] transition-colors placeholder-[var(--text-faint)]" />
            </div>
            <div>
              <label className="text-[12px] text-[var(--text-muted)] mb-1.5 block font-medium">
                URL slug *
                {slug && slugAvailable === true && <span className="text-[#4ade80] ml-2">Available</span>}
                {slug && slugAvailable === false && <span className="text-[#f87171] ml-2">{slugError || 'Taken'}</span>}
              </label>
              <div className="flex items-center bg-[var(--bg-app)] rounded-lg border border-[var(--border-default)] overflow-hidden">
                <span className="text-[var(--text-muted)] text-[13px] px-3 flex-shrink-0">@</span>
                <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^\w-]/g, ''))}
                  className="flex-1 bg-transparent text-[var(--text-primary)] py-2 pr-3 outline-none text-[13px]" />
              </div>
            </div>
          </div>

          {/* Suggestions */}
          {!name && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-[var(--text-faint)]">Try:</span>
              {suggestions.map(s => (
                <button key={s} onClick={() => setName(s)}
                  className="px-3 py-1 text-[12px] text-[#9b7bf7] bg-[#9b7bf70a] border border-[#9b7bf720] rounded-full hover:bg-[#9b7bf714] transition-colors">
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="h-px bg-[var(--bg-elevated)]" />

          {/* Two-column layout */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] text-[var(--text-muted)] mb-1.5 block font-medium">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full bg-[var(--bg-app)] text-[var(--text-primary)] rounded-lg px-3 py-2 outline-none text-[13px] border border-[var(--border-default)] focus:border-[var(--border-hover)]">
                <option value="">Select...</option>
                {ORG_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[12px] text-[var(--text-muted)] mb-1.5 block font-medium">
                Website
                {website && !website.startsWith('https://') && website.length > 3 && <span className="text-[#f87171] ml-1.5 font-normal">must start with https://</span>}
              </label>
              <div className="flex items-center bg-[var(--bg-app)] rounded-lg border border-[var(--border-default)] overflow-hidden">
                <span className="text-[var(--text-faint)] text-[12px] px-2.5 flex-shrink-0">https://</span>
                <input
                  value={website.replace(/^https?:\/\//, '')}
                  onChange={e => setWebsite('https://' + e.target.value.replace(/^https?:\/\//, ''))}
                  placeholder="example.com"
                  className="flex-1 bg-transparent text-[var(--text-primary)] py-2 pr-3 outline-none text-[13px]" />
              </div>
            </div>
          </div>

          <div>
            <label className="text-[12px] text-[var(--text-muted)] mb-1.5 block font-medium">
              Contact email
              {contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) && <span className="text-[#f87171] ml-1.5 font-normal">invalid email</span>}
            </label>
            <input value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="org@example.com" type="email"
              className="w-full bg-[var(--bg-app)] text-[var(--text-primary)] rounded-lg px-3 py-2 outline-none text-[13px] border border-[var(--border-default)] focus:border-[var(--border-hover)] placeholder-[var(--text-faint)]" />
          </div>

          <div>
            <label className="text-[12px] text-[var(--text-muted)] mb-1.5 block font-medium">Tagline</label>
            <input value={tagline} onChange={e => setTagline(e.target.value)} placeholder="Open-source infrastructure and engineering" maxLength={100}
              className="w-full bg-[var(--bg-app)] text-[var(--text-primary)] rounded-lg px-3 py-2 outline-none text-[13px] border border-[var(--border-default)] focus:border-[var(--border-hover)] placeholder-[var(--text-faint)]" />
            <p className="mt-1 text-right text-[10px] text-[var(--text-muted)]">{tagline.length}/100</p>
          </div>

          <div>
            <label className="text-[12px] text-[var(--text-muted)] mb-1.5 block font-medium">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What does your organization publish?" maxLength={160}
              className="w-full bg-[var(--bg-app)] text-[var(--text-primary)] rounded-lg px-3 py-2 outline-none text-[13px] border border-[var(--border-default)] focus:border-[var(--border-hover)] placeholder-[var(--text-faint)]" />
          </div>

          {/* About — code/preview toggle like GitHub */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[12px] text-[var(--text-muted)] font-medium">About</label>
              <div className="flex bg-[var(--bg-app)] rounded-md border border-[var(--border-default)] overflow-hidden">
                <button type="button" onClick={() => setBioPreview(false)}
                  className={`px-3 py-1 text-[11px] font-medium transition-colors ${!bioPreview ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]' : 'text-[var(--text-faint)] hover:text-[#999]'}`}>
                  Write
                </button>
                <button type="button" onClick={() => setBioPreview(true)}
                  className={`px-3 py-1 text-[11px] font-medium transition-colors ${bioPreview ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]' : 'text-[var(--text-faint)] hover:text-[#999]'}`}>
                  Preview
                </button>
              </div>
            </div>
            {!bioPreview ? (
              <textarea value={bio} onChange={e => setBio(e.target.value)} rows={4} placeholder="Supports **bold**, *italic*, [links](url), `code`, lists..."
                className="w-full bg-[var(--bg-app)] text-[var(--text-primary)] rounded-lg px-3 py-2 outline-none text-[13px] font-mono border border-[var(--border-default)] focus:border-[var(--border-hover)] placeholder-[var(--text-faint)] resize-none" />
            ) : (
              <div className="bg-[var(--bg-app)] border border-[var(--border-default)] rounded-lg px-3 py-2 min-h-[100px] text-[13px] text-[var(--text-secondary)] leading-relaxed"
                dangerouslySetInnerHTML={{ __html: bio
                  ? bio
                    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                    .replace(/^### (.+)$/gm, '<h3 style="font-size:15px;font-weight:600;color:#e0e0e0;margin:12px 0 4px">$1</h3>')
                    .replace(/^## (.+)$/gm, '<h2 style="font-size:17px;font-weight:700;color:#e0e0e0;margin:14px 0 4px">$1</h2>')
                    .replace(/^# (.+)$/gm, '<h1 style="font-size:20px;font-weight:800;color:#fff;margin:16px 0 6px">$1</h1>')
                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.+?)\*/g, '<em>$1</em>')
                    .replace(/~~(.+?)~~/g, '<del>$1</del>')
                    .replace(/`(.+?)`/g, '<code style="background:#232d3f;padding:1px 4px;border-radius:3px;font-size:12px;color:#c4b5fd">$1</code>')
                    .replace(/\[(.+?)\]\((.+?)\)/g, (_m, text, url) => {
                      const u = (url || '').trim();
                      // Allow only http(s)/mailto/relative; block javascript:, data:, etc.
                      const safe = /^(https?:\/\/|mailto:|\/)/i.test(u) ? u.replace(/"/g, '%22') : '#';
                      return `<a href="${safe}" style="color:#60a5fa;text-decoration:none">${text}</a>`;
                    })
                    .replace(/^- (.+)$/gm, '<li style="margin-left:16px">$1</li>')
                    .replace(/^&gt; (.+)$/gm, '<blockquote style="border-left:3px solid #9b7bf740;padding-left:12px;color:#9ca3af;margin:8px 0">$1</blockquote>')
                    .replace(/\n/g, '<br>')
                  : '<span style="color:#666">Nothing to preview</span>'
                }} />
            )}
          </div>

          {/* Info box */}
          <div className="bg-[var(--bg-app)] border border-[var(--border-default)] rounded-lg p-4 flex gap-3">
            <svg className="w-5 h-5 text-[#60a5fa] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <div className="text-[12px] text-[var(--text-muted)] leading-relaxed">
              <p className="mb-1">As the owner you&apos;ll have full admin access. You can:</p>
              <ul className="list-disc ml-4 space-y-0.5">
                <li>Invite members with admin, maintain, write, or read roles</li>
                <li>Create collections to organize blogs</li>
                <li>Publish blogs under the org name</li>
                <li>Generate shareable invite links with expiry</li>
              </ul>
            </div>
          </div>

          {error && <p className="text-[12px] text-[#f87171]">{error}</p>}
        </div>

        <div className="p-6 border-t border-[var(--border-default)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-[#4ade80]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" /></svg>
            <span className="text-[12px] text-[var(--text-muted)]">Public — visible to everyone</span>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2.5 text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Cancel</button>
            <button onClick={handleCreate} disabled={!name.trim() || !slug.trim() || slugAvailable === false || creating}
              className="px-6 py-2.5 bg-[#9b7bf7] text-[var(--text-primary)] font-semibold rounded-lg text-[13px] hover:bg-[#b69aff] transition-colors disabled:opacity-40">
              {creating ? 'Creating...' : 'Create Organization'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Confirmation Modal ──
function ConfirmModal({ title, description, confirmLabel, onConfirm, onCancel, destructive = false }) {
  const [typed, setTyped] = useState('');
  const confirmWord = destructive ? 'DELETE' : 'CONFIRM';
  const canConfirm = typed === confirmWord;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: 'var(--bg-app)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(248,113,113,0.1)' }}>
            <ion-icon name="warning-outline" style={{ fontSize: '20px', color: '#f87171' }} />
          </div>
          <h3 className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
        </div>
        <p className="text-[13px] leading-relaxed mb-4" style={{ color: 'var(--text-muted)' }}>{description}</p>
        <p className="text-[12px] mb-2" style={{ color: 'var(--text-faint)' }}>
          Type <strong style={{ color: 'var(--text-primary)' }}>{confirmWord}</strong> to confirm:
        </p>
        <input
          value={typed}
          onChange={e => setTyped(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-[13px] outline-none mb-5"
          style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
          placeholder={confirmWord}
          autoFocus
        />
        <div className="flex items-center gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-[13px] font-medium transition-colors"
            style={{ color: 'var(--text-body)', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className="px-4 py-2 rounded-lg text-[13px] font-medium text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#ef4444' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Danger Zone ──
function DangerZone() {
  const [showDisable, setShowDisable] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const { logout } = useAuth();

  const handleDisable = async () => {
    try {
      await fetch('/api/users/me/disable', { method: 'POST' });
      logout();
    } catch {}
    setShowDisable(false);
  };

  // Account deletion/revocation is owned by Elixpo Accounts (the identity
  // source of truth). We never delete the identity here — we send the user to
  // accounts.elixpo to revoke the app; accounts then signals us (webhook) to
  // purge their blogs data and bounces them back to /api/auth/revoked, which
  // clears the session. See GitHub issue #8.
  const handleDelete = () => {
    setShowDelete(false);
    const returnTo = `${window.location.origin}/api/auth/revoked`;
    window.location.href =
      `https://accounts.elixpo.com/dashboard/services?revoke=blogs&return_to=${encodeURIComponent(returnTo)}`;
  };

  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-4" style={{ color: 'rgba(248,113,113,0.5)' }}>Danger Zone</h3>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(248,113,113,0.2)' }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(248,113,113,0.1)' }}>
          <div>
            <p className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>Disable Account</p>
            <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Temporarily hide your profile and content.</p>
          </div>
          <button
            onClick={() => setShowDisable(true)}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
            style={{ color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', backgroundColor: 'rgba(248,113,113,0.05)' }}
          >
            Disable
          </button>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>Delete Account</p>
            <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Revoke on Elixpo Accounts — permanently deletes your blogs, data, and all mentions.</p>
          </div>
          <button
            onClick={() => setShowDelete(true)}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
            style={{ color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', backgroundColor: 'rgba(248,113,113,0.05)' }}
          >
            Delete
          </button>
        </div>
      </div>

      {showDisable && (
        <ConfirmModal
          title="Disable Account"
          description="Your profile and blogs will be hidden from everyone. You can reactivate anytime by signing back in."
          confirmLabel="Disable Account"
          onConfirm={handleDisable}
          onCancel={() => setShowDisable(false)}
        />
      )}

      {showDelete && (
        <ConfirmModal
          title="Delete Account"
          description="You'll be taken to Elixpo Accounts to revoke access. Once you confirm there, your LixBlogs account, all your blogs, comments, likes, and mentions are permanently deleted and you'll be signed out. This cannot be undone."
          confirmLabel="Continue to Elixpo Accounts"
          onConfirm={handleDelete}
          onCancel={() => setShowDelete(false)}
          destructive
        />
      )}
    </section>
  );
}

// ── Organization Tab ──
function OrganizationTab({ user }) {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchOrgs = useCallback(() => {
    fetch('/api/orgs')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.orgs) setOrgs(d.orgs); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchOrgs(); }, [fetchOrgs]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-[15px] text-[var(--text-primary)] font-semibold">Your Organizations</h3>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5">Create and manage organizations to publish collaboratively.</p>
        </div>
        {(() => {
          const orgLimit = user?.tier === 'member' ? 5 : 1;
          const atLimit = orgs.length >= orgLimit;
          return (
            <button
              onClick={() => !atLimit && setShowCreateModal(true)}
              disabled={atLimit}
              className="px-4 py-2 text-[13px] font-medium text-[var(--text-primary)] bg-[#9b7bf7] hover:bg-[#b69aff] rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={atLimit ? `Free plan allows ${orgLimit} organization. Upgrade for more.` : ''}
            >
              Create Organization
            </button>
          );
        })()}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => <div key={i} className="h-16 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl animate-pulse" />)}
        </div>
      ) : orgs.length > 0 ? (
        <div className="space-y-3">
          {orgs.map((org) => (
            <div key={org.id} className="flex items-center gap-4 p-4 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl">
              <img src={org.logo_url || generatePixelAvatar(org.slug)} alt="" className="h-10 w-10 rounded-lg object-cover flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] text-[var(--text-primary)] font-medium truncate">{org.name}</p>
                <p className="text-[12px] text-[var(--text-muted)] truncate">
                  @{org.slug} &middot; {org.role} &middot; {org.member_count || 1} member{(org.member_count || 1) !== 1 ? 's' : ''}
                </p>
              </div>
              <ion-icon
                name={org.visibility === 'private' ? 'lock-closed-outline' : 'globe-outline'}
                style={{ fontSize: '16px', color: org.visibility === 'private' ? '#f87171' : '#4ade80' }}
                title={org.visibility === 'private' ? 'Private' : 'Public'}
              />
              <Link
                href={`/settings/org/${org.slug}`}
                className="px-3 py-1.5 text-[12px] font-medium rounded-lg transition-colors"
                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-body)', border: '1px solid var(--border-default)' }}
              >
                Manage
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl">
          <svg className="w-12 h-12 text-[var(--border-default)] mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <p className="text-[var(--text-muted)] text-[14px] font-medium mb-1">No organizations yet</p>
          <p className="text-[var(--text-muted)] text-[12px] mb-5">Create one to collaborate with others.</p>
          <button onClick={() => setShowCreateModal(true)} className="px-5 py-2 text-[13px] font-medium text-[var(--text-primary)] bg-[#9b7bf7] hover:bg-[#b69aff] rounded-full transition-colors">
            Create your first organization
          </button>
        </div>
      )}

      {showCreateModal && (
        <CreateOrgModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => fetchOrgs()}
        />
      )}
    </div>
  );
}

// ── Usage Meter ──
function UsageMeter({ label, icon, used, limit, unit, percent, color = '#9b7bf7' }) {
  const capped = Math.min(percent, 100);
  return (
    <div className="py-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <ion-icon name={icon} style={{ fontSize: '16px', color: 'var(--text-faint)' }} />
          <span className="text-[13px] font-medium text-[var(--text-primary)]">{label}</span>
        </div>
        <span className="text-[12px] text-[var(--text-muted)]">
          {used}{unit ? ` ${unit}` : ''} <span className="text-[var(--text-faint)]">/ {limit}{unit ? ` ${unit}` : ''}</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${capped}%`, backgroundColor: capped >= 90 ? '#ef4444' : capped >= 70 ? '#f59e0b' : color }}
        />
      </div>
    </div>
  );
}

// ── Subscription Tab ──
function SubscriptionTab({ user }) {
  const currentTier = user?.tier || 'free';
  const [usage, setUsage] = useState(null);
  const [loadingUsage, setLoadingUsage] = useState(true);

  useEffect(() => {
    fetch('/api/tier/usage')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setUsage(d); })
      .catch(() => {})
      .finally(() => setLoadingUsage(false));
  }, []);

  return (
    <div>
      {/* Plan header */}
      <div className="flex items-center justify-between py-6 mb-2">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#9b7bf714] flex items-center justify-center">
            <ion-icon name={currentTier === 'member' ? 'diamond' : 'diamond-outline'} style={{ fontSize: '24px', color: '#9b7bf7' }} />
          </div>
          <div>
            <h3 className="text-[16px] font-bold text-[var(--text-primary)]">
              {currentTier === 'member' ? 'Member' : 'Free'} Plan
            </h3>
            <p className="text-[12px] text-[var(--text-muted)]">
              {currentTier === 'member' ? 'Full access to all features' : 'Basic access with usage limits'}
            </p>
          </div>
        </div>
        <Link
          href="/pricing"
          className="px-4 py-2 rounded-lg text-[13px] font-medium transition-colors"
          style={currentTier === 'member'
            ? { color: 'var(--text-body)', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }
            : { color: 'white', background: 'linear-gradient(135deg, #9b7bf7, #7c5ce7)' }
          }
        >
          {currentTier === 'member' ? 'Manage' : 'Upgrade'}
        </Link>
      </div>

      <div className="h-px bg-[var(--bg-elevated)]" />

      {/* Usage section */}
      <SectionHeader title="Usage" />

      {loadingUsage ? (
        <div className="space-y-6 py-4">
          {[...Array(3)].map((_, i) => (
            <div key={i}>
              <div className="h-4 w-32 bg-[var(--bg-elevated)] animate-pulse rounded mb-2" />
              <div className="h-2 bg-[var(--bg-elevated)] animate-pulse rounded-full" />
            </div>
          ))}
        </div>
      ) : usage ? (
        <>
          <UsageMeter
            label="Storage"
            icon="cloud-outline"
            used={usage.storage.usedFormatted}
            limit={usage.storage.limitFormatted}
            percent={usage.storage.percent}
          />
          <div className="h-px bg-[var(--bg-elevated)]" />
          <UsageMeter
            label="AI Requests (today)"
            icon="sparkles-outline"
            used={usage.ai.used}
            limit={usage.ai.limit}
            percent={usage.ai.percent}
            color="#c084fc"
          />
          <div className="h-px bg-[var(--bg-elevated)]" />
          <UsageMeter
            label="Organizations"
            icon="people-outline"
            used={usage.orgs.owned}
            limit={usage.orgs.limit}
            percent={usage.orgs.limit > 0 ? Math.round((usage.orgs.owned / usage.orgs.limit) * 100) : 0}
            color="#60a5fa"
          />
        </>
      ) : (
        <p className="text-[13px] text-[var(--text-muted)] py-4">Unable to load usage data.</p>
      )}

      {/* Limits breakdown */}
      <SectionHeader title="Plan Limits" />

      <div className="rounded-xl border border-[var(--border-default)] overflow-hidden">
        {[
          { label: 'Total storage', value: usage?.storage.limitFormatted || '10 MB', icon: 'cloud-outline' },
          { label: 'Images per blog', value: usage?.limits.imagePerBlogFormatted || '2 MB', icon: 'image-outline' },
          { label: 'AI requests / day', value: `${usage?.ai.limit || 15}`, icon: 'sparkles-outline' },
          { label: 'Co-authors per blog', value: `${usage?.limits.coAuthorsPerBlog || 3}`, icon: 'people-outline' },
          { label: 'Organizations', value: `${usage?.orgs.limit || 1}`, icon: 'business-outline' },
          { label: 'Member-only content', value: usage?.limits.canMarkMemberOnly ? 'Yes' : 'No', icon: 'lock-closed-outline' },
        ].map((item, i, arr) => (
          <div
            key={item.label}
            className="flex items-center justify-between px-4 py-3"
            style={i < arr.length - 1 ? { borderBottom: '1px solid var(--border-default)' } : {}}
          >
            <div className="flex items-center gap-3">
              <ion-icon name={item.icon} style={{ fontSize: '15px', color: 'var(--text-faint)' }} />
              <span className="text-[13px] text-[var(--text-body)]">{item.label}</span>
            </div>
            <span className="text-[13px] font-medium text-[var(--text-primary)]">{item.value}</span>
          </div>
        ))}
      </div>

      {currentTier === 'free' && (
        <div className="mt-6 p-4 rounded-xl text-center" style={{ background: 'rgba(155,123,247,0.06)', border: '1px solid rgba(155,123,247,0.15)' }}>
          <p className="text-[13px] text-[var(--text-muted)] mb-3">
            Need more storage, AI requests, or co-authors?
          </p>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-[13px] font-medium text-white bg-[#9b7bf7] hover:bg-[#8b6ae6] transition-colors"
          >
            <ion-icon name="arrow-up-circle-outline" style={{ fontSize: '16px' }} />
            Upgrade to Member
          </Link>
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function MediaTab() {
  const [media, setMedia] = useState(null);
  const [usage, setUsage] = useState(null);
  const [busyId, setBusyId] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const load = useCallback(() => Promise.all([
    fetch('/api/media').then((r) => r.ok ? r.json() : Promise.reject()),
    fetch('/api/tier/usage').then((r) => r.ok ? r.json() : Promise.reject()),
  ]).then(([mediaData, usageData]) => { setMedia(mediaData); setUsage(usageData); }).catch(() => setMedia({ items: [], organisations: [], collections: [], storageSpaces: [], totalBytes: 0, count: 0 })), []);

  useEffect(() => { load(); }, [load]);

  const remove = async (id) => {
    if (!window.confirm('Delete this media permanently and free its storage?')) return;
    setBusyId(id);
    setDeleteError('');
    try {
      const response = await fetch('/api/media/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId: id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Delete failed');
      await load();
    } catch (error) {
      setDeleteError(error.message || 'Delete failed');
    } finally { setBusyId(''); }
  };

  if (!media) return <div className="mt-8 h-48 animate-pulse rounded-xl bg-[var(--bg-elevated)]" />;
  const spaces = media.storageSpaces || [];
  const globalSpace = spaces.find((space) => space.provider === 'platform_cloudinary') || { bytes: 0, count: 0 };
  const personalSpaces = spaces.filter((space) => space.provider === 'user_cloudinary');
  const personalBytes = personalSpaces.reduce((total, space) => total + Number(space.bytes || 0), 0);
  const personalCount = personalSpaces.reduce((total, space) => total + Number(space.count || 0), 0);
  const personalScope = media.personal || { bytes: 0, count: 0 };
  const sumScope = (rows, field) => (rows || []).reduce((total, row) => total + Number(row[field] || 0), 0);
  const scopeRows = (rows) => rows?.length ? rows.map((row) => (
    <div key={row.id} className="flex justify-between gap-3 py-1.5 text-xs">
      <span className="truncate text-[var(--text-body)]">{row.name}</span>
      <span className="shrink-0 text-[var(--text-muted)]">{formatBytes(row.bytes)} · {row.count} asset{Number(row.count) === 1 ? '' : 's'}</span>
    </div>
  )) : null;
  return (
    <div>
      <SectionHeader title="Storage" />
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-[#9b7bf7]/25 bg-[#9b7bf7]/[0.035] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]"><ion-icon name="server-outline" /> LixBlogs storage</div>
              <p className="mt-3 text-2xl font-bold text-[var(--text-primary)]">{formatBytes(globalSpace.bytes)}</p>
              <p className="text-[11px] text-[var(--text-muted)]">{globalSpace.count} asset{globalSpace.count === 1 ? '' : 's'} · included in your plan</p>
            </div>
            <span className="rounded-full bg-[#9b7bf7]/10 px-2.5 py-1 text-[10px] font-semibold text-[#9b7bf7]">Managed</span>
          </div>
          <div className="mt-4 flex items-center justify-between text-[10px] text-[var(--text-muted)]"><span>{usage?.storage?.percent || 0}% used</span><span>{usage?.storage?.limitFormatted || '—'} limit</span></div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--bg-elevated)]"><div className="h-full rounded-full bg-[#9b7bf7] transition-[width]" style={{ width: `${Math.min(100, usage?.storage?.percent || 0)}%` }} /></div>
        </div>

        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.035] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]"><ion-icon name="cloud-done-outline" /> Personal storage</div>
              <p className="mt-3 text-2xl font-bold text-[var(--text-primary)]">{formatBytes(personalBytes)}</p>
              <p className="text-[11px] text-[var(--text-muted)]">{personalCount} asset{personalCount === 1 ? '' : 's'} · outside your plan quota</p>
            </div>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-500">Cloudinary</span>
          </div>
          <div className="mt-4 border-t border-emerald-500/15 pt-3">
            {personalSpaces.length ? personalSpaces.map((space) => (
              <div key={`${space.provider}:${space.cloudName}`} className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-[var(--text-body)]">{space.cloudName}</span>
                <span className="shrink-0 text-[var(--text-muted)]">{formatBytes(space.bytes)}</span>
              </div>
            )) : <Link href="/settings?tab=integrations" className="text-xs font-semibold text-emerald-500 hover:underline">Connect personal Cloudinary</Link>}
          </div>
        </div>
      </div>

      <p className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Usage by publishing space</p>
      <div className="grid gap-2">
        <StorageScope title="Personal" icon="person-outline" bytes={personalScope.bytes} count={personalScope.count}>
          {personalScope.count ? <p className="text-xs text-[var(--text-muted)]">Media from personal posts and uploads not assigned to a collection.</p> : null}
        </StorageScope>
        <StorageScope title="Organizations" icon="people-outline" bytes={sumScope(media.organisations, 'bytes')} count={sumScope(media.organisations, 'count')}>
          {scopeRows(media.organisations)}
        </StorageScope>
        <StorageScope title="Collections" icon="albums-outline" bytes={sumScope(media.collections, 'bytes')} count={sumScope(media.collections, 'count')}>
          {scopeRows(media.collections)}
        </StorageScope>
      </div>

      <SectionHeader title="Media controls" />
      {deleteError && <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500">{deleteError}</p>}
      <div className="space-y-2">
        {media.items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 rounded-xl border border-[var(--border-default)] p-3">
            <img src={item.url} alt="" className="h-12 w-16 shrink-0 rounded-lg bg-[var(--bg-elevated)] object-cover" />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">{item.blog_title || (item.media_type === 'cover' ? 'Blog cover' : 'Unattached media')}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${item.storage_provider === 'user_cloudinary' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-[#9b7bf7]/10 text-[#9b7bf7]'}`}>
                  {item.storage_provider === 'user_cloudinary' ? item.storage_cloud_name : 'LixBlogs storage'}
                </span>
              </div>
              <p className="truncate text-xs text-[var(--text-muted)]">{item.org_name || 'Personal'}{item.collection_name ? ` · ${item.collection_name}` : ''} · {formatBytes(item.size_bytes)}</p>
            </div>
            <button disabled={busyId === item.id} onClick={() => remove(item.id)} className="rounded-lg border border-red-400/25 px-3 py-2 text-xs text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50">{busyId === item.id ? 'Deleting…' : 'Delete'}</button>
          </div>
        ))}
        {!media.items.length && <p className="py-8 text-center text-sm text-[var(--text-muted)]">No uploaded media yet.</p>}
      </div>
    </div>
  );
}

function IntegrationsTab() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cloudinary, setCloudinary] = useState(null);
  const [cloudinaryLoading, setCloudinaryLoading] = useState(true);
  const [cloudinaryBusy, setCloudinaryBusy] = useState(false);
  const [cloudinaryError, setCloudinaryError] = useState('');
  const [cloudinaryCloudName, setCloudinaryCloudName] = useState('');
  const [pollinations, setPollinations] = useState(null);
  const [pollinationsLoading, setPollinationsLoading] = useState(true);
  const [pollinationsBusy, setPollinationsBusy] = useState(false);
  const [pollinationsError, setPollinationsError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/integrations/lixrl', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load LixRL');
      setStatus(data);
    } catch (err) {
      setError(err.message || 'Unable to load LixRL');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadCloudinary = useCallback(async () => {
    setCloudinaryLoading(true);
    setCloudinaryError('');
    try {
      const response = await fetch('/api/integrations/cloudinary', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load Cloudinary');
      setCloudinary(data);
    } catch (err) {
      setCloudinaryError(err.message || 'Unable to load Cloudinary');
    } finally { setCloudinaryLoading(false); }
  }, []);

  useEffect(() => { loadCloudinary(); }, [loadCloudinary]);

  const loadPollinations = useCallback(async (refresh = false) => {
    setPollinationsLoading(true);
    setPollinationsError('');
    try {
      const response = await fetch(`/api/integrations/pollinations${refresh ? '?refresh=1' : ''}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load Pollinations');
      setPollinations(data);
    } catch (err) { setPollinationsError(err.message || 'Unable to load Pollinations'); }
    finally { setPollinationsLoading(false); }
  }, []);

  useEffect(() => { loadPollinations(); }, [loadPollinations]);

  const disconnectPollinations = async () => {
    if (!window.confirm('Disconnect Pollinations from LixBlogs? Revoke the issued key from Pollinations for immediate provider-side revocation.')) return;
    setPollinationsBusy(true);
    setPollinationsError('');
    try {
      const response = await fetch('/api/integrations/pollinations', { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to disconnect Pollinations');
      setPollinations(data);
    } catch (err) { setPollinationsError(err.message || 'Unable to disconnect Pollinations'); }
    finally { setPollinationsBusy(false); }
  };

  const changeConnection = async (connect) => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/integrations/lixrl', connect ? {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect' }),
      } : { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to update LixRL connection');
      setStatus(data);
    } catch (err) {
      setError(err.message || 'Unable to update LixRL connection');
    } finally {
      setBusy(false);
    }
  };

  const account = status?.account;
  const maxUrls = account?.limits?.maxUrls;
  const usedUrls = account?.usage?.urls || 0;
  const usagePercent = maxUrls === -1 ? 0 : Math.min(100, Math.round((usedUrls / Math.max(maxUrls || 1, 1)) * 100));

  const setCloudinaryStorage = async (useForUploads) => {
    setCloudinaryBusy(true);
    setCloudinaryError('');
    try {
      const response = await fetch('/api/integrations/cloudinary', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useForUploads }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to change media storage');
      setCloudinary(data);
    } catch (err) {
      setCloudinaryError(err.message || 'Unable to change media storage');
    } finally { setCloudinaryBusy(false); }
  };

  const removeCloudinary = async () => {
    if (!window.confirm('Remove this Cloudinary connection?')) return;
    setCloudinaryBusy(true);
    setCloudinaryError('');
    try {
      const response = await fetch('/api/integrations/cloudinary', { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to remove Cloudinary');
      setCloudinary(data);
    } catch (err) {
      setCloudinaryError(err.message || 'Unable to remove Cloudinary');
    } finally { setCloudinaryBusy(false); }
  };

  const oauthResult = searchParams.get('cloudinary');
  const oauthReference = searchParams.get('cloudinary_ref');
  const pollinationsResult = searchParams.get('pollinations');
  const pollinationsReference = searchParams.get('pollinations_ref');
  const oauthMessage = {
    connected: { ok: true, text: 'Cloudinary connected. New blog media can now use your product environment.' },
    denied: { ok: false, text: 'Cloudinary authorization was cancelled.' },
    authorization_failed: { ok: false, text: 'Cloudinary rejected the authorization request. Confirm the registered callback URI and OAuth scopes.' },
    invalid_state: { ok: false, text: 'The Cloudinary authorization session expired. Please try again.' },
    storage_in_use: { ok: false, text: 'Delete media from the currently connected personal space before selecting another cloud.' },
    config_error: { ok: false, text: 'Cloudinary OAuth is not configured on this deployment.' },
    failed_token_exchange: { ok: false, text: 'Cloudinary authorization could not be exchanged. Verify the OAuth client ID, client secret, and Basic client authentication.' },
    failed_offline_access: { ok: false, text: 'Cloudinary did not grant Offline Access. Enable that scope in the OAuth app and reconnect.' },
    failed_environment: { ok: false, text: 'Cloudinary authorized the account but omitted its product-environment identifier. Enter the public cloud name below to verify and complete the connection.' },
    invalid_environment: { ok: false, text: 'Enter a valid Cloudinary cloud name. You can copy it from the Cloudinary dashboard.' },
    failed_validation: { ok: false, text: 'Cloudinary rejected access to the selected product environment. Enable Upload and Asset Management permissions.' },
    failed_database: { ok: false, text: 'LixBlogs could not check the existing media connection. Please retry shortly.' },
    failed_persistence: { ok: false, text: 'Cloudinary authorized successfully, but LixBlogs could not save the encrypted connection. Please retry.' },
    failed: { ok: false, text: 'Cloudinary could not be connected. Check the OAuth app scopes and redirect URI.' },
  }[oauthResult];
  const pollinationsMessage = {
    connected: { ok: true, text: 'Pollinations connected. Image generation will spend the budget you approved.' },
    denied: { ok: false, text: 'Pollinations authorization was cancelled.' },
    invalid_state: { ok: false, text: 'The Pollinations authorization session expired. Start again.' },
    authorization_failed: { ok: false, text: 'Pollinations rejected the authorization request.' },
    scope_missing: { ok: false, text: 'Pollinations did not grant read-only usage access. Reconnect and approve the requested scope.' },
    config_error: { ok: false, text: 'Pollinations BYOP is not configured on this deployment.' },
    disabled: { ok: false, text: 'Pollinations image generation is not enabled yet.' },
    failed: { ok: false, text: 'Pollinations could not be connected. Check the App Key and exact callback URI.' },
  }[pollinationsResult];

  return (
    <div>
      <SectionHeader title="Connected services" />
      <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#9b7bf714] text-2xl font-black text-[#9b7bf7]">
              <ion-icon name="flash-outline" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-[var(--text-primary)]">LixRL URL shortener</h3>
                {!loading && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status?.connected ? 'bg-emerald-500/10 text-emerald-500' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'}`}>
                    {status?.connected ? 'Connected' : 'Not connected'}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                Create account-owned lixrl.com links directly from the blog editor. Your Accounts identity is used; no personal API key is stored in Blogs.
              </p>
            </div>
          </div>
          {!loading && (
            <button
              disabled={busy}
              onClick={() => changeConnection(!status?.connected)}
              className={`shrink-0 rounded-lg px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${status?.connected ? 'border border-red-400/25 text-red-500 hover:bg-red-500/10' : 'bg-[#9b7bf7] text-white hover:bg-[#8b6ae6]'}`}
            >
              {busy ? 'Working…' : status?.connected ? 'Disconnect' : 'Connect LixRL'}
            </button>
          )}
        </div>

        {loading && <div className="mt-5 h-20 animate-pulse rounded-xl bg-[var(--bg-elevated)]" />}
        {error && <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500">{error}</p>}

        {status?.connected && account && (
          <div className="mt-5 border-t border-[var(--border-default)] pt-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div><p className="text-[10px] uppercase tracking-wider text-[var(--text-faint)]">Plan</p><p className="mt-1 text-sm font-semibold capitalize text-[var(--text-primary)]">{account.tier}</p></div>
              <div><p className="text-[10px] uppercase tracking-wider text-[var(--text-faint)]">Links</p><p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{usedUrls} / {maxUrls === -1 ? 'Unlimited' : maxUrls}</p></div>
              <div><p className="text-[10px] uppercase tracking-wider text-[var(--text-faint)]">API rate</p><p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{account.limits.rateLimitPerMin === -1 ? 'Unlimited' : `${account.limits.rateLimitPerMin}/min`}</p></div>
            </div>
            {maxUrls !== -1 && <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--bg-elevated)]"><div className="h-full rounded-full bg-[#9b7bf7]" style={{ width: `${usagePercent}%` }} /></div>}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
              <p className="text-[var(--text-muted)]">Disconnecting stops new links from Blogs; existing short links stay active.</p>
              <a href="https://lixrl.com/dashboard" target="_blank" rel="noreferrer" className="font-medium text-[#9b7bf7] hover:underline">Open LixRL dashboard ↗</a>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-2xl text-sky-500"><ion-icon name="cloud-outline" /></div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-[var(--text-primary)]">Personal Cloudinary storage</h3>
                {cloudinary && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cloudinary.connected ? 'bg-emerald-500/10 text-emerald-500' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'}`}>{cloudinary.connected ? 'Connected' : 'Not connected'}</span>}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">Store new blog covers and editor images in your own Cloudinary product environment. Existing media stays in its original storage space.</p>
            </div>
          </div>
        </div>

        {oauthMessage && (
          <p className={`mt-4 rounded-lg px-3 py-2 text-xs ${oauthMessage.ok ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-500'}`}>
            {oauthMessage.text}{oauthReference && !oauthMessage.ok ? ` Reference: ${oauthReference}` : ''}
          </p>
        )}

        {cloudinaryLoading ? (
          <div className="mt-5 h-20 animate-pulse rounded-xl bg-[var(--bg-elevated)]" />
        ) : !cloudinary?.connected ? (
          <div className="mt-5 flex flex-col gap-3 border-t border-[var(--border-default)] pt-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-medium text-[var(--text-primary)]">Authorize with Cloudinary</p>
              <p className="mt-1 text-[11px] text-[var(--text-faint)]">Choose a product environment on Cloudinary. LixBlogs never receives its API secret.</p>
              {oauthResult === 'failed_environment' && (
                <label className="mt-3 block max-w-sm">
                  <span className="text-[11px] font-medium text-[var(--text-muted)]">Cloud name</span>
                  <input
                    value={cloudinaryCloudName}
                    onChange={(event) => setCloudinaryCloudName(event.target.value.trim())}
                    placeholder="your-cloud-name"
                    autoComplete="off"
                    spellCheck="false"
                    className="mt-1.5 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[#9b7bf7]"
                  />
                  <span className="mt-1 block text-[10px] text-[var(--text-faint)]">Cloudinary Dashboard → Product Environment → Cloud name</span>
                </label>
              )}
            </div>
            <a
              href={`/api/integrations/cloudinary/connect${oauthResult === 'failed_environment' && cloudinaryCloudName ? `?cloud_name=${encodeURIComponent(cloudinaryCloudName)}` : ''}`}
              aria-disabled={oauthResult === 'failed_environment' && !cloudinaryCloudName}
              onClick={(event) => { if (oauthResult === 'failed_environment' && !cloudinaryCloudName) event.preventDefault(); }}
              className={`shrink-0 rounded-lg bg-[#9b7bf7] px-4 py-2 text-center text-xs font-semibold text-white hover:bg-[#8b6ae6] ${oauthResult === 'failed_environment' && !cloudinaryCloudName ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              {oauthResult === 'failed_environment' ? 'Verify & connect' : 'Connect Cloudinary'}
            </a>
          </div>
        ) : (
          <div className="mt-5 border-t border-[var(--border-default)] pt-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-faint)]">Connected product environment</p>
                <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{cloudinary.cloudName}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{formatBytes(cloudinary.trackedBytes)} across {cloudinary.mediaCount} LixBlogs assets · {cloudinary.authMethod === 'oauth' ? 'OAuth' : 'API credential'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button disabled={cloudinaryBusy} onClick={() => setCloudinaryStorage(!cloudinary.useForUploads)} className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50 ${cloudinary.useForUploads ? 'border border-[var(--border-default)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]' : 'bg-[#9b7bf7] text-white hover:bg-[#8b6ae6]'}`}>{cloudinary.useForUploads ? 'Use LixBlogs storage' : 'Use personal storage'}</button>
                <button title={cloudinary.mediaCount ? 'Delete personal Cloudinary assets from the Media tab first' : 'Remove connection'} disabled={cloudinaryBusy || cloudinary.mediaCount > 0} onClick={removeCloudinary} className="rounded-lg border border-red-400/25 px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-500/10 disabled:opacity-50">{cloudinary.mediaCount ? 'Media still stored here' : 'Remove'}</button>
              </div>
            </div>
            <div className={`mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${cloudinary.useForUploads ? 'bg-emerald-500/10 text-emerald-600' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'}`}><ion-icon name={cloudinary.useForUploads ? 'cloud-done-outline' : 'server-outline'} />New blog media will use {cloudinary.useForUploads ? cloudinary.cloudName : 'LixBlogs global storage'}.</div>
          </div>
        )}
        {cloudinaryError && <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500">{cloudinaryError}</p>}
      </div>

      <div className="mt-4 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-2xl text-amber-500"><ion-icon name="color-wand-outline" /></div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-[var(--text-primary)]">Pollinations image generation</h3>
                {pollinations && !pollinations.enabled && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600">Coming soon</span>}
                {pollinations && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${pollinations.connected ? 'bg-emerald-500/10 text-emerald-500' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'}`}>{pollinations.connected ? 'Connected' : pollinations.status}</span>}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">Authorize LixBlogs through BYOP to generate images with your Pollen. Your key stays encrypted on the server and is never returned to the browser or CLI.</p>
            </div>
          </div>
          {!pollinationsLoading && pollinations?.enabled && (
            pollinations.connected
              ? <button disabled={pollinationsBusy} onClick={disconnectPollinations} className="shrink-0 rounded-lg border border-red-400/25 px-4 py-2 text-xs font-semibold text-red-500 hover:bg-red-500/10 disabled:opacity-50">Disconnect</button>
              : <a href="/api/integrations/pollinations/connect" className="shrink-0 rounded-lg bg-[#9b7bf7] px-4 py-2 text-center text-xs font-semibold text-white hover:bg-[#8b6ae6]">Connect Pollinations</a>
          )}
        </div>
        {pollinationsMessage && <p className={`mt-4 rounded-lg px-3 py-2 text-xs ${pollinationsMessage.ok ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-500'}`}>{pollinationsMessage.text}{pollinationsReference && !pollinationsMessage.ok ? ` Reference: ${pollinationsReference}` : ''}</p>}
        {pollinationsLoading && <div className="mt-5 h-20 animate-pulse rounded-xl bg-[var(--bg-elevated)]" />}
        {pollinations?.connected && (
          <div className="mt-5 border-t border-[var(--border-default)] pt-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div><p className="text-[10px] uppercase tracking-wider text-[var(--text-faint)]">Account</p><p className="mt-1 truncate text-sm font-semibold text-[var(--text-primary)]">{pollinations.handle || 'Connected user'}</p></div>
              <div><p className="text-[10px] uppercase tracking-wider text-[var(--text-faint)]">Pollen balance</p><p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{pollinations.balance ?? '—'}</p></div>
              <div><p className="text-[10px] uppercase tracking-wider text-[var(--text-faint)]">Approved budget</p><p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{pollinations.budget ?? 'Provider default'}</p></div>
              <div><p className="text-[10px] uppercase tracking-wider text-[var(--text-faint)]">Expires</p><p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{pollinations.expiresAt ? new Date(pollinations.expiresAt * 1000).toLocaleDateString() : 'Provider managed'}</p></div>
              <div><p className="text-[10px] uppercase tracking-wider text-[var(--text-faint)]">Recent requests</p><p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{pollinations.usageTotals?.requests || 0}</p></div>
              <div><p className="text-[10px] uppercase tracking-wider text-[var(--text-faint)]">Recent Pollen used</p><p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{Number(pollinations.usageTotals?.pollen || 0).toFixed(2)}</p></div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
              <p className="text-[var(--text-muted)]">Models: {(pollinations.models || []).join(', ') || '—'}</p>
              <div className="flex gap-3"><button disabled={pollinationsBusy} onClick={() => loadPollinations(true)} className="font-medium text-[#9b7bf7] hover:underline">Refresh</button><a href="https://enter.pollinations.ai" target="_blank" rel="noreferrer" className="font-medium text-[#9b7bf7] hover:underline">Open dashboard ↗</a><a href="/api/integrations/pollinations/connect" className="font-medium text-[#9b7bf7] hover:underline">Reconnect</a></div>
            </div>
          </div>
        )}
        {pollinationsError && <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500">{pollinationsError}</p>}
      </div>
    </div>
  );
}

const DEFAULT_TOKEN_SCOPES = [
  'lixblogs:blog:read',
  'lixblogs:blog:write',
  'lixblogs:blog:publish',
];

const TOKEN_SCOPE_LABELS = {
  'lixblogs:profile:read': 'Read profile',
  'lixblogs:profile:write': 'Update profile',
  'lixblogs:blog:read': 'Read blogs and revisions',
  'lixblogs:blog:write': 'Create and update blogs, including secret drafts',
  'lixblogs:blog:publish': 'Publish and unpublish blogs',
  'lixblogs:blog:delete': 'Trash and delete blogs',
  'lixblogs:media:read': 'Read media',
  'lixblogs:media:write': 'Upload, generate and delete media',
  'lixblogs:organizations:read': 'Read organization details',
  'lixblogs:organizations:write': 'Manage organization resources',
  'lixblogs:collaboration:read': 'Read collaborators and invitations',
  'lixblogs:collaboration:write': 'Manage collaboration',
  'lixblogs:analytics:read': 'Read creator analytics',
  'lixblogs:notifications:read': 'Read notifications',
};

function ApiTokensTab() {
  const [data, setData] = useState({ tokens: [], organizations: [], scopes: [], maxActiveTokens: 10 });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [revealedToken, setRevealedToken] = useState('');
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({
    name: '',
    resourceType: 'personal',
    organizationId: '',
    expiryDays: 90,
    scopes: DEFAULT_TOKEN_SCOPES,
  });

  const loadTokens = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/settings/tokens', { cache: 'no-store' });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error || 'API tokens could not be loaded');
      setData(next);
    } catch (requestError) {
      setError(requestError.message || 'API tokens could not be loaded');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTokens(); }, [loadTokens]);

  function toggleScope(scope) {
    setForm((current) => ({
      ...current,
      scopes: current.scopes.includes(scope)
        ? current.scopes.filter((item) => item !== scope)
        : [...current.scopes, scope],
    }));
  }

  async function createToken(event) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setError('');
    setRevealedToken('');
    try {
      const response = await fetch('/api/settings/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The token could not be created');
      setRevealedToken(result.token);
      setData((current) => ({ ...current, tokens: [result.record, ...current.tokens] }));
      setForm((current) => ({ ...current, name: '' }));
    } catch (requestError) {
      setError(requestError.message || 'The token could not be created');
    } finally {
      setCreating(false);
    }
  }

  async function revokeToken(token) {
    if (!window.confirm(`Revoke “${token.name}”? Automations using it will stop immediately.`)) return;
    setBusyId(token.id);
    setError('');
    try {
      const response = await fetch(`/api/settings/tokens/${encodeURIComponent(token.id)}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The token could not be revoked');
      setData((current) => ({
        ...current,
        tokens: current.tokens.map((item) => item.id === token.id
          ? { ...item, revokedAt: Math.floor(Date.now() / 1000) }
          : item),
      }));
    } catch (requestError) {
      setError(requestError.message || 'The token could not be revoked');
    } finally {
      setBusyId('');
    }
  }

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(revealedToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Copy failed. Select the token and copy it manually.');
    }
  }

  const nowSeconds = Date.now() / 1000;
  const activeTokens = data.tokens.filter((token) => !token.revokedAt && (!token.expiresAt || token.expiresAt > nowSeconds));
  const tokenLimitReached = activeTokens.length >= data.maxActiveTokens;
  const inputClass = 'w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]';

  return (
    <div className="space-y-7">
      <section>
        <h2 className="text-lg font-bold text-[var(--text-primary)]">Personal access tokens</h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--text-muted)]">
          Authenticate scripts and services against the same versioned API used by the LixBlogs CLI. Tokens are shown once and cannot bypass your current account or organization role.
        </p>
        <Link href="/docs/api" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:underline">
          Read the API guide <ion-icon name="arrow-forward-outline" />
        </Link>
      </section>

      {revealedToken && (
        <section className="rounded-2xl border border-amber-400/35 bg-amber-400/[0.06] p-5">
          <div className="flex items-start gap-3">
            <ion-icon name="warning-outline" className="mt-0.5 text-amber-500" />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Copy this token now</h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">It will not be displayed again. Store it in a secret manager, never in source control.</p>
              <div className="mt-3 flex gap-2">
                <code className="min-w-0 flex-1 select-all overflow-x-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-primary)]">{revealedToken}</code>
                <button type="button" onClick={copyToken} className="rounded-lg bg-[var(--accent)] px-3 text-xs font-semibold text-white">{copied ? 'Copied' : 'Copy'}</button>
              </div>
            </div>
          </div>
        </section>
      )}

      <form onSubmit={createToken} className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">Create a token</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-medium text-[var(--text-body)]">
            Token name
            <input required maxLength={80} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Release workflow" className={`${inputClass} mt-1.5`} />
          </label>
          <label className="text-xs font-medium text-[var(--text-body)]">
            Expires
            <select value={form.expiryDays} onChange={(event) => setForm({ ...form, expiryDays: Number(event.target.value) })} className={`${inputClass} mt-1.5`}>
              <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option><option value={365}>1 year</option>
            </select>
          </label>
          <label className="text-xs font-medium text-[var(--text-body)]">
            Account boundary
            <select value={form.resourceType} onChange={(event) => setForm({ ...form, resourceType: event.target.value, organizationId: '' })} className={`${inputClass} mt-1.5`}>
              <option value="personal">Personal account</option>
              <option value="organization">One organization</option>
            </select>
          </label>
          {form.resourceType === 'organization' && (
            <label className="text-xs font-medium text-[var(--text-body)]">
              Organization
              <select required value={form.organizationId} onChange={(event) => setForm({ ...form, organizationId: event.target.value })} className={`${inputClass} mt-1.5`}>
                <option value="">Select an organization</option>
                {data.organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
              </select>
            </label>
          )}
        </div>
        <fieldset className="mt-5">
          <legend className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Scopes</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {data.scopes.map((scope) => (
              <label key={scope} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--border-default)] px-3 py-2.5 hover:bg-[var(--bg-elevated)]">
                <input type="checkbox" checked={form.scopes.includes(scope)} onChange={() => toggleScope(scope)} className="mt-0.5 accent-[#9b7bf7]" />
                <span><span className="block text-xs font-medium text-[var(--text-primary)]">{TOKEN_SCOPE_LABELS[scope] || scope}</span><code className="text-[10px] text-[var(--text-faint)]">{scope}</code></span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-[11px] text-[var(--text-faint)]">Choose the minimum permissions your automation needs.</p>
          <button disabled={creating || !form.scopes.length || tokenLimitReached} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{creating ? 'Creating…' : tokenLimitReached ? 'Token limit reached' : 'Create token'}</button>
        </div>
      </form>

      <section>
        <h3 className="text-sm font-bold text-[var(--text-primary)]">Your tokens</h3>
        {loading ? <div className="mt-3 h-24 animate-pulse rounded-xl bg-[var(--bg-elevated)]" /> : (
          <div className="mt-3 space-y-2">
            {data.tokens.map((token) => (
              <article key={token.id} className={`flex flex-col gap-3 rounded-xl border border-[var(--border-default)] p-4 sm:flex-row sm:items-center ${token.revokedAt ? 'opacity-55' : ''}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-[var(--text-primary)]">{token.name}</p><span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">{token.resourceType === 'organization' ? token.organizationName || 'Organization' : 'Personal'}</span>{token.revokedAt && <span className="text-[10px] font-semibold text-red-500">Revoked</span>}</div>
                  <p className="mt-1 font-mono text-[11px] text-[var(--text-faint)]">{token.prefix}••••••••</p>
                  <p className="mt-1 text-[10px] text-[var(--text-muted)]">Created {new Date(token.createdAt * 1000).toLocaleDateString()} · {token.lastUsedAt ? `Last used ${new Date(token.lastUsedAt * 1000).toLocaleString()}` : 'Never used'} · Expires {new Date(token.expiresAt * 1000).toLocaleDateString()}</p>
                </div>
                {!token.revokedAt && <button type="button" disabled={busyId === token.id} onClick={() => revokeToken(token)} className="self-start rounded-lg border border-red-400/30 px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-500/10 disabled:opacity-50">{busyId === token.id ? 'Revoking…' : 'Revoke'}</button>}
              </article>
            ))}
            {!data.tokens.length && <p className="rounded-xl border border-dashed border-[var(--border-default)] py-8 text-center text-sm text-[var(--text-muted)]">No API tokens yet.</p>}
          </div>
        )}
        <p className="mt-2 text-right text-[10px] text-[var(--text-faint)]">{activeTokens.length} / {data.maxActiveTokens} active tokens</p>
      </section>
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ── Main Settings Page ──
export default function SettingsPage() {
  const { user, loading, refetchUser } = useAuth();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const initialTab = tabParam ? TABS.findIndex(t => t.label.toLowerCase() === tabParam.toLowerCase()) : 0;
  const [activeTab, setActiveTab] = useState(initialTab >= 0 ? initialTab : 0);
  const selectTab = (index) => {
    setActiveTab(index);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', TABS[index].label.toLowerCase());
    window.history.replaceState({}, '', url);
  };

  if (loading) {
    return (
      <AppShell>
        <div className="max-w-2xl mx-auto px-6 py-10">
          <div className="h-10 w-40 bg-[var(--bg-elevated)] animate-pulse rounded mb-8" />
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-[var(--bg-elevated)] animate-pulse rounded" />
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Sign in to access settings</h2>
          <p className="text-[var(--text-muted)] text-sm mb-6">Manage your account, profile, and preferences.</p>
          <Link href="/sign-in" className="px-6 py-2.5 bg-[#9b7bf7] text-[var(--text-primary)] font-semibold rounded-full text-sm hover:bg-[#b69aff] transition-colors">
            Sign In
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
        <h1 className="mb-6 text-2xl font-bold text-[var(--text-primary)]">Settings</h1>
        <div className="sticky top-16 z-20 -mx-4 bg-[var(--bg-app)] px-4 pt-1 md:hidden"><TabBar tabs={TABS} active={activeTab} onChange={selectTab} /></div>
        <div className="grid items-start gap-8 md:grid-cols-[210px_minmax(0,1fr)]">
          <nav aria-label="Settings sections" className="sticky top-20 hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-2 md:block">
            {TABS.map((tab, index) => (
              <button key={tab.label} type="button" aria-current={activeTab === index ? 'page' : undefined} onClick={() => selectTab(index)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-colors ${activeTab === index ? 'bg-[var(--accent-subtle)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'}`}>
                <ion-icon
                  name={tab.icon}
                  aria-hidden="true"
                  style={{
                    color: activeTab === index ? 'var(--accent)' : 'var(--text-faint)',
                    fontSize: '16px',
                    flexShrink: 0,
                  }}
                />
                {tab.label}
              </button>
            ))}
          </nav>
          <main className="min-w-0 max-w-3xl">
            {activeTab === 0 && <AccountTab user={user} refetchUser={refetchUser} />}
            {activeTab === 1 && <PublishingTab user={user} />}
            {activeTab === 2 && <NotificationsTab />}
            {activeTab === 3 && <OrganizationTab user={user} />}
            {activeTab === 4 && <IntegrationsTab />}
            {activeTab === 5 && <ApiTokensTab />}
            {activeTab === 6 && <MediaTab />}
            {activeTab === 7 && <SubscriptionTab user={user} />}
          </main>
        </div>
      </div>
    </AppShell>
  );
}
