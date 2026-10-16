import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResearchRecordPage } from "@/components/ResearchRecordPage";
import { createPageMetadata } from "@/lib/seo";
import { getDirectoryEntries, getDirectoryEntry } from "@/lib/directory";
import { getResearchRecord, getScholarMeta } from "@/lib/research";

type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() { return getDirectoryEntries("research").map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> { const slug = (await params).slug; const entry = getDirectoryEntry("research", slug); const record = getResearchRecord(slug); if (!entry || !record) return {}; const path = `/research/${entry.slug}` as const; return { ...createPageMetadata({ title: `${record.title} — Elixpo Research`, description: record.abstract, path }), other: getScholarMeta(record, `https://elixpo.com${path}`) }; }
export default async function ResearchEntryPage({ params }: Props) { const slug = (await params).slug; const entry = getDirectoryEntry("research", slug); const record = getResearchRecord(slug); if (!entry || !record) notFound(); return <ResearchRecordPage entry={entry} record={record} />; }
