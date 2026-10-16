import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DossierPage } from "@/components/DossierPage";
import { createPageMetadata } from "@/lib/seo";
import { getDirectoryEntries, getDirectoryEntry } from "@/lib/directory";

type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() { return getDirectoryEntries("research").map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> { const entry = getDirectoryEntry("research", (await params).slug); return entry ? createPageMetadata({ title: `${entry.name} — Open research`, description: entry.summary, path: `/research/${entry.slug}` }) : {}; }
export default async function ResearchEntryPage({ params }: Props) { const entry = getDirectoryEntry("research", (await params).slug); if (!entry) notFound(); return <DossierPage entry={entry} />; }

