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
  const journalTitle = "journalTitle" in record ? record.journalTitle : null;
  const issn = "issn" in record ? record.issn : null;
  const volume = "volume" in record ? record.volume : null;
  const issue = "issue" in record ? record.issue : null;
  const firstPage = "firstPage" in record ? record.firstPage : null;
  const lastPage = "lastPage" in record ? record.lastPage : null;
  const pdfUrl = "pdfUrl" in record ? record.pdfUrl : null;
  return {
    citation_title: record.title,
    citation_author: record.authors.map((author) => author.name),
    citation_publication_date: record.releasedAt.replaceAll("-", "/"),
    citation_abstract_html_url: canonicalUrl,
    ...(doi ? { citation_doi: doi } : {}),
    ...(institution ? { citation_technical_report_institution: institution } : {}),
    ...(reportNumber ? { citation_technical_report_number: reportNumber } : {}),
    ...(journalTitle ? { citation_journal_title: journalTitle } : {}),
    ...(issn ? { citation_issn: issn } : {}),
    ...(volume ? { citation_volume: volume } : {}),
    ...(issue ? { citation_issue: issue } : {}),
    ...(firstPage ? { citation_firstpage: firstPage } : {}),
    ...(lastPage ? { citation_lastpage: lastPage } : {}),
    ...(pdfUrl ? { citation_pdf_url: pdfUrl } : {}),
  };
}
