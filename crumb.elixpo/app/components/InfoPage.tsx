import type { ReactNode } from 'react'
import { SiteFooter } from './SiteFooter'
import { SiteHeader } from './SiteHeader'

export function InfoPage({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: ReactNode }) {
  return <><SiteHeader /><main className="info-page"><header><p className="kicker">{eyebrow}</p><h1>{title}</h1><p>{intro}</p></header><article className="prose">{children}</article></main><SiteFooter /></>
}
