import { ELIXPO_LINKS } from "./elixpo-links";
import { VIDEOS } from "./media";

/**
 * Single source of truth for the Elixpo projects shown on the homepage,
 * the /projects route, and the footer's ecosystem list. Only products that
 * ship a clip are listed here. `pos` = object-position for the panda subject,
 * `aspect` = card ratio (drives the masonry rhythm).
 */
export interface Project {
  title: string;
  cta: string;
  href: string;
  video: string;
  pos: string;
  aspect: string;
  badge: string;
}

export const PROJECTS: Project[] = [
  {
    title: "LixSketch.",
    cta: "Explore Sketch",
    href: ELIXPO_LINKS.sketch,
    video: VIDEOS.sketch,
    pos: "object-center",
    aspect: "aspect-[16/9]",
    badge: "01",
  },
  {
    title: "Elixpo Blogs.",
    cta: "Explore Blogs",
    href: ELIXPO_LINKS.blog,
    video: VIDEOS.blogs,
    pos: "object-center",
    aspect: "aspect-[9/16]",
    badge: "02",
  },
  {
    title: "Elixpo Accounts.",
    cta: "Open Accounts",
    href: ELIXPO_LINKS.accounts,
    video: VIDEOS.accounts,
    pos: "object-center",
    aspect: "aspect-[16/9]",
    badge: "03",
  },
  {
    title: "Elixpo URL.",
    cta: "Shorten a URL",
    href: ELIXPO_LINKS.urlShortener,
    video: VIDEOS.url,
    pos: "object-center",
    aspect: "aspect-[16/9]",
    badge: "04",
  },
  {
    title: "Portfolios.",
    cta: "View Portfolio",
    href: ELIXPO_LINKS.portfolio,
    video: VIDEOS.portfolio,
    pos: "object-center",
    aspect: "aspect-[9/16]",
    badge: "05",
  },
  {
    title: "Oreo.",
    cta: "Explore Oreo",
    href: "https://oreo.elixpo.com",
    video: VIDEOS.oreo,
    pos: "object-center",
    aspect: "aspect-[16/9]",
    badge: "06",
  },
];

/** Clean display name (no trailing period) for nav/footer link lists. */
export const projectName = (p: Project) => p.title.replace(/\.$/, "");
