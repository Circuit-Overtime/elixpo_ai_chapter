import { atomResponse, createAtomFeed, toAtomDate } from "@/lib/feeds";
import { ELIXPO_PACKAGES, LINUX_APPLICATIONS, NATIVE_TOOLS, PACKAGES_LAST_VERIFIED } from "@/lib/packages";

export const dynamic = "force-static";

export function GET() {
  const updated = toAtomDate(PACKAGES_LAST_VERIFIED);
  const linuxEntries = LINUX_APPLICATIONS.map((item) => ({
    id: item.page,
    url: item.page,
    title: `${item.name} ${item.version}`,
    summary: item.summary,
    updated,
    authors: [item.maintainer],
    categories: ["Linux", item.category, item.status],
  }));
  const npmEntries = ELIXPO_PACKAGES.map((item) => ({
    id: item.href,
    url: item.href,
    title: `${item.name} ${item.version}`,
    summary: item.description,
    updated,
    authors: [item.maintainer],
    categories: ["npm", item.type, item.status],
  }));
  const nativeEntries = NATIVE_TOOLS.map((item) => ({
    id: item.releases,
    url: item.page,
    title: `${item.name} ${item.version}`,
    summary: item.summary,
    updated,
    authors: [item.maintainer],
    categories: ["Native tool", item.category, item.status],
  }));

  return atomResponse(createAtomFeed({
    title: "Elixpo Package Releases",
    subtitle: "Maintained native tools, Linux applications, npm libraries, and command-line tools published by Elixpo.",
    path: "/packages",
    updated,
    entries: [...nativeEntries, ...linuxEntries, ...npmEntries],
  }));
}
