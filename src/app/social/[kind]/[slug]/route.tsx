import { ImageResponse } from "next/og";
import { getDirectoryEntry, getDirectoryEntries } from "@/lib/directory";
import { getPackageRecord, PACKAGE_RECORDS } from "@/lib/packages";
import { getResearchRecord } from "@/lib/research";
import contributors from "../../../../../content/contributors.json";
import recognition from "../../../../../content/recognition.json";

export const dynamic = "force-static";
export const dynamicParams = false;

type SocialRecord = {
  eyebrow: string;
  title: string;
  description: string;
  status: string;
  accent: string;
  wash: string;
};

export function generateStaticParams() {
  const directory = (["project", "research", "service"] as const).flatMap((kind) =>
    getDirectoryEntries(kind).map(({ slug }) => ({ kind, slug })),
  );
  return [
    { kind: "research", slug: "index" },
    ...directory,
    ...PACKAGE_RECORDS.map(({ slug }) => ({ kind: "package", slug })),
    ...contributors.featured.map(({ handle }) => ({ kind: "contributor", slug: handle })),
    ...recognition.records.map(({ id }) => ({ kind: "recognition", slug: id.toLowerCase() })),
  ];
}

function findRecord(kind: string, slug: string): SocialRecord | undefined {
  if (kind === "research" && slug === "index") {
    return { eyebrow: "Elixpo Open Research", title: "Research published with its source, evidence, and current status.", description: "Explore papers, experiments, released artifacts, public demonstrations, citations, and reproducibility records from Elixpo.", status: `${getDirectoryEntries("research").length} documented records`, accent: "#345fc3", wash: "#dce7ff" };
  }
  if (kind === "package") {
    const record = getPackageRecord(slug);
    if (!record) return;
    return { eyebrow: `Elixpo Packages · ${record.kind}`, title: record.name, description: record.description, status: `${record.status} · v${record.version}`, accent: record.kind === "npm" ? "#cb3837" : "#0b623c", wash: record.kind === "npm" ? "#f4d7d4" : "#bde8ce" };
  }
  if (kind === "contributor") {
    const person = contributors.featured.find(({ handle }) => handle === slug);
    if (!person) return;
    return { eyebrow: "Elixpo Public Contribution Record", title: person.name, description: person.story, status: `${person.recordId} · ${person.activeWindow}`, accent: "#0b623c", wash: "#dfeee5" };
  }
  if (kind === "recognition") {
    const record = recognition.records.find(({ id }) => id.toLowerCase() === slug.toLowerCase());
    if (!record) return;
    return { eyebrow: "Elixpo Certificate of Contribution", title: record.name, description: `Issued in appreciation ${record.statement}. Verify the public record and its connected contribution evidence on Elixpo.`, status: `${record.id} · Issued ${record.issuedAt}`, accent: "#0b623c", wash: "#f0e6d3" };
  }
  if (kind !== "project" && kind !== "research" && kind !== "service") return;
  const entry = getDirectoryEntry(kind, slug);
  if (!entry) return;
  if (kind === "research") {
    const research = getResearchRecord(slug);
    if (research) return { eyebrow: "Elixpo Open Research", title: research.title, description: research.abstract, status: `${research.researchStatus.replaceAll("-", " ")} · ${research.reviewStatus.replaceAll("-", " ")}`, accent: "#345fc3", wash: "#dce7ff" };
  }
  const colors = kind === "service" ? { accent: "#9b4c31", wash: "#f2d8c8" } : { accent: "#0b623c", wash: "#bde8ce" };
  return { eyebrow: `Elixpo Open ${kind === "project" ? "Projects" : "Services"}`, title: entry.name, description: entry.summary, status: `${entry.lifecycle} · ${entry.relationship}`, ...colors };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string; slug: string }> },
) {
  const { kind, slug } = await params;
  const record = findRecord(kind, slug);
  if (!record) return new Response("Social card not found.\n", { status: 404 });
  const titleSize = record.title.length > 100 ? 48 : record.title.length > 66 ? 58 : 76;
  const description = record.description.length > 190 ? `${record.description.slice(0, 187).trimEnd()}…` : record.description;

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", overflow: "hidden", background: "#f6f5f0", color: "#142018", fontFamily: "Arial, sans-serif", padding: "68px 76px" }}>
      <div style={{ position: "absolute", width: 650, height: 650, borderRadius: 999, right: -170, top: -230, background: record.wash }} />
      <div style={{ position: "absolute", width: 440, height: 440, borderRadius: 999, right: 35, top: 55, border: "2px solid rgba(20,32,24,.18)" }} />
      <div style={{ position: "absolute", width: 235, height: 235, borderRadius: 999, right: 135, top: 150, background: record.accent }} />
      <div style={{ position: "relative", width: 850, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", color: record.accent, fontSize: 17, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase" }}>{record.eyebrow}</div>
        <div style={{ display: "flex", marginTop: 58, fontSize: titleSize, fontWeight: 700, lineHeight: .95, letterSpacing: -3.5 }}>{record.title}</div>
        <div style={{ display: "flex", marginTop: 30, maxWidth: 760, color: "#5f6962", fontSize: 22, lineHeight: 1.42 }}>{description}</div>
        <div style={{ display: "flex", marginTop: "auto", alignItems: "center", gap: 16 }}><span style={{ display: "flex", padding: "10px 16px", borderRadius: 999, background: "#142018", color: "white", fontSize: 15, textTransform: "uppercase", letterSpacing: 2 }}>{record.status}</span><span style={{ display: "flex", color: "#5f6962", fontSize: 17 }}>elixpo.com</span></div>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
