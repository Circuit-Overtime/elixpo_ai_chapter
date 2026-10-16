import { CollectionPage } from "@/components/CollectionPage";
import { getDirectoryEntries } from "@/lib/directory";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({ title: "Open-source projects", description: "Explore Elixpo's software, libraries, open hardware, Linux packages, member projects, paused work, and preserved project archive with explicit lifecycle status.", path: "/projects" });

export default function ProjectsPage() {
  return <CollectionPage family="project" title="Projects people can build on." introduction="Software, libraries, hardware, packages, and creative tools—each with a public repository, an explicit lifecycle, and a dossier that distinguishes active promises from preserved history." entries={getDirectoryEntries("project")} />;
}
