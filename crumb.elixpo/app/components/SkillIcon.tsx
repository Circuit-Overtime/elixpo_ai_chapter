type SkillIconProps = {
  kind: 'code' | 'database' | 'repository' | 'incident'
}

export function SkillIcon({ kind }: SkillIconProps) {
  if (kind === 'database') {
    return <span className="skill-logo skill-logo-database" aria-hidden="true"><svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="7" ry="3" /><path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7" /></svg></span>
  }
  if (kind === 'repository') {
    return <span className="skill-logo skill-logo-repository" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="7" cy="5" r="2" /><circle cx="17" cy="7" r="2" /><circle cx="7" cy="19" r="2" /><path d="M7 7v10M9 9c4 0 4-2 6-2" /></svg></span>
  }
  if (kind === 'incident') {
    return <span className="skill-logo skill-logo-incident" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 13h4l2-6 4 12 2-6h6" /><circle cx="12" cy="12" r="9" /></svg></span>
  }
  return <span className="skill-logo skill-logo-code" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 6-6 6 6 6M15 6l6 6-6 6M14 3l-4 18" /></svg></span>
}
