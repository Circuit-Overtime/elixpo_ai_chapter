import { ELIXPO_LINKS } from "./elixpo-links";

export interface EcosystemProduct {
  slug: string; name: string; eyebrow: string; url: string; icon: string; shortDescription: string;
  schemaType?: "SoftwareApplication" | "Product";
  description: string; audience: string; capabilities: string[]; keywords: string[]; relatedPackages: string[];
}

/** Canonical product copy used by pages, metadata, JSON-LD, and the sitemap. */
export const ECOSYSTEM_PRODUCTS: EcosystemProduct[] = [
  {
    slug: "blogs", name: "LixBlogs", eyebrow: "Publishing platform", url: ELIXPO_LINKS.blog, icon: "/brand/icons/blogs.elixpo.webp",
    shortDescription: "A creator-focused publishing platform for writing, managing, and sharing rich technical stories.",
    description: "LixBlogs is Elixpo's publishing platform for creators and technical teams. Its rich block editor supports structured articles, equations, Mermaid diagrams, syntax-highlighted code, media, and collaborative editorial workflows. Writers can publish on the web or manage content through the official CLI and API-oriented automation tools.",
    audience: "Writers, developers, technical teams, and automation workflows",
    capabilities: ["Rich block-based authoring for technical content", "Equations, diagrams, code blocks, media, and previews", "Publishing, collaboration, comments, and creator analytics", "Official CLI for terminal and agent-driven workflows"],
    keywords: ["technical blogging", "publishing platform", "block editor", "creator tools"], relatedPackages: ["@elixpo/lixeditor", "@elixpo/lixblogs-cli"],
  },
  {
    slug: "sketch", name: "LixSketch", eyebrow: "Visual collaboration", url: ELIXPO_LINKS.sketch, icon: "/brand/icons/sketch.elixpo.webp",
    shortDescription: "A hand-drawn SVG whiteboard for diagrams, free-form thinking, and collaborative visual work.",
    description: "LixSketch is an open-source WYSIWYG canvas and SVG whiteboard for sketching ideas, building diagrams, and collaborating visually. Its portable drawing engine supports structured shapes, freehand work, scene files, image exports, programmable LixScript diagrams, and integrations for browsers, editors, and agent workflows.",
    audience: "Developers, designers, educators, teams, and visual thinkers",
    capabilities: ["Hand-drawn SVG canvas with diagramming and freehand tools", "Portable .lixsketch scenes with PNG, SVG, and PDF export", "Embeddable JavaScript engine and React-friendly integration", "Programmatic diagrams and structured canvas automation"],
    keywords: ["SVG whiteboard", "WYSIWYG canvas", "diagramming", "visual collaboration"], relatedPackages: ["@elixpo/lixsketch"],
  },
  {
    slug: "portfolio", name: "Elixpo Portfolio", eyebrow: "Personal presence", url: ELIXPO_LINKS.portfolio, icon: "/brand/icons/me.elixpo.webp",
    shortDescription: "A standalone portfolio service for presenting projects, experience, skills, and identity on the web.",
    description: "Elixpo Portfolio gives individuals a focused home for their work and professional story. The service makes projects, experience, skills, and contact information easy to explore without mixing them into a social feed, helping creators and developers maintain a clear standalone presence.",
    audience: "Developers, designers, students, researchers, and independent creators",
    capabilities: ["Standalone public portfolio presence", "Structured presentation of projects, skills, and experience", "A focused profile that is easy to share", "Connection to the wider Elixpo account ecosystem"],
    keywords: ["developer portfolio", "personal website", "project showcase", "creator profile"], relatedPackages: [],
  },
  {
    slug: "search", name: "Elixpo Search", eyebrow: "AI-assisted discovery", url: ELIXPO_LINKS.search, icon: "https://search.elixpo.com/favicon.ico",
    shortDescription: "A research-led search experience for discovering and understanding information with AI assistance.",
    description: "Elixpo Search explores research-led information discovery with an accessible web experience backed by Elixpo's published research and machine-learning work. It helps people move from a query to useful context, while the related research paper and Hugging Face presence make the experimentation behind the product discoverable.",
    audience: "Researchers, students, developers, and curious knowledge workers",
    capabilities: ["AI-assisted information discovery", "Research-oriented exploration and contextual results", "A public research paper documenting the work", "Related experiments published through Hugging Face"],
    keywords: ["AI search", "research search", "information discovery", "Hugging Face"], relatedPackages: [],
  },
  {
    slug: "lixrl", name: "Lixrl", eyebrow: "Links and QR codes", url: ELIXPO_LINKS.urlShortener, icon: "/brand/icons/url.elixpo.webp",
    shortDescription: "A URL shortening, link management, analytics, and production-ready QR code service.",
    description: "Lixrl is Elixpo's link platform for turning long URLs into manageable short links and production-ready QR codes. It supports link organization and analytics for everyday sharing, campaigns, and automation, with an official CLI for repeatable terminal and agent workflows.",
    audience: "Creators, teams, marketers, developers, and automation workflows",
    capabilities: ["Short links for clean, reliable sharing", "Production-ready QR code generation", "Link management and analytics", "Official CLI for scripted and agent-driven workflows"],
    keywords: ["URL shortener", "QR code generator", "link analytics", "short links"], relatedPackages: ["@elixpo/lixrl-cli"],
  },
  {
    slug: "accounts", name: "Elixpo Accounts", eyebrow: "Identity and access", url: ELIXPO_LINKS.accounts, icon: "/brand/icons/accounts.elixpo.webp",
    shortDescription: "The branded identity service that provides secure sign-in and account management across Elixpo.",
    description: "Elixpo Accounts is the shared identity and account-management layer for the Elixpo ecosystem. It gives people a consistent branded sign-in experience while providing applications with standards-based OAuth 2.0 and OpenID Connect flows, session management, consent, and account controls.",
    audience: "Elixpo users, application developers, and service operators",
    capabilities: ["Unified sign-in across supported Elixpo services", "OAuth 2.0 and OpenID Connect foundations", "Session, consent, and connected-application controls", "SDK support for standards-based integrations"],
    keywords: ["OAuth 2.0", "OpenID Connect", "account management", "single sign-on"], relatedPackages: ["@elixpo/accounts"],
  },
  {
    slug: "packages", name: "Elixpo Packages", eyebrow: "Linux distribution", url: ELIXPO_LINKS.packages, icon: "https://packages.elixpo.com/favicon.ico",
    shortDescription: "The distribution point for Linux packages published and maintained by the Elixpo ecosystem.",
    description: "Elixpo Packages is the ecosystem's home for Linux software distribution. It provides a clear destination for packages produced by Elixpo projects, so users can discover installable releases and obtain software from an Elixpo-managed source alongside the project's npm developer tooling.",
    audience: "Linux users, developers, maintainers, and system administrators",
    capabilities: ["Discovery of Linux packages published by Elixpo", "A central distribution destination for ecosystem software", "Clear connection between applications and installable releases", "Maintainer-owned package publishing"],
    keywords: ["Linux packages", "software repository", "developer tools", "package distribution"], relatedPackages: [],
  },
  {
    slug: "oreo", name: "Oreo Badge", eyebrow: "Open hardware and OreoOS", url: ELIXPO_LINKS.oreo, icon: "/brand/icons/oreo.elixpo.webp", schemaType: "Product",
    shortDescription: "A panda-themed wearable conference badge running OreoOS, built for apps, games, quests, and badge-to-badge interaction.",
    description: "Oreo Badge is Elixpo's handheld, panda-themed conference badge and open hardware platform. Its 320 × 240 colour display runs OreoOS with built-in apps, games, GitHub tools, IR quests, gesture controls, an on-device App Market, and over-the-air updates. Wi-Fi, Bluetooth, and infrared communication enable live data and social badge-to-badge experiences, while the compact Python app SDK lets developers create and deploy their own apps.",
    audience: "Conference attendees, hardware hackers, Python developers, educators, and open-source communities",
    capabilities: ["320 × 240 colour display with a themed application launcher", "Wi-Fi, Bluetooth, infrared, gesture, and badge-to-badge interaction", "Fourteen built-in apps plus an on-device App Market", "Python app SDK, open firmware, and over-the-air updates"],
    keywords: ["conference badge", "open hardware", "OreoOS", "wearable technology", "MicroPython", "badge app SDK"],
    relatedPackages: [],
  },
];

export const getProduct = (slug: string) => ECOSYSTEM_PRODUCTS.find((product) => product.slug === slug);
