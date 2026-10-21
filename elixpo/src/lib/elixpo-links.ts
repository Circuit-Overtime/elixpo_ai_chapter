export interface NavItem {
  label: string;
  href: string;
}

export interface Segment {
  text: string;
  className?: string;
  extraClass?: string;
}

export interface FeatureItem {
  text: string;
}

export interface FeatureCardData {
  id: string;
  number: string;
  title: string;
  iconName: "Wand2" | "Layers" | "Puzzle";
  iconColor: string;
  items: string[];
  href: string;
}

// Canonical Elixpo ecosystem links.
export const ELIXPO_LINKS = {
  homepage: "https://elixpo.com",
  generate: "https://elixpo.com",
  gallery: "https://elixpo.com",
  blog: "https://blogs.elixpo.com",
  discussions: "https://github.com/orgs/elixpo/discussions",
  email: "hello@elixpo.com",
  researchEmail: "ayushman.elixpo@gmail.com",
  operationsEmail: "vivek@elixpo.com",
  terms: "/terms",
  privacy: "/privacy",
  architecture: "/architecture",
  assets: "/branding",
  github: "https://github.com/elixpo",
  githubChapter: "https://github.com/elixpo/elixpo_chapter",
  submitProject: "https://github.com/orgs/elixpo/discussions/new?category=show-and-tell",
  extension: "https://github.com/Circuit-Overtime/elixpo_chapter/discussions/42",
  sketch: "https://sketch.elixpo.com",
  chat: "https://chat.elixpo.com",
  search: "https://search.elixpo.com",
  accounts: "https://accounts.elixpo.com",
  urlShortener: "https://lixrl.com",
  portfolio: "https://me.elixpo.com",
  packages: "https://packages.elixpo.com",
  oreo: "https://oreo.elixpo.com",
  tommy: "https://github.com/elixpo/tommy",
  nominate: "https://stars.github.com/nominate/",
  fundingPolicy: "https://github.com/elixpo/elixpo/blob/main/docs/policies/sponsorship.md",
  licensingPolicy: "/licensing",
  npmLixSketch: "https://www.npmjs.com/package/@elixpo/lixsketch",
  npmLixEditor: "https://www.npmjs.com/package/@elixpo/lixeditor",
  vsLixSketch: "https://marketplace.visualstudio.com/items?itemName=elixpo.lixsketch",
  vsLixEditor: "https://marketplace.visualstudio.com/items?itemName=elixpo.lixeditor",
};

export const PRISMA_COLORS = {
  background: "#000000",
  aboutCard: "#101010",
  featuresCard: "#212121",
  primaryText: "#E1E0CC", // Slightly off-white cream
  primaryTailwind: "#DEDBC8", // Deep warm cream
};
