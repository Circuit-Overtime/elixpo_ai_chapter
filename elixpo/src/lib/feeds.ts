import { SITE_URL } from "@/lib/seo";

export type AtomEntry = {
  id: string;
  url: string;
  title: string;
  summary: string;
  updated: string;
  authors?: string[];
  categories?: string[];
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function toAtomDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}

export function createAtomFeed({
  title,
  subtitle,
  path,
  updated,
  entries,
}: {
  title: string;
  subtitle: string;
  path: string;
  updated: string;
  entries: AtomEntry[];
}) {
  const pageUrl = `${SITE_URL}${path}`;
  const feedUrl = `${pageUrl}/feed.xml`;
  const body = entries.map((entry) => `  <entry>
    <id>${escapeXml(entry.id)}</id>
    <title>${escapeXml(entry.title)}</title>
    <link href="${escapeXml(entry.url)}" />
    <updated>${escapeXml(entry.updated)}</updated>
    <summary>${escapeXml(entry.summary)}</summary>
${(entry.authors ?? []).map((author) => `    <author><name>${escapeXml(author)}</name></author>`).join("\n")}
${(entry.categories ?? []).map((category) => `    <category term="${escapeXml(category)}" />`).join("\n")}
  </entry>`).join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${escapeXml(pageUrl)}</id>
  <title>${escapeXml(title)}</title>
  <subtitle>${escapeXml(subtitle)}</subtitle>
  <link href="${escapeXml(pageUrl)}" />
  <link href="${escapeXml(feedUrl)}" rel="self" type="application/atom+xml" />
  <updated>${escapeXml(updated)}</updated>
  <author><name>Elixpo</name><uri>${SITE_URL}</uri></author>
${body}
</feed>\n`;
}

export function atomResponse(xml: string) {
  return new Response(xml, {
    headers: {
      "Content-Type": "application/atom+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
