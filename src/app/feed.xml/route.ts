import { LAST_VERIFIED, PACKAGE_RECORDS } from "@/lib/packages";

export const dynamic = "force-static";
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
export function GET() {
  const updated = `${LAST_VERIFIED}T00:00:00.000Z`;
  const entries = PACKAGE_RECORDS.map((record) => `<entry><id>https://packages.elixpo.com/${record.slug}/</id><title>${escape(record.name)} ${escape(record.version)}</title><link href="https://packages.elixpo.com/${record.slug}/"/><updated>${updated}</updated><summary>${escape(record.summary)}</summary><category term="${record.kind}"/></entry>`).join("");
  return new Response(`<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><id>https://packages.elixpo.com/</id><title>Elixpo Package Releases</title><link href="https://packages.elixpo.com/feed.xml" rel="self"/><link href="https://packages.elixpo.com/"/><updated>${updated}</updated>${entries}</feed>`, { headers: { "Content-Type": "application/atom+xml; charset=utf-8" } });
}
