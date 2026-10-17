import registry from "../../content/packages.json";

export const DISTRIBUTION = registry.distribution;
export const LINUX_PACKAGES = registry.linuxApplications;
export const NPM_PACKAGES = registry.npmPackages;
export const LAST_VERIFIED = registry.lastVerified;

export type PackageRecord = {
  slug: string;
  name: string;
  version: string;
  status: string;
  kind: "linux" | "npm";
  category: string;
  summary: string;
  platform: string;
  install: string;
  source: string;
  releaseUrl: string;
  license: string;
  maintainer: string;
  capabilities: readonly string[];
  icon?: string;
  images: readonly { src: string; alt: string }[];
};

export const PACKAGE_RECORDS: PackageRecord[] = [
  ...LINUX_PACKAGES.map((item) => ({
    slug: item.slug,
    name: item.name,
    version: item.version,
    status: item.status,
    kind: "linux" as const,
    category: item.category,
    summary: item.summary,
    platform: item.support,
    install: item.install,
    source: item.source,
    releaseUrl: item.releases,
    license: item.license,
    maintainer: item.maintainer,
    capabilities: item.capabilities,
    icon: item.icon,
    images: item.images,
  })),
  ...NPM_PACKAGES.map((item) => ({
    slug: item.slug,
    name: item.name,
    version: item.version,
    status: item.status,
    kind: "npm" as const,
    category: item.type,
    summary: item.description,
    platform: "npm and compatible JavaScript runtimes",
    install: item.install,
    source: item.source,
    releaseUrl: item.href,
    license: item.license,
    maintainer: item.maintainer,
    capabilities: item.capabilities,
    images: [],
  })),
];

export const getPackage = (slug: string) => PACKAGE_RECORDS.find((record) => record.slug === slug);
export const packagePath = (record: PackageRecord) => `/${record.slug}`;
