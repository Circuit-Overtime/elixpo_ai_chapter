import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Binary, Box, Cpu, Database, FileText,
  Gauge, Github, HardDrive, Layers3, MemoryStick, MonitorUp,
  ShieldCheck, Timer, Workflow,
} from "lucide-react";
import MermaidDiagram from "@/components/MermaidDiagram";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "RV565 Video Architecture",
  description: "How OreoOS combines independent Deflate-compressed RGB565 frames, a custom MicroPython firmware module, and SPI2 GDMA stripes for embedded video on ESP32-S3.",
  path: "/docs/video-architecture/",
  keywords: ["ESP32-S3 video playback", "RV565", "RGB565 video", "MicroPython C module", "SPI DMA display", "embedded video architecture"],
  type: "article",
});

const hostPipeline = String.raw`
flowchart LR
    A[Source video] --> B[Decode on host]
    B --> C[24 FPS selection]
    C --> D[Lanczos resize<br/>180 × 135]
    D --> E[RGB565 conversion]
    E --> F[Independent<br/>zlib / Deflate frames]
    F --> G[RV565 v6]
    G --> H[Validate size<br/>and storage budget]`;

const firmwareBoundary = String.raw`
flowchart TB
    subgraph Python[OreoOS Gallery · MicroPython]
      A[Media selection]
      B[Read payload into<br/>reused source buffer]
      C[Pause · seek · exit<br/>and lifecycle policy]
    end
    subgraph Firmware[Custom firmware module]
      D[_oreo_rv565.inflate_frame]
      E[ESP32-S3 ROM tinfl]
      F[Exact output-size check]
    end
    subgraph Display[Native display path]
      G[RGB565 source frame]
      H[Scale and draw]
      I[SPI transfer]
      J[LCD]
    end
    A --> B --> D --> E --> F --> G --> H --> I --> J
    C -. schedules .-> B`;

const dmaPipeline = String.raw`
flowchart LR
    A[RV565 in flash] --> B[ROM tinfl]
    B --> C[Reusable<br/>RGB565 frame]
    C --> D[Scale stripe n<br/>into SRAM A]
    D --> E[SPI2 GDMA<br/>sends stripe n]
    C --> F[Scale stripe n + 1<br/>into SRAM B]
    F --> G[SPI2 GDMA<br/>sends stripe n + 1]
    E -. CPU works while<br/>DMA transfers .-> F`;

const nextPipeline = String.raw`
flowchart LR
    A[Internal flash<br/>or future SD] --> B[Compressed-frame<br/>ring buffer]
    B --> C[PSRAM prefetch]
    C --> D[Fused native<br/>inflate + scale]
    D --> E[SRAM stripe A]
    D --> F[SRAM stripe B]
    E --> G[SPI2 GDMA]
    F --> G
    G --> H[LCD]
    I[Gallery controls] --> J[Frame scheduler]
    J --> B
    J --> D`;

const toc = [
  ["budget", "The frame deadline"],
  ["format", "RV565 v6"],
  ["encoding", "Host-side encoding"],
  ["firmware", "Why firmware"],
  ["dma", "The 24 FPS DMA path"],
  ["results", "Measured results"],
  ["gallery", "Gallery integration"],
  ["roadmap", "The next pipeline"],
] as const;

const frameBudget = [
  { value: "41.667 ms", label: "24 FPS deadline", icon: Gauge },
  { value: "≈30.72 ms", label: "40 MHz SPI wire time", icon: MonitorUp },
  { value: "≈10.95 ms", label: "serial compute margin", icon: Cpu },
];

function SectionTitle({ id, icon: Icon, children }: { id: string; icon: typeof Cpu; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-24 pt-9">
      <div className="mb-4 flex items-center gap-3">
        <Icon className="h-5 w-5 text-primary" />
        <h2 className="font-display text-3xl tracking-tight text-text">{children}</h2>
      </div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-card-sub px-1.5 py-0.5 font-mono text-[0.92em] text-text">{children}</code>;
}

export default function VideoArchitecturePage() {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[680px] overflow-hidden">
        <div className="absolute left-[12%] top-8 h-80 w-80 rounded-full bg-primary/10 blur-[130px]" />
        <div className="absolute right-[10%] top-28 h-72 w-72 rounded-full bg-teal/10 blur-[130px]" />
      </div>
      <div className="container-page py-12 pb-28">
        <Link href="/docs/" className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-text">
          <ArrowLeft className="h-4 w-4" /> All documentation
        </Link>
        <header className="mt-10 max-w-4xl">
          <span className="chip mb-6"><Cpu className="h-3.5 w-3.5" /> engineering deep dive</span>
          <h1 className="font-display text-4xl leading-[1.05] tracking-tight sm:text-6xl">RV565: video as one timed system.</h1>
          <p className="mt-6 max-w-3xl text-lg leading-relaxed text-text-dim">OreoOS prepares full-colour RGB565 frames on the host, inflates them through custom ESP32-S3 firmware, and uses a double-buffered DMA display path to make a 24 FPS deadline achievable on microcontroller hardware.</p>
          <div className="mt-7 flex flex-wrap gap-2 text-xs text-muted">
            <span className="chip">ESP32-S3</span><span className="chip">MicroPython 1.28</span>
            <span className="chip">RV565 v6</span><span className="chip">24.004 FPS native path</span>
            <span className="chip">320 × 240 RGB565</span>
          </div>
        </header>
        <div className="mt-14 grid gap-12 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">On this page</p>
            <nav className="border-l border-border">
              {toc.map(([id, label]) => <a key={id} href={`#${id}`} className="block border-l border-transparent py-1.5 pl-4 text-sm text-text-dim transition-colors hover:border-primary hover:text-text">{label}</a>)}
            </nav>
            <a href="https://github.com/elixpo/oreo/blob/main/docs/RV565_KNOWLEDGE_DECK.md" target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 text-xs text-muted hover:text-text"><Github className="h-3.5 w-3.5" /> Knowledge deck</a>
          </aside>
          <article className="min-w-0 max-w-4xl text-[15px] leading-7 text-text-dim">
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-6">
              <p className="font-semibold text-text">The central result</p>
              <p className="mt-2">The standalone native pipeline sustained <strong className="text-text">24.004 FPS across 7,200 measured frames</strong> with no drops or deadline misses. The current complete Gallery path measures 14.093 FPS, revealing that firmware decompression alone is not enough while filesystem input and framebuffer presentation remain serialized.</p>
            </div>
            <p className="mt-8">RV565 is not a new entropy codec. It is a frame-independent container and cross-layer playback architecture. Version 6 uses standard Deflate compression, but arranges representation, memory, native code, scheduling, and display I/O around the badge&apos;s actual frame deadline.</p>

            <SectionTitle id="budget" icon={Timer}>The frame deadline</SectionTitle>
            <p>A 320 × 240 RGB565 frame contains exactly:</p>
            <pre className="my-5 overflow-x-auto rounded-lg border border-border bg-bg p-5 font-mono text-sm text-text">320 × 240 × 2 bytes = 153,600 bytes</pre>
            <p>At 24 FPS the complete read, decode, scale, and display operation gets 41.667 ms. Sending the full frame over a 40 MHz SPI link consumes approximately 30.72 ms before command overhead, so a purely serial design leaves only about 10.95 ms for every other stage.</p>
            <div className="my-8 grid gap-4 sm:grid-cols-3">
              {frameBudget.map(({ value, label, icon: Icon }) => <div key={label} className="card-surface p-5"><Icon className="h-5 w-5 text-primary" /><p className="mt-3 font-display text-2xl text-text">{value}</p><p className="text-xs uppercase tracking-wider text-muted">{label}</p></div>)}
            </div>
            <p>This is why video became a systems problem rather than only a decompression problem.</p>

            <SectionTitle id="format" icon={Binary}>RV565 v6: independent full-colour frames</SectionTitle>
            <p>Each encoded source frame is 180 × 135 in the LCD&apos;s RGB565 byte order. A frame therefore expands to exactly 48,600 bytes. The file stores a compact header followed by a 32-bit compressed length and one zlib-wrapped Deflate payload for every frame.</p>
            <div className="my-7 overflow-hidden rounded-lg border border-border bg-bg-raised">
              <div className="grid gap-px bg-border sm:grid-cols-4">
                {[["RV565 v6", "Container"], ["180 × 135", "Source frame"], ["48,600 B", "Decoded frame"], ["24 FPS", "Target cadence"]].map(([value, label]) => (
                  <div key={label} className="bg-card p-5 text-center"><p className="font-mono text-lg text-text">{value}</p><p className="mt-1 text-[10px] uppercase tracking-wider text-muted">{label}</p></div>
                ))}
              </div>
              <pre className="overflow-x-auto border-t border-border bg-bg p-5 font-mono text-sm text-text">{`header
compressed_size[0]  +  zlib frame 0
compressed_size[1]  +  zlib frame 1
...
compressed_size[n]  +  zlib frame n`}</pre>
            </div>
            <p>Independent frames avoid a predictive reference chain. Seeking is direct, corruption remains local to one frame, and the decoder never needs to reconstruct earlier pictures before showing the requested one.</p>

            <SectionTitle id="encoding" icon={Workflow}>Do expensive visual work on the host</SectionTitle>
            <p>The ingestion tool decodes and resizes source media before it reaches constrained storage. It converts frames directly to RGB565, compresses them independently, validates the result, and checks whether the encoded asset fits the target storage budget.</p>
            <MermaidDiagram chart={hostPipeline} label="Host-side RV565 v6 encoding and validation" />
            <p>This keeps the badge workload bounded. High-quality resampling happens once on a workstation; playback does not perform JPEG colour conversion, palette construction, or general-purpose container parsing.</p>

            <SectionTitle id="firmware" icon={Layers3}>Why decompression moved into firmware</SectionTitle>
            <p>Earlier paths crossed the MicroPython runtime for every compressed frame and created temporary objects. The custom <Code>_oreo_rv565</Code> module instead calls the ESP32-S3 ROM&apos;s miniz <Code>tinfl</Code> implementation directly:</p>
            <pre className="my-5 overflow-x-auto rounded-lg border border-border bg-bg p-5 font-mono text-sm text-text">_oreo_rv565.inflate_frame(compressed_view, decoded_buffer)</pre>
            <p>The function accepts a read-only source buffer and writable destination, inflates directly between reused buffers, and rejects the frame unless the decoded length exactly matches the expected destination size. No temporary Python <Code>bytes</Code> object and no Python pixel loop sit in the critical path.</p>
            <MermaidDiagram chart={firmwareBoundary} label="The narrow boundary between Gallery policy, firmware mechanism, and display I/O" />
            <div className="my-7 grid gap-4 sm:grid-cols-2">
              <div className="card-surface p-5"><Cpu className="h-5 w-5 text-primary" /><h3 className="mt-3 font-semibold text-text">Native layer owns mechanism</h3><p className="mt-2 text-sm">Firmware provides bounded inflation and validation; native display code handles scaling and hardware-facing transfer primitives.</p></div>
              <div className="card-surface p-5"><Workflow className="h-5 w-5 text-teal" /><h3 className="mt-3 font-semibold text-text">Gallery owns policy</h3><p className="mt-2 text-sm">Media selection, pause, seeking, exit, controls, errors, and the normal OreoOS lifecycle.</p></div>
            </div>

            <SectionTitle id="dma" icon={MonitorUp}>The proven 24 FPS DMA path</SectionTitle>
            <p>The standalone ESP-IDF experiment isolates the hardware path. It inflates one frame into a reusable buffer, scales the image into two alternating internal-SRAM stripes, and queues each stripe to SPI2 GDMA. While DMA transfers stripe <em>n</em>, the CPU prepares stripe <em>n + 1</em>.</p>
            <MermaidDiagram chart={dmaPipeline} label="Double-buffered stripe production overlaps CPU work with SPI2 GDMA" />
            <p>DMA is valuable here because it creates concurrency, not merely because it copies bytes. The design avoids a second full 320 × 240 framebuffer and uses approximately 79.9 KiB of incremental internal allocation for decode state and two stripes in the standalone measurement.</p>

            <div className="my-7 overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[660px] text-left text-sm">
                <thead className="bg-card-sub text-xs uppercase tracking-wider text-muted"><tr><th className="p-4">Data</th><th className="p-4">Memory tier</th><th className="p-4">Reason</th></tr></thead>
                <tbody className="divide-y divide-border">
                  <tr><td className="p-4 text-text">Compressed media</td><td className="p-4">Flash / future SD</td><td className="p-4">Persistent capacity</td></tr>
                  <tr><td className="p-4 text-text">Prefetch buffers</td><td className="p-4">PSRAM</td><td className="p-4">Absorb storage latency and jitter</td></tr>
                  <tr><td className="p-4 text-text">Decoded source frame</td><td className="p-4">Reusable 8-bit memory</td><td className="p-4">Fixed working set</td></tr>
                  <tr><td className="p-4 text-text">Alternating output stripes</td><td className="p-4">DMA-capable SRAM</td><td className="p-4">Direct SPI2 GDMA access</td></tr>
                </tbody>
              </table>
            </div>

            <SectionTitle id="results" icon={Gauge}>Measured results and claim boundary</SectionTitle>
            <div className="my-7 overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-card-sub text-xs uppercase tracking-wider text-muted"><tr><th className="p-4">Configuration</th><th className="p-4">Frames</th><th className="p-4">FPS</th><th className="p-4">Drops</th><th className="p-4">Misses</th><th className="p-4">p50</th><th className="p-4">p99</th></tr></thead>
                <tbody className="divide-y divide-border">
                  <tr><td className="p-4 text-text">Standalone native DMA stripes</td><td className="p-4">7,200</td><td className="p-4 font-semibold text-teal">24.004</td><td className="p-4">0</td><td className="p-4">0</td><td className="p-4">38.552 ms</td><td className="p-4">40.206 ms</td></tr>
                  <tr><td className="p-4 text-text">OreoOS Gallery + firmware inflate</td><td className="p-4">720</td><td className="p-4 font-semibold text-gold">14.093</td><td className="p-4">0</td><td className="p-4">720</td><td className="p-4">69.535 ms</td><td className="p-4">78.938 ms</td></tr>
                </tbody>
              </table>
            </div>
            <p>The standalone result covers ten independently reset runs and remains below the 41.667 ms deadline at p99. It proves that the hardware path can sustain 24 FPS. It does not imply that every OreoOS layer already runs at the same rate.</p>

            <SectionTitle id="gallery" icon={Database}>What remains inside the complete Gallery</SectionTitle>
            <p>The integrated Gallery run measures the real application loop. Its mean work is still mostly serial:</p>
            <div className="my-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[["18.193 ms", "Filesystem read"], ["7.798 ms", "Firmware inflate"], ["7.650 ms", "Scale"], ["9.116 ms", "Gallery draw"], ["33.308 ms", "LCD present"], ["69.212 ms", "Total work"]].map(([value, label]) => (
                <div key={label} className="card-surface p-4"><p className="font-mono text-xl text-text">{value}</p><p className="mt-1 text-xs uppercase tracking-wider text-muted">{label}</p></div>
              ))}
            </div>
            <p>The clip can still look smooth because all 720 measured frames were presented without drops and the cadence is regular. Without an audio clock, slower playback is less obvious to the eye. That experience is useful, but it is not the same claim as measured real-time 24 FPS.</p>

            <SectionTitle id="roadmap" icon={HardDrive}>The next integrated pipeline</SectionTitle>
            <p>The next step is to carry the proven overlap into OreoOS: prefetch compressed frames into PSRAM, fuse native inflate and stripe production, and send those stripes directly through SPI2 GDMA instead of completing separate draw and present stages.</p>
            <MermaidDiagram chart={nextPipeline} label="Planned integrated path for internal flash and future SD media" />
            <div className="my-7 grid gap-4 sm:grid-cols-3">
              <div className="card-surface p-5"><MemoryStick className="h-5 w-5 text-primary" /><h3 className="mt-3 font-semibold text-text">Hide input latency</h3><p className="mt-2 text-sm">A compressed-frame ring in PSRAM decouples flash or SD reads from presentation.</p></div>
              <div className="card-surface p-5"><Layers3 className="h-5 w-5 text-teal" /><h3 className="mt-3 font-semibold text-text">Fuse native stages</h3><p className="mt-2 text-sm">Remove intermediate copies between inflation, scaling, and DMA stripe production.</p></div>
              <div className="card-surface p-5"><ShieldCheck className="h-5 w-5 text-gold" /><h3 className="mt-3 font-semibold text-text">Keep the contract safe</h3><p className="mt-2 text-sm">Validate every header, frame length, decoded size, and storage limit before use.</p></div>
            </div>
            <div className="mt-12 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-teal/10 p-7">
              <Box className="h-6 w-6 text-primary" />
              <h2 className="mt-4 font-display text-2xl text-text">The contribution is the complete data path.</h2>
              <p className="mt-3">Deflate, RGB565, and DMA are established technologies. RV565 combines them with host preprocessing, frame independence, explicit memory placement, a narrow firmware API, and deadline-aware display scheduling for a MicroPython-class system.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/paper/" className="btn-primary"><FileText className="h-4 w-4" /> Paper preview</Link>
                <a href="https://github.com/elixpo/oreo" target="_blank" rel="noreferrer" className="btn-ghost"><Github className="h-4 w-4" /> View implementation</a>
                <a href="https://github.com/elixpo/oreo/blob/main/docs/RV565_KNOWLEDGE_DECK.md" target="_blank" rel="noreferrer" className="btn-ghost">Read the deck <ArrowRight className="h-4 w-4" /></a>
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
