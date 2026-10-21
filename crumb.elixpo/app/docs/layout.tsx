import type { Metadata } from 'next'
import { DocsShell } from './DocsShell'

export const metadata: Metadata = { title: { default: 'Developer Documentation', template: '%s · Crumb Docs' } }
export default function DocsLayout({ children }: { children: React.ReactNode }) { return <DocsShell>{children}</DocsShell> }
