import Link from "next/link";
import { ArrowRight, BookOpen, Cpu, FileText, Gauge, Github, Layers3, Timer, Users } from "lucide-react";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "RV565 Research Paper — Coming Soon",
  description: "A forthcoming paper on RV565, a cross-layer architecture for frame-independent RGB565 video playback on MicroPython-class ESP32-S3 systems.",
  path: "/paper/",
  keywords: ["RV565 paper", "ESP32-S3 video research", "embedded video playback", "RGB565 DMA", "MicroPython research"],
  type: "article",
});

const authors = [
  { name: "Ayushman Bhattacharya", email: "ayushman@pollinations.ai" },
  { name: "Anwesha Chakraborty", email: "anwesha.elixpo@gmail.com" },
  { name: "Nihal Gazi", email: "nihalg2006@gmail.com" },
];

const metrics = [
  { value: "24.004", label: "standalone FPS", icon: Gauge },
  { value: "7,200", label: "measured frames", icon: Layers3 },
  { value: "40.206 ms", label: "pooled work p99", icon: Timer },
];

export default function PaperPage() {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[760px]">
        <div className="absolute left-[8%] top-16 h-80 w-80 rounded-full bg-primary/10 blur-[130px]" />
        <div className="absolute right-[8%] top-24 h-80 w-80 rounded-full bg-lilac/10 blur-[140px]" />
      </div>
      <div className="container-page py-20 pb-28">
        <div className="mx-auto max-w-4xl text-center">
          <span className="chip"><FileText className="h-3.5 w-3.5" /> research · coming soon</span>
          <h1 className="mt-8 font-display text-4xl leading-tight tracking-tight sm:text-6xl">RV565: Cross-Layer Co-Design for Frame-Independent Video Playback on MicroPython-Class ESP32-S3 Systems</h1>
          <p className="mx-auto mt-7 max-w-3xl text-lg leading-relaxed text-text-dim">A technical paper documenting how host-side RGB565 preparation, independent Deflate frames, firmware-resident inflation, explicit memory placement, and double-buffered SPI2 GDMA make predictable embedded video possible inside OreoOS.</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-text-dim">
            {authors.map((author) => <a key={author.email} href={`mailto:${author.email}`} className="transition-colors hover:text-text">{author.name}</a>)}
          </div>
          <div className="mx-auto mt-12 grid max-w-3xl gap-4 sm:grid-cols-3">
            {metrics.map(({ value, label, icon: Icon }) => (
              <div key={label} className="card-surface p-6 text-left"><Icon className="h-5 w-5 text-primary" /><p className="mt-4 font-display text-3xl text-text">{value}</p><p className="mt-1 text-xs uppercase tracking-wider text-muted">{label}</p></div>
            ))}
          </div>
        </div>
        <div className="mx-auto mt-16 grid max-w-5xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="card-surface p-7 sm:p-9">
            <BookOpen className="h-6 w-6 text-teal" />
            <h2 className="mt-5 font-display text-3xl text-text">What the paper establishes</h2>
            <ul className="mt-6 space-y-4 text-sm leading-relaxed text-text-dim">
              <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />A frame-independent RV565 v6 container whose decoded representation is display-native RGB565.</li>
              <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />A narrow custom-firmware boundary that calls the ESP32-S3 ROM inflater on reusable buffers.</li>
              <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />A double-buffered stripe pipeline that overlaps CPU scaling with SPI2 GDMA transfer.</li>
              <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />Reproducible standalone and full-OreoOS measurements with explicit claim boundaries.</li>
              <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />A path from internal flash to future SD-backed media without changing the decoder contract.</li>
            </ul>
          </section>
          <aside className="card-surface p-7 sm:p-9">
            <Users className="h-6 w-6 text-lilac" />
            <h2 className="mt-5 font-display text-2xl text-text">Publication status</h2>
            <p className="mt-4 leading-relaxed text-text-dim">The manuscript, figures, evaluation artifacts, and references are being prepared for public release. The implementation and technical architecture are already available in the open repository.</p>
            <div className="mt-7 space-y-3">
              <Link href="/docs/video-architecture/" className="btn-primary w-full justify-center">Read the architecture <ArrowRight className="h-4 w-4" /></Link>
              <a href="https://github.com/elixpo/oreo" target="_blank" rel="noreferrer" className="btn-ghost w-full justify-center"><Github className="h-4 w-4" /> Browse the repository</a>
            </div>
          </aside>
        </div>
        <div className="mx-auto mt-10 max-w-5xl rounded-xl border border-border bg-bg-raised/70 p-6 text-sm leading-relaxed text-text-dim">
          <div className="flex items-start gap-3"><Cpu className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><p><strong className="text-text">Measured claim:</strong> the standalone native-DMA path sustained 24.004 FPS over 7,200 frames with zero drops and zero deadline misses. The complete instrumented Gallery path currently measures 14.093 FPS; closing that integration gap is ongoing engineering work.</p></div>
        </div>
      </div>
    </div>
  );
}
