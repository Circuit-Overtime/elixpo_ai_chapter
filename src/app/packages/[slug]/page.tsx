import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PackageRecordPage } from "@/components/PackageRecordPage";
import { DIRECTORY_ENTRIES } from "@/lib/directory";
import { getPackageRecord, PACKAGE_RECORDS } from "@/lib/packages";
import { createPageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return PACKAGE_RECORDS.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const record = getPackageRecord((await params).slug);
  if (!record) return {};
  return createPageMetadata({
    title: `${record.name} ${record.version} — Elixpo Packages`,
    description: `${record.name} ${record.version} is a ${record.status} ${record.kind === "npm" ? "npm package" : record.kind === "native" ? "cross-platform native tool" : "Linux application"}. Review installation, source, license, supported environment, and release records.`,
    path: `/packages/${record.slug}`,
    socialImage: `/social/package/${record.slug}`,
  });
}

export default async function PackagePage({ params }: Props) {
  const record = getPackageRecord((await params).slug);
  if (!record) notFound();
  const related = DIRECTORY_ENTRIES.find((entry) => entry.family === record.related.family && entry.slug === record.related.slug);
  if (!related) notFound();
  return <PackageRecordPage record={record} related={related}/>;
}
