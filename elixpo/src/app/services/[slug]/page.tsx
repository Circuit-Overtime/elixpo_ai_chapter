import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DossierPage } from "@/components/DossierPage";
import { createPageMetadata } from "@/lib/seo";
import { getDirectoryEntries, getDirectoryEntry } from "@/lib/directory";

type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() { return getDirectoryEntries("service").map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> { const entry = getDirectoryEntry("service", (await params).slug); return entry ? createPageMetadata({ title: `${entry.name} — Open service`, description: entry.summary, path: `/services/${entry.slug}`, socialImage: `/social/service/${entry.slug}` }) : {}; }
export default async function ServicePage({ params }: Props) { const entry = getDirectoryEntry("service", (await params).slug); if (!entry) notFound(); return <DossierPage entry={entry} />; }
