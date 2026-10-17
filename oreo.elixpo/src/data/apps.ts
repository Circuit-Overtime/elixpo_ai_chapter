/* Single source of truth for the app catalogue surfaced on the site.
 * Mirrors the manifest.json files shipped on the badge.
 *
 *   slug      — the on-disk app directory ("Oreo Pet", "snake", …)
 *   urlSlug   — URL-safe variant used by /apps/[urlSlug]/ routes
 *   pngIcon   — path under /public/icons (real asset; pixel-art LCD icon)
 *   icon      — Lucide string fallback when the PNG fails to load
 *   version   — last published manifest version
 *   author    — manifest.author; defaults to @Circuit-Overtime
 *   details   — long-form pitch used on the detail page; falls back to
 *               `blurb` if absent. Markdown is NOT parsed here — plain
 *               paragraphs separated by \n\n.
 */

export type AppIconId =
  | "Contact" | "Bird"     | "Image"      | "Worm"      | "Compass"
  | "BookOpen"| "Car"      | "Cloud"      | "GitCommit" | "User"
  | "Gamepad2"| "HardDrive"| "Palette"    | "PawPrint"  | "Cpu"
  | "Wifi"    | "Bluetooth"| "RefreshCw"  | "Settings";

export type AppEntry = {
  slug:      string;
  urlSlug:   string;
  name:      string;
  blurb:     string;
  details?:  string;
  category:  "core" | "game" | "tool" | "store";
  tint:      "primary" | "teal" | "gold" | "lilac";
  icon:      AppIconId;
  pngIcon?:  string;
  version?:  string;
  author?:   string;
};

const DEFAULT_AUTHOR  = "@Circuit-Overtime";
const DEFAULT_VERSION = "0.1";

/* Convert a badge dir slug into a URL-safe identifier — lowercase,
 * spaces → hyphens, strip everything else. Used at both data-entry
 * time below and at lookup time on the detail route. */
export function toUrlSlug(slug: string): string {
  return slug.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function app(
  slug: string,
  rest: Omit<AppEntry, "slug" | "urlSlug" | "author" | "version"> &
        Partial<Pick<AppEntry, "author" | "version">>,
): AppEntry {
  return {
    slug,
    urlSlug: toUrlSlug(slug),
    author:  rest.author  ?? DEFAULT_AUTHOR,
    version: rest.version ?? DEFAULT_VERSION,
    ...rest,
  };
}

export const PRELOADED: AppEntry[] = [
  app("badge",   { name: "Badge",       category: "core", tint: "primary", icon: "Contact",
    pngIcon: "/icons/badge_icon.png",
    blurb:   "Conference badge with your name, role, pronouns.",
    details: "Your digital identity card. Live GitHub stats pulled from your handle " +
             "(set in secrets.py), QR code for your contact card, and a configurable " +
             "tagline. Designed to be held up at conferences and read across a table." }),
  app("flappy",  { name: "Flappy Oreo", category: "game", tint: "lilac",   icon: "Bird",
    pngIcon: "/icons/flappy_icon.png",
    blurb:   "Flap the panda. Dodge pipes. High score persists.",
    details: "A two-button Flappy clone with the Oreo mascot as the protagonist. " +
             "Procedurally-generated pipe pairs, parallax scrolling background, " +
             "and a hi-score stored on flash so it survives reboot." }),
  app("gallery", { name: "Gallery",     category: "core", tint: "gold",    icon: "Image",
    pngIcon: "/icons/gallery_icon.png",
    blurb:   "Photo viewer with thumbnail carousel. Auto-hiding UI.",
    details: "Renders RGB565 .py modules baked from your raw PNGs by " +
             "`tools/optimize_assets.py`, OR `.r565` binaries dropped in via the " +
             "WiFi file-transfer flow. Auto-hides the UI after 2 s so it doubles " +
             "as a slideshow when you're not touching anything." }),
  app("snake",   { name: "Snake",       category: "game", tint: "teal",    icon: "Worm",
    pngIcon: "/icons/snake_icon.png",
    blurb:   "The original. Eat the dot, don't bite yourself.",
    details: "Classic grid-based Snake. Speeds up the longer you survive. Pixel " +
             "rendering uses framebuf rect fills directly — runs at a solid 30 fps " +
             "even with a 200-segment tail." }),
  app("quest",   { name: "IR Quest",    category: "game", tint: "primary", icon: "Compass",
    pngIcon: "/icons/IR_Quest_icon.png",
    blurb:   "IR-beacon scavenger hunt. Find 9 stations, trade tokens.",
    details: "Walk around the conference floor with your badge held up. Each IR " +
             "beacon you find awards a token. Visit a friend's badge in scanner " +
             "mode and trade tokens to complete the set." }),
  app("reader",  { name: "Reader",      category: "tool", tint: "lilac",   icon: "BookOpen",
    pngIcon: "/icons/reader_icon.png",
    blurb:   "Markdown + text viewer. AirDrop a .md, read it on the go.",
    details: "Lightweight markdown renderer supporting headings, lists, code blocks, " +
             "and inline emphasis. Files arrive via the WiFi transfer flow and land " +
             "in `documents/`. Scrolling is UP/DOWN, page-skip is LEFT/RIGHT." }),
];

export const ALL_APPS: AppEntry[] = [
  ...PRELOADED,
  app("racer",    { name: "Racer",     category: "game", tint: "primary", icon: "Car",
    pngIcon: "/icons/racer_icon.png",
    blurb:   "Top-down arcade racer. UP/DOWN steer, A boosts.",
    details: "Endless top-down racer with procedurally-generated track curvature. " +
             "Boost cooldown of 3 s, point multiplier scales with speed." }),
  app("weather",  { name: "Weather",   category: "tool", tint: "teal",    icon: "Cloud",
    pngIcon: "/icons/wallpaper_icon.png",
    blurb:   "Current conditions + 3-day forecast.",
    details: "OpenWeatherMap-backed. Cached on disk with a TTL so the forecast " +
             "survives offline windows. Set OWM_API_KEY in your .env." }),
  app("commits",  { name: "Commits",   category: "tool", tint: "gold",    icon: "GitCommit",
    pngIcon: "/icons/commits_icon.png",
    blurb:   "Live GitHub commit feed from your followed repos.",
    details: "Pulls the public events stream for a configurable list of repos. " +
             "Renders each commit as a card with author, message, and timestamp." }),
  app("identity", { name: "Identity",  category: "core", tint: "lilac",   icon: "User",
    pngIcon: "/icons/identity_icon.png",
    blurb:   "Name, handle, contact card — share over IR.",
    details: "Holds your contact card and beams a copy to a peer badge over IR " +
             "when they tap A on the matching screen." }),
  app("gamepad",  { name: "Gamepad",   category: "tool", tint: "primary", icon: "Gamepad2",
    pngIcon: "/icons/gamepad_icon.png",
    blurb:   "Bluetooth gamepad mode for your laptop.",
    details: "HID Gamepad over BLE — your laptop sees the badge as a generic " +
             "gamepad. Maps the badge buttons to standard XInput buttons." }),
  app("storage",  { name: "Storage",   category: "tool", tint: "lilac",   icon: "HardDrive",
    pngIcon: "/icons/storage_icon.png",
    blurb:   "Flash usage by app + asset bundle.",
    details: "Walks the filesystem and renders a breakdown of which apps and " +
             "asset directories are using how much flash." }),
  app("wifi",     { name: "WiFi",      category: "core", tint: "teal",    icon: "Wifi",
    pngIcon: "/icons/wifi_icon.png",
    blurb:   "Saved networks, file transfer, ping + speed test.",
    details: "Manage saved networks with per-entry priority and metered flags. " +
             "Run ping + speed test from the same screen. Send-files row exposes " +
             "the on-device upload URL." }),
  app("bt",       { name: "Bluetooth", category: "core", tint: "lilac",   icon: "Bluetooth",
    pngIcon: "/icons/bluetooth_icon.png",
    blurb:   "Peer presence (coming soon). Pairing + bonded list.",
    details: "Coming soon. The underlying BLE stack ships paired-device storage " +
             "and an SMP handshake — we're holding the UI back until peer-presence " +
             "features land in a real user flow." }),
  app("updates",  { name: "Updates",   category: "core", tint: "gold",    icon: "RefreshCw",
    pngIcon: "/icons/settings_icon.png",
    blurb:   "OTA over WiFi. LTS / BETA / OUTDATED states.",
    details: "Pulls release manifests from the project repo on a 6-hour cadence. " +
             "Three-state model — LTS (current), BETA (newer pre-release), OUTDATED " +
             "(older than current). Manual check is always available." }),
  app("settings", { name: "Settings",  category: "core", tint: "primary", icon: "Settings",
    pngIcon: "/icons/settings_icon.png",
    blurb:   "Brightness, sleep timer, gestures, theme.",
    details: "Top-level settings hub. Drills into WiFi / Bluetooth / Gestures / " +
             "Updates as needed; persists every preference to flash." }),
];

export const STORE: AppEntry[] = [
  app("Colors",   { name: "Color Picker", category: "store", tint: "lilac",   icon: "Palette",
    pngIcon: "/icons/color_icon.png",
    blurb:   "HSV picker — UP/DOWN sweeps each channel.",
    details: "Live HSV-space colour picker with a big swatch preview. A cycles " +
             "between channels; UP/DOWN adjusts. Useful for theme experimentation " +
             "without re-deploying." }),
  app("Oreo Pet", { name: "Oreo Pet",     category: "store", tint: "primary", icon: "PawPrint",
    pngIcon: "/icons/elixpo_pet_icon.png",
    blurb:   "Tamagotchi panda. Feed, play, sleep, repeat.",
    details: "A virtual panda you have to care for. Three stats: happiness, hunger, " +
             "cleanliness — all degrade over real wallclock time, so neglecting the " +
             "badge for a week genuinely matters. Autonomous mood-driven idle animations." }),
];

/* Flat list used by the [slug] route's generateStaticParams and the
 * detail-page lookup. */
export const ALL_CATALOG: AppEntry[] = [...ALL_APPS, ...STORE];

export function findApp(urlSlug: string): AppEntry | undefined {
  return ALL_CATALOG.find(a => a.urlSlug === urlSlug);
}
