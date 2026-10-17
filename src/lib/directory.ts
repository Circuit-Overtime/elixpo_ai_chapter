import registry from "../../content/repositories.json";
import directory from "../../content/directory.json";
import repositoryLicenses from "../../content/repository-licenses.json";

export type PublicFamily = "project" | "research" | "service";
export type Lifecycle = "incubating" | "active" | "maintenance" | "paused" | "completed" | "archived";

export interface DirectoryEntry {
  slug: string;
  repository: string;
  name: string;
  family: PublicFamily;
  lifecycle: Lifecycle;
  relationship: "core" | "chapter" | "member" | "connected";
  verificationState: "verified" | "decision-recorded" | "needs-decision";
  statusVerifiedAt: string;
  repositoryUrl: string;
  website?: string;
  summary: string;
  description: string;
  focus: string[];
  featured?: boolean;
  icon?: string;
  evidence?: { label: string; url: string }[];
  licenseEvidence: {
    detection: string;
    classification: "spdx-recognized" | "external-spdx" | "custom-mixed" | "missing";
    spdxId: string | null;
    evidenceUrl: string | null;
    summary: string;
    verifiedAt: string;
  };
}

type RegistryEntry = (typeof registry.entries)[number];

type DirectoryDetails = Omit<DirectoryEntry, "repository" | "repositoryUrl" | "family" | "lifecycle" | "relationship" | "verificationState" | "statusVerifiedAt" | "licenseEvidence">;
const DETAILS = directory.entries as Record<string, DirectoryDetails>;
const LICENSES = repositoryLicenses.entries as Record<string, DirectoryEntry["licenseEvidence"]>;

function isPublicEntry(entry: RegistryEntry): entry is RegistryEntry & { publicClass: PublicFamily } {
  return entry.disposition === "public-entry" && entry.publicClass !== null;
}

export const DIRECTORY_ENTRIES: DirectoryEntry[] = registry.entries
  .filter(isPublicEntry)
  .map((entry) => {
    const detail = DETAILS[entry.name];
    if (!detail) throw new Error(`Missing public directory copy for ${entry.name}`);
    const licenseEvidence = LICENSES[entry.name];
    if (!licenseEvidence) throw new Error(`Missing repository license evidence for ${entry.name}`);
    return {
      ...detail,
      licenseEvidence,
      repository: entry.name,
      repositoryUrl: entry.repositoryUrl,
      family: entry.publicClass,
      lifecycle: entry.lifecycle as Lifecycle,
      relationship: entry.relationship as DirectoryEntry["relationship"],
      verificationState: entry.verificationState as DirectoryEntry["verificationState"],
      statusVerifiedAt: entry.statusVerifiedAt,
    };
  });

export const RELATIONSHIP_LABELS: Record<DirectoryEntry["relationship"], string> = {
  core: "Elixpo-originated",
  chapter: "Chapter participant",
  member: "Member-maintained",
  connected: "Connected work",
};

export const RELATIONSHIP_DESCRIPTIONS: Record<DirectoryEntry["relationship"], string> = {
  core: "Created or operated as part of Elixpo. Copyright and artifact licences still remain repository-specific.",
  chapter: "Participates in a bounded Elixpo Chapter. A Chapter records collaboration; it does not transfer ownership.",
  member: "Maintained by its original author within the Elixpo community. Membership does not silently transfer copyright or project authority.",
  connected: "Listed because it has a documented technical or publication connection to Elixpo, without being represented as Elixpo-owned.",
};

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
