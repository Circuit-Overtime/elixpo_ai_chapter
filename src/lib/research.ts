import research from "../../content/research.json";

export type ResearchRecord = (typeof research.entries)[keyof typeof research.entries];

export const RESEARCH_RECORDS = Object.entries(research.entries).map(([repository, record]) => ({ repository, ...record }));
export const RESEARCH_LAST_VERIFIED = research.lastVerified;
export const getResearchRecord = (slug: string) => RESEARCH_RECORDS.find((record) => record.slug === slug);
export const LIVE_RESEARCH_DEMOS = RESEARCH_RECORDS.flatMap((record) => record.liveDemos.map((demo) => ({ ...demo, relatedSlug: record.slug })));

export function getScholarMeta(record: ResearchRecord, canonicalUrl: string) {
  if (!record.authors.length || !record.releasedAt || !record.paperUrl) return {};
  const doi = "doi" in record ? record.doi : null;
  const institution = "technicalReportInstitution" in record ? record.technicalReportInstitution : null;
  const reportNumber = "technicalReportNumber" in record ? record.technicalReportNumber : null;
  return {
    citation_title: record.title,
    citation_author: record.authors.map((author) => author.name),
    citation_publication_date: record.releasedAt.replaceAll("-", "/"),
    citation_abstract_html_url: canonicalUrl,
    ...(doi ? { citation_doi: doi } : {}),
    ...(institution ? { citation_technical_report_institution: institution } : {}),
    ...(reportNumber ? { citation_technical_report_number: reportNumber } : {}),
  };
}
