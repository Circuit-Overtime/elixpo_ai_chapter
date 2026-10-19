/* eslint-disable @next/next/no-img-element */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import recognition from "../../../../../content/recognition.json";

const CERTIFICATE_WIDTH = 3508;
const CERTIFICATE_HEIGHT = 2480;
const CERTIFICATE_SCALE = CERTIFICATE_WIDTH / 1600;
const LOGO_DATA_URI = `data:image/png;base64,${readFileSync(
  join(process.cwd(), "public/logos/logo.png"),
).toString("base64")}`;

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return recognition.records.map((record) => ({ id: record.id.toLowerCase() }));
}

function getRecord(id: string) {
  return recognition.records.find((record) => record.id.toLowerCase() === id.toLowerCase());
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const record = getRecord(id);
  if (!record) return new Response("Certificate not found.\n", { status: 404 });

  const issued = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${record.issuedAt}T00:00:00Z`));
  const verificationUrl = `elixpo.com/recognition/${record.id.toLowerCase()}`;
  const recipientSize = record.name.length > 22 ? 55 : 64;

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", overflow: "hidden", background: "#f6f5f0" }}>
    <div style={{ width: 1600, height: 1131, flex: "none", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", padding: "68px 78px 58px", color: "#142018", background: "#f6f5f0", fontFamily: "Arial, sans-serif", transform: `scale(${CERTIFICATE_SCALE})`, transformOrigin: "top left" }}>
      <div style={{ position: "absolute", inset: 22, display: "flex", border: "1px solid rgba(20,32,24,.2)" }} />
      <div style={{ position: "absolute", width: 760, height: 760, right: -250, top: -330, display: "flex", borderRadius: 999, border: "1px solid rgba(20,32,24,.16)", background: "#e4ebfa" }} />
      <div style={{ position: "absolute", width: 390, height: 390, right: 115, top: 150, display: "flex", borderRadius: 999, border: "1px solid rgba(20,32,24,.16)" }} />
      <div style={{ position: "absolute", width: 420, height: 420, left: -240, top: 350, display: "flex", borderRadius: 999, border: "1px solid rgba(20,32,24,.14)", background: "#dfeee5" }} />
      <div style={{ position: "absolute", width: 185, height: 185, left: 28, top: 485, display: "flex", borderRadius: 999, border: "1px solid rgba(11,98,60,.2)", background: "rgba(255,255,255,.5)" }} />
      <div style={{ position: "absolute", width: 230, height: 230, right: -40, bottom: -95, display: "flex", borderRadius: "42% 58% 48% 52%", border: "1px solid rgba(20,32,24,.14)", background: "#f0e6d3", transform: "rotate(25deg)" }} />

      <div style={{ position: "relative", zIndex: 2, height: 86, display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid rgba(20,32,24,.22)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img src={LOGO_DATA_URI} width="46" height="46" alt="" style={{ width: 46, height: 46, borderRadius: 999, objectFit: "cover" }} />
          <div style={{ display: "flex", flexDirection: "column" }}><b style={{ fontSize: 23 }}>Elixpo</b><span style={{ marginTop: 5, color: "#0b623c", fontSize: 10, fontWeight: 700, letterSpacing: 2.2 }}>OPEN-SOURCE PROJECT FOUNDRY</span></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}><span style={{ color: "#0b623c", fontSize: 10, fontWeight: 700, letterSpacing: 2.2 }}>PUBLIC APPRECIATION RECORD</span><b style={{ marginTop: 11, fontSize: 13, letterSpacing: 1.5 }}>2026 / {record.id.slice(-3)}</b></div>
      </div>

      <div style={{ position: "relative", zIndex: 2, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "30px 110px 20px" }}>
        <span style={{ color: "#0b623c", fontSize: 12, fontWeight: 700, letterSpacing: 3.4 }}>PUBLIC RECOGNITION OF OPEN-SOURCE WORK</span>
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", alignItems: "center", fontSize: 88, fontWeight: 700, lineHeight: .86, letterSpacing: -6 }}><span>Certificate of</span><span style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontStyle: "italic", letterSpacing: -4 }}>Contribution.</span></div>
        <div style={{ width: 960, marginTop: 30, paddingTop: 16, display: "flex", flexDirection: "column", alignItems: "center", borderTop: "1px solid rgba(20,32,24,.2)" }}>
          <span style={{ color: "#69746d", fontSize: 14, letterSpacing: .6 }}>Presented with appreciation</span>
          <span style={{ marginTop: 7, fontFamily: "Georgia, serif", fontSize: recipientSize, lineHeight: 1, letterSpacing: -2.4 }}>Dear {record.name},</span>
        </div>
        <span style={{ maxWidth: 1100, marginTop: 20, color: "#35483d", fontSize: 25, lineHeight: 1.46, letterSpacing: -.25 }}>Elixpo proudly recognizes you {record.statement}. Your care, skill, and willingness to build in public helped turn shared ideas into documented, usable outcomes. This contribution is preserved in Elixpo&apos;s inspectable public record so the work—and the person behind it—remains visible.</span>
      </div>

      <div style={{ position: "absolute", zIndex: 3, width: 148, height: 148, right: 68, top: 492, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRadius: 999, border: "1px solid rgba(11,98,60,.5)", boxShadow: "0 0 0 9px #f6f5f0, 0 0 0 10px rgba(11,98,60,.18)", color: "#0b623c", background: "rgba(255,255,255,.78)" }}>
        <div style={{ width: 31, height: 31, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #0b623c", borderRadius: 999 }}>
          <div style={{ width: 13, height: 7, marginTop: -3, display: "flex", borderLeft: "2.6px solid #0b623c", borderBottom: "2.6px solid #0b623c", transform: "rotate(-45deg)" }} />
        </div>
        <b style={{ marginTop: 8, fontSize: 12, lineHeight: 1.35, textAlign: "center", letterSpacing: 2 }}>PUBLIC<br/>RECORD</b><span style={{ marginTop: 8, fontSize: 9, fontWeight: 700, letterSpacing: 1.5 }}>ELIXPO · 2026</span>
      </div>

      <div style={{ position: "relative", zIndex: 2, minHeight: 132, paddingTop: 22, display: "flex", alignItems: "flex-end", borderTop: "1px solid rgba(20,32,24,.22)" }}>
        <div style={{ flex: 1, display: "flex", gap: 32 }}>
          {[["CONTRIBUTION PERIOD", record.period], ["GITHUB IDENTITY", `@${record.handle}`], ["ISSUED", issued], ["CERTIFICATE ID", record.id]].map(([label, value]) => <div key={label} style={{ width: 175, display: "flex", flexDirection: "column" }}><span style={{ color: "#69746d", fontSize: 10, letterSpacing: 1.3 }}>{label}</span><b style={{ marginTop: 8, fontSize: 14 }}>{value}</b></div>)}
        </div>
        <div style={{ width: 275, display: "flex", flexDirection: "column", paddingRight: 24 }}><span style={{ height: 42 }} /><span style={{ fontFamily: "Georgia, serif", fontSize: 22 }}>Ayushman Bhattacharya</span><b style={{ marginTop: 7, fontSize: 10, lineHeight: 1.35 }}>Founder and Project Lead · Authorized signatory</b></div>
        <div style={{ width: 320, display: "flex", flexDirection: "column" }}><span style={{ color: "#69746d", fontSize: 10, letterSpacing: 1.3 }}>VERIFY THE RECORD</span><b style={{ marginTop: 9, fontSize: 11 }}>{verificationUrl}</b></div>
      </div>
    </div>
    </div>,
    {
      width: CERTIFICATE_WIDTH,
      height: CERTIFICATE_HEIGHT,
      headers: {
        "Content-Disposition": `attachment; filename="elixpo-${record.id.toLowerCase()}.png"`,
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}
