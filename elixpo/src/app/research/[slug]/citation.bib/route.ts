import { getResearchRecord, RESEARCH_RECORDS } from "@/lib/research";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return RESEARCH_RECORDS
    .filter((record) => record.citation && record.authors.length && record.releasedAt)
    .map((record) => ({ slug: record.slug }));
}

function bibValue(value: string) {
  return value
    .replaceAll("\\", "\\textbackslash{}")
    .replaceAll("{", "\\{")
    .replaceAll("}", "\\}")
    .replaceAll("&", "\\&")
    .replaceAll("%", "\\%")
    .replaceAll("#", "\\#")
    .replaceAll("_", "\\_");
}

function citationKey(slug: string, authors: { name: string }[], releasedAt: string) {
  const surname = authors[0]?.name.trim().split(/\s+/).at(-1)?.replaceAll(/[^a-zA-Z0-9]/g, "") || "elixpo";
  return `${surname.toLowerCase()}${releasedAt.slice(0, 4)}${slug.replaceAll(/[^a-zA-Z0-9]/g, "")}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const record = getResearchRecord(slug);
  if (!record?.citation || !record.authors.length || !record.releasedAt) {
    return new Response("Citation not found.\n", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const institution = "technicalReportInstitution" in record ? record.technicalReportInstitution : null;
  const reportNumber = "technicalReportNumber" in record ? record.technicalReportNumber : null;
  const doi = "doi" in record ? record.doi : null;
  const journal = "journalTitle" in record ? record.journalTitle : null;
  const volume = "volume" in record ? record.volume : null;
  const issue = "issue" in record ? record.issue : null;
  const firstPage = "firstPage" in record ? record.firstPage : null;
  const lastPage = "lastPage" in record ? record.lastPage : null;
  const fields: string[][] = [
    ["title", record.title],
    ["author", record.authors.map((author) => author.name).join(" and ")],
    ["year", record.releasedAt.slice(0, 4)],
    ["url", record.paperUrl],
    ...(doi ? [["doi", doi]] : []),
    ...(journal ? [["journal", journal]] : []),
    ...(volume ? [["volume", volume]] : []),
    ...(issue ? [["number", issue]] : []),
    ...(firstPage && lastPage ? [["pages", `${firstPage}--${lastPage}`]] : []),
    ...(institution ? [["institution", institution]] : []),
    ...(reportNumber ? [["number", reportNumber]] : []),
    ["note", `Elixpo record: ${absoluteUrl(`/research/${record.slug}`)}. Review status: ${record.reviewStatus.replaceAll("-", " ")}.`],
  ];
  const type = journal ? "article" : record.researchStatus === "technical-report" || institution ? "techreport" : "misc";
  const body = `@${type}{${citationKey(record.slug, record.authors, record.releasedAt)},\n${fields.map(([key, value]) => `  ${key} = {${bibValue(value)}},`).join("\n")}\n}\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-bibtex; charset=utf-8",
      "Content-Disposition": `inline; filename="${record.slug}.bib"`,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
