import registry from "../../content/repositories.json";
import directory from "../../content/directory.json";

export type PublicFamily = "project" | "research" | "service";
export type Lifecycle = "incubating" | "active" | "maintenance" | "paused" | "completed" | "archived";

export interface DirectoryEntry {
  slug: string;
  repository: string;
  name: string;
  family: PublicFamily;
  lifecycle: Lifecycle;
  relationship: "core" | "chapter" | "member" | "connected";
  repositoryUrl: string;
  website?: string;
  summary: string;
  description: string;
  focus: string[];
  featured?: boolean;
  icon?: string;
  evidence?: { label: string; url: string }[];
}

type RegistryEntry = (typeof registry.entries)[number];

type DirectoryDetails = Omit<DirectoryEntry, "repository" | "repositoryUrl" | "family" | "lifecycle" | "relationship">;
const DETAILS = directory.entries as Record<string, DirectoryDetails>;

function isPublicEntry(entry: RegistryEntry): entry is RegistryEntry & { publicClass: PublicFamily } {
  return entry.disposition === "public-entry" && entry.publicClass !== null;
}

export const DIRECTORY_ENTRIES: DirectoryEntry[] = registry.entries
  .filter(isPublicEntry)
  .map((entry) => {
    const detail = DETAILS[entry.name];
    if (!detail) throw new Error(`Missing public directory copy for ${entry.name}`);
    return {
      ...detail,
      repository: entry.name,
      repositoryUrl: entry.repositoryUrl,
      family: entry.publicClass,
      lifecycle: entry.lifecycle as Lifecycle,
      relationship: entry.relationship as DirectoryEntry["relationship"],
    };
  });

export const CHAPTER_ENTRY = DIRECTORY_ENTRIES.find((entry) => entry.repository === "elixpo_chapter");

export const getDirectoryEntries = (family: PublicFamily) =>
  DIRECTORY_ENTRIES.filter((entry) => entry.family === family && entry.repository !== "elixpo_chapter");

export const getDirectoryEntry = (family: PublicFamily, slug: string) =>
  getDirectoryEntries(family).find((entry) => entry.slug === slug);

export const familyPath = (family: PublicFamily) =>
  family === "project" ? "/projects" : family === "research" ? "/research" : "/services";

const discussionCategory: Record<PublicFamily, string> = {
  project: "show-and-tell",
  research: "research",
  service: "service-feedback",
};

export const discussionUrl = (entry: Pick<DirectoryEntry, "family">) =>
  `https://github.com/orgs/elixpo/discussions/new?category=${discussionCategory[entry.family]}`;
