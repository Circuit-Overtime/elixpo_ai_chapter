import { ImageResponse } from "next/og";

export const dynamic = "force-static";
export const alt = "Elixpo — Build in public. Release as a project.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", overflow: "hidden", background: "#f6f5f0", color: "#142018", fontFamily: "Arial, sans-serif", padding: "72px 78px" }}>
      <div style={{ position: "absolute", width: 610, height: 610, borderRadius: 999, right: -110, top: -180, background: "#bde8ce" }} />
      <div style={{ position: "absolute", width: 430, height: 430, borderRadius: 999, right: 80, top: 50, border: "2px solid rgba(20,32,24,.18)" }} />
      <div style={{ position: "absolute", width: 230, height: 230, borderRadius: 999, right: 180, top: 150, background: "#0b623c" }} />
      <div style={{ display: "flex", flexDirection: "column", position: "relative", width: 780 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 18, letterSpacing: 5, textTransform: "uppercase", color: "#0b623c" }}>ELIXPO · OPEN-SOURCE PROJECT FOUNDRY</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 86, fontSize: 82, lineHeight: .96, letterSpacing: -5, fontWeight: 700 }}><span>Build in public.</span><span style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontStyle: "italic" }}>Release as a project.</span></div>
        <div style={{ marginTop: 58, fontSize: 23, color: "#5f6962" }}>Software · Open research · Operated services</div>
      </div>
    </div>,
    size,
  );
}
