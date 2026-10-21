import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Github, Tag, User, FileJson, Hash, Layers, ArrowRight,
} from "lucide-react";
import { ALL_CATALOG, findApp, type AppEntry } from "@/data/apps";
import DetailIcon from "./_components/DetailIcon";
import JsonLd from "@/components/JsonLd";

/* /apps/[slug]/ — per-app detail route.
 *
 * Static export means we need every reachable URL pre-generated at
 * build time. `generateStaticParams` returns one entry per app in
 * `ALL_CATALOG`; the build emits an HTML file for each, so Cloudflare
 * Pages can serve them as plain static assets — no runtime params.
 *
 * The page itself is a server component (no `use client`) because all
 * its data is build-time-known. The hero "blurred logo" backdrop is
 * pure CSS, no canvas, so the route loads instantly with zero JS
 * cost. The header / footer animations still come along via the root
 * layout.
 */

// `dynamicParams = false` locks the route to the slugs we declare —
// any other URL 404s instead of trying to render at request time.
// Required for `output: "export"` to know what to pre-render.
export const dynamicParams = false;

export async function generateStaticParams() {
  return ALL_CATALOG.map((a) => ({ slug: a.urlSlug }));
}

// Next 15 made `params` async — it's now a Promise that must be
// awaited before its fields can be read. The shape is otherwise
// unchanged. This was the single most common Next 14 → 15 migration
// gotcha; flagged here so future edits don't drop the await.
type RouteParams = Promise<{ slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: RouteParams;
}): Promise<Metadata> {
  const { slug } = await params;
  const app = findApp(slug);
  if (!app) return { title: "Not found" };
  const canonical = `/apps/${app.urlSlug}/`;
  const fullDescription = (app.details ?? app.blurb)
    .replace(/`/g, "")
    .replace(/\s+/g, " ");
  const description = fullDescription.length > 160
    ? `${fullDescription.slice(0, 157).replace(/\s+\S*$/, "")}…`
    : fullDescription;
  return {
    title:       `${app.name} App | OreoOS`,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      siteName: "OreoOS",
      title:       `${app.name} App for OreoOS`,
      description,
      images: app.pngIcon ? [{ url: app.pngIcon }] : undefined,
    },
    twitter: {
      card: "summary",
      title: `${app.name} App for OreoOS`,
      description,
      images: app.pngIcon ? [app.pngIcon] : undefined,
    },
  };
}

const TINT_BG: Record<AppEntry["tint"], string> = {
  primary: "rgba(255, 93, 104, 0.22)",
  teal:    "rgba( 61, 220, 151, 0.20)",
  gold:    "rgba(255, 209, 102, 0.20)",
  lilac:   "rgba(162, 155, 254, 0.22)",
};
const TINT_TEXT: Record<AppEntry["tint"], string> = {
  primary: "text-primary",
  teal:    "text-teal",
  gold:    "text-gold",
  lilac:   "text-lilac",
};
const TINT_RING: Record<AppEntry["tint"], string> = {
  primary: "ring-primary/50",
  teal:    "ring-teal/50",
  gold:    "ring-gold/50",
  lilac:   "ring-lilac/50",
};

export default async function AppDetail({
  params,
}: {
  params: RouteParams;
}) {
  const { slug } = await params;
  const app = findApp(slug);
  if (!app) notFound();

  // Pick a few "related" apps in the same category for the bottom
  // strip. Keep the original ordering so it's deterministic across
  // builds (no Math.random).
  const related = ALL_CATALOG
    .filter((a) => a.urlSlug !== app.urlSlug && a.category === app.category)
    .slice(0, 3);

  const bgUrl = app.pngIcon ?? "";

  return (
    <div className="relative">
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: app.name,
        description: app.details ?? app.blurb,
        applicationCategory: app.category === "game" ? "GameApplication" : "UtilitiesApplication",
        operatingSystem: "OreoOS",
        softwareVersion: app.version,
        image: app.pngIcon ? `https://oreo.elixpo.com${app.pngIcon}` : undefined,
        url: `https://oreo.elixpo.com/apps/${app.urlSlug}/`,
        author: {
          "@type": "Person",
          name: app.author,
        },
        isAccessibleForFree: true,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
      }} />
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: "https://oreo.elixpo.com/",
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Apps",
            item: "https://oreo.elixpo.com/apps/",
          },
          {
            "@type": "ListItem",
            position: 3,
            name: app.name,
            item: `https://oreo.elixpo.com/apps/${app.urlSlug}/`,
          },
        ],
      }} />
      {/* ── BLURRED LOGO BACKDROP ─────────────────────────────────────
          Two stacked layers:
            1. The PNG icon itself, scaled up and heavily blurred — the
               "out-of-focus poster" feel.
            2. A tinted gradient overlay using the app's brand colour
               to keep the page readable and on-theme.
          Both layers are pointer-events-none so they never intercept
          taps on the content above. */}
      {bgUrl && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[640px] overflow-hidden"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bgUrl}
            alt=""
            className="absolute left-1/2 top-1/2 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2
                       object-cover opacity-[0.55]"
            style={{ filter: "blur(80px) saturate(1.4)" }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                `linear-gradient(180deg,${TINT_BG[app.tint]} 0%, rgba(15,12,28,0.85) 50%, var(--background) 100%)`,
            }}
          />
        </div>
      )}

      <div className="container-page pt-8 pb-28">
        {/* Back link */}
        <Link
          href="/apps/"
          className="mb-10 inline-flex items-center gap-2 text-xs uppercase tracking-widest
                     text-muted transition-colors hover:text-text"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All apps
        </Link>

        {/* ── HERO ───────────────────────────────────────────────────── */}
        <div className="flex flex-col items-center text-center">
          <DetailIcon app={app} tintRing={TINT_RING[app.tint]} />

          <h1 className={`mt-7 font-display text-5xl leading-[1.05]
                          tracking-tight sm:text-6xl ${TINT_TEXT[app.tint]}`}
              style={{ textShadow: `0 0 30px ${TINT_BG[app.tint]}` }}>
            {app.name}
          </h1>

          <p className="mt-3 inline-flex items-center gap-2 text-xs uppercase
                        tracking-widest text-muted">
            <span className="chip">{app.category}</span>
            <span className="text-muted-deep">·</span>
            <Hash className="h-3 w-3" /> v{app.version}
          </p>

          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-dim">
            {app.blurb}
          </p>
        </div>

        {/* ── META GRID ──────────────────────────────────────────────── */}
        <div className="mx-auto mt-12 grid max-w-3xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Meta icon={<User    className="h-3.5 w-3.5" />} label="Author"   value={app.author!} />
          <Meta icon={<Hash    className="h-3.5 w-3.5" />} label="Version"  value={"v" + app.version} />
          <Meta icon={<Tag     className="h-3.5 w-3.5" />} label="Category" value={app.category} />
          <Meta icon={<Layers  className="h-3.5 w-3.5" />} label="Path"     value={`apps/${app.slug}/`} mono />
        </div>

        {/* ── ABOUT ──────────────────────────────────────────────────── */}
        <div className="mx-auto mt-12 max-w-3xl">
          <div className="rounded-lg border border-border bg-bg-raised/50 p-7
                          backdrop-blur-sm sm:p-8">
            <h2 className="font-display text-xl tracking-tight">About</h2>
            <div className="mt-3 space-y-4 leading-relaxed text-text-dim">
              {(app.details ?? app.blurb).split("\n\n").map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>
        </div>

        {/* ── ACTION BAR ─────────────────────────────────────────────── */}
        <div className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-3">
          <a
            href={`https://github.com/elixpo/oreo/tree/main/apps/${encodeURIComponent(app.slug)}`}
            target="_blank" rel="noreferrer"
            className="btn-primary"
          >
            <Github className="h-4 w-4" /> View source
          </a>
          <a
            href={`https://github.com/elixpo/oreo/blob/main/apps/${encodeURIComponent(app.slug)}/manifest.json`}
            target="_blank" rel="noreferrer"
            className="btn-ghost"
          >
            <FileJson className="h-4 w-4" /> manifest.json
          </a>
          {app.category === "store" && (
            <a
              href={`https://github.com/elixpo/oreo/tree/main/apps_market/${encodeURIComponent(app.slug)}`}
              target="_blank" rel="noreferrer"
              className="btn-ghost"
            >
              <Layers className="h-4 w-4" /> Store entry
            </a>
          )}
        </div>

        {/* ── RELATED ────────────────────────────────────────────────── */}
        {related.length > 0 && (
          <div className="mx-auto mt-24 max-w-5xl">
            <h2 className="mb-6 text-center font-display text-2xl tracking-tight">
              More in <span className="text-primary">{app.category}</span>
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {related.map((r) => (
                <Link
                  key={r.urlSlug}
                  href={`/apps/${r.urlSlug}/`}
                  className="card-surface group flex items-center gap-3 p-4
                             hover:border-primary/40"
                >
                  <RelatedIcon app={r} />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-display text-base ${TINT_TEXT[r.tint]}`}>
                      {r.name}
                    </p>
                    <p className="truncate text-xs text-text-dim">{r.blurb}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted transition-transform
                                          group-hover:translate-x-0.5 group-hover:text-text" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Meta({
  icon, label, value, mono = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-bg-raised/60 px-3 py-3
                    backdrop-blur-sm">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted">
        {icon} {label}
      </p>
      <p className={`mt-1 truncate text-text ${mono ? "font-mono text-sm" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function RelatedIcon({ app }: { app: AppEntry }) {
  return (
    <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden
                    rounded-md bg-card-sub p-1.5">
      {app.pngIcon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={app.pngIcon}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-contain"
          style={{ imageRendering: "pixelated" }}
          loading="lazy"
        />
      ) : (
        <span className="font-display text-sm text-primary">{app.name[0]}</span>
      )}
    </div>
  );
}
