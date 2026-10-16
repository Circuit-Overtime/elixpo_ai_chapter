import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DossierPage } from "@/components/DossierPage";
import { createPageMetadata } from "@/lib/seo";
import { getDirectoryEntries, getDirectoryEntry } from "@/lib/directory";

type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() { return getDirectoryEntries("project").map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> { const entry = getDirectoryEntry("project", (await params).slug); return entry ? createPageMetadata({ title: `${entry.name} — Open-source project`, description: entry.summary, path: `/projects/${entry.slug}`, socialImage: `/social/project/${entry.slug}` }) : {}; }
export default async function ProjectPage({ params }: Props) { const entry = getDirectoryEntry("project", (await params).slug); if (!entry) notFound(); return <DossierPage entry={entry} />; }
