import { CollectionPage } from "@/components/CollectionPage";
import { getDirectoryEntries } from "@/lib/directory";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({ title: "Open services", description: "Discover the public services Elixpo operates for publishing, identity, portfolios, links, communications, status, administration, and open-source participation.", path: "/services" });
export default function ServicesPage() { return <CollectionPage family="service" title="Services operated in the open." introduction="A hosted service carries a different responsibility from a repository. This directory identifies what Elixpo currently operates, what is still incubating, and where the public implementation lives." entries={getDirectoryEntries("service")} />; }

