"use client";

import { useEffect, useRef, useState } from "react";

interface MermaidDiagramProps {
  chart: string;
  id?: string;
}

/**
 * Renders a Mermaid diagram in the hand-drawn (rough.js) look, themed to match
 * the site, and laid out spaciously so it feels embedded in the page.
 *
 * Performance: mermaid (heavy) is lazy-imported AND the render is deferred until
 * the diagram scrolls near the viewport, the resulting SVG is static (no
 * animations), and the wrapper uses CSS containment - so it never blocks the
 * initial load or janks the scroll.
 */
export function MermaidDiagram({ chart, id = "diagram" }: MermaidDiagramProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [svg, setSvg] = useState("");
  const [failed, setFailed] = useState(false);

  // Defer all work until the diagram is about to enter the viewport.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          look: "handDrawn",
          handDrawnSeed: 4,
          theme: "base",
          themeVariables: {
            background: "transparent",
            primaryColor: "#161616",
            primaryTextColor: "#E1E0CC",
            primaryBorderColor: "#DEDBC8",
            secondaryColor: "#141414",
            tertiaryColor: "#0d0d0d",
            lineColor: "#8a8a8a",
            fontFamily: "Almarai, ui-sans-serif, system-ui, sans-serif",
            fontSize: "14px",
            clusterBkg: "rgba(255,255,255,0.02)",
            clusterBorder: "rgba(255,255,255,0.14)",
            edgeLabelBackground: "#0d0d0d",
          },
          flowchart: {
            useMaxWidth: true,
            htmlLabels: true,
            curve: "basis",
            padding: 18,
            nodeSpacing: 46,
            rankSpacing: 64,
          },
        });
        const { svg } = await mermaid.render(`mmd-${id}`, chart);
        if (active) setSvg(svg);
      } catch (err) {
        console.error("Mermaid render failed:", err);
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [visible, chart, id]);

  return (
    <div ref={ref} style={{ contain: "content" }} className="min-h-[260px]">
      {failed ? (
        <pre className="text-xs text-[#DEDBC8]/60 font-mono overflow-x-auto whitespace-pre-wrap">
          {chart}
        </pre>
      ) : svg ? (
        <div
          className="mermaid-wrap w-full overflow-x-auto animate-fade-in [&_svg]:w-full [&_svg]:max-w-full [&_svg]:h-auto [&_svg]:mx-auto"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 py-24">
          <span className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#DEDBC8]/40">
            Rendering topology
          </span>
        </div>
      )}
    </div>
  );
}
