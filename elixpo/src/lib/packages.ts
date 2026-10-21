import packages from "../../content/packages.json";

export const PACKAGE_DISTRIBUTION = packages.distribution;
export const LINUX_APPLICATIONS = packages.linuxApplications;
export const NATIVE_TOOLS = packages.nativeTools;
export const ELIXPO_PACKAGES = packages.npmPackages;
export const PACKAGES_LAST_VERIFIED = packages.lastVerified;

export type PackageRecord = {
  slug: string;
  name: string;
  version: string;
  status: "maintained" | "deprecated" | "unsupported" | "archived";
  kind: "linux" | "native" | "npm";
  type: string;
  description: string;
  install: string;
  aptInstall?: string;
  secondaryInstall?: string;
  source: string;
  releaseUrl: string;
  externalPage: string;
  license: string;
  maintainer: string;
  capabilities: string[];
  platform: string;
  related: { family: "project" | "research" | "service"; slug: string };
};

export const PACKAGE_RECORDS: PackageRecord[] = [
  ...LINUX_APPLICATIONS.map((item) => ({
    slug: item.slug,
    name: item.name,
    version: item.version,
    status: item.status as PackageRecord["status"],
    kind: "linux" as const,
    type: item.category,
    description: item.summary,
    install: item.install,
    source: item.source,
    releaseUrl: item.releases,
    externalPage: item.page,
    license: item.license,
    maintainer: item.maintainer,
    capabilities: [...item.capabilities],
    platform: item.support,
    related: item.related as PackageRecord["related"],
  })),
  ...NATIVE_TOOLS.map((item) => ({
    slug: item.slug,
    name: item.name,
    version: item.version,
    status: item.status as PackageRecord["status"],
    kind: "native" as const,
    type: item.category,
    description: item.summary,
    install: item.install,
    aptInstall: item.aptInstall,
    secondaryInstall: item.windowsInstall,
    source: item.source,
    releaseUrl: item.releases,
    externalPage: item.page,
    license: item.license,
    maintainer: item.maintainer,
    capabilities: [...item.capabilities],
    platform: item.support,
    related: item.related as PackageRecord["related"],
  })),
  ...ELIXPO_PACKAGES.map((item) => ({
    slug: item.slug,
    name: item.name,
    version: item.version,
    status: item.status as PackageRecord["status"],
    kind: "npm" as const,
    type: item.type,
    description: item.description,
    install: item.install,
    source: item.source,
    releaseUrl: item.href,
    externalPage: item.href,
    license: item.license,
    maintainer: item.maintainer,
    capabilities: [...item.capabilities],
    platform: "npm and compatible JavaScript runtimes",
    related: item.related as PackageRecord["related"],
  })),
];

export const getPackageRecord = (slug: string) => PACKAGE_RECORDS.find((record) => record.slug === slug);
