import Link from "next/link";
import { Cpu, Wifi, Bluetooth, Code2, Film } from "lucide-react";
import { Reveal } from "@/components/MotionWrap";
import AppCard from "@/components/AppCard";
import WavesHero from "@/components/WavesHero";
import { PRELOADED } from "@/data/apps";

const FEATURES = [
  {
    Icon: Cpu,
    title: "Python all the way down",
    body:
      "MicroPython on ESP32-S3. Apps are a manifest.json + main.py — write one in ~30 lines and it shows up in the drawer.",
  },
  {
    Icon: Wifi,
    title: "AirDrop, the open-hardware way",
    body:
      "WiFi-based file transfer with on-badge approval. 6-digit code, beacon handshake, RGB565 conversion in the browser.",
  },
  {
    Icon: Bluetooth,
    title: "Peer presence (soon)",
    body:
      "BT will return for proximity-based features — IR-quest assists, sync gestures, badge-to-badge nudges.",
  },
  {
    Icon: Film,
    title: "Video, built for the hardware",
    body:
      "RV565 combines full-colour independent frames, firmware inflation, and a proven 24 FPS native DMA display path.",
  },
];

export default function Home() {
  return (
    <>
      {/* ── Reactive canvas hero ─────────────────────────────────────── */}
      <WavesHero />

      {/* ── FEATURE TRIO ─────────────────────────────────────────────── */}
      <section className="container-page py-24">
        <Reveal>
          <h2 className="font-display text-3xl tracking-tight">
            Four things make the badge feel alive
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={0.05 * i}>
              <div className="card-surface group relative h-full overflow-hidden p-6
                              transition-transform hover:-translate-y-1
                              hover:border-primary/30">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center
                                rounded-md bg-card-sub text-primary">
                  <f.Icon className="h-5 w-5" />
                </div>
                <h3 className="font-display text-xl">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-dim">
                  {f.body}
                </p>
                <div className="pointer-events-none absolute inset-x-6 bottom-0 h-px
                                origin-left bg-gradient-to-r from-transparent
                                via-primary to-transparent opacity-0 transition-opacity
                                group-hover:opacity-100" />
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── APPS CAROUSEL ────────────────────────────────────────────── */}
      <section className="container-page py-20">
        <Reveal>
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-3xl tracking-tight">
                Preloaded apps
              </h2>
              <p className="mt-2 text-text-dim">
                Ship with the badge. Customise or replace any of them.
              </p>
            </div>
            <Link
              href="/apps/"
              className="text-sm text-muted transition-colors hover:text-text"
            >
              All apps →
            </Link>
          </div>
        </Reveal>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PRELOADED.map((app, i) => (
            <AppCard key={app.slug} app={app} index={i} />
          ))}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section className="container-page py-24">
        <Reveal>
          <div className="ring-glow overflow-hidden rounded-lg
                          bg-gradient-to-r from-primary/10 via-card to-lilac/10
                          p-10 sm:p-14">
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center
                            rounded-md bg-bg/60 text-primary">
              <Code2 className="h-5 w-5" />
            </div>
            <h2 className="font-display text-3xl leading-tight tracking-tight
                           sm:text-4xl">
              Build your own apps.<br />
              <span className="text-primary">It's a manifest and a main.py.</span>
            </h2>
            <p className="mt-4 max-w-2xl text-text-dim">
              The badge ships with 20 first-party apps and an on-device store
              that pulls from GitHub at runtime. Fork the repo, drop your app
              in <code className="rounded bg-bg-raised px-1.5 py-0.5 text-sm">apps_market/</code>
              {" "}and submit a PR — the next person to refresh the store will see it.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href="https://github.com/elixpo/oreo/blob/main/CONTRIBUTING.md"
                target="_blank" rel="noreferrer"
                className="btn-primary"
              >
                Read the contributing guide
              </a>
              <Link href="/get-started/" className="btn-ghost">
                Setup the hardware
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
