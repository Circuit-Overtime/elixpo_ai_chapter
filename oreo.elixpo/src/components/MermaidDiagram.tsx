"use client";

import { useEffect, useId, useState } from "react";

type MermaidDiagramProps = {
  chart: string;
  label: string;
};

/** Render Mermaid lazily so diagrams do not enter the server-render path. */
export default function MermaidDiagram({ chart, label }: MermaidDiagramProps) {
  const reactId = useId();
  const [svg, setSvg] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            background: "#151124",
            primaryColor: "#241c35",
            primaryTextColor: "#f5e6dc",
            primaryBorderColor: "#ff5d68",
            secondaryColor: "#182d2c",
            secondaryTextColor: "#f5e6dc",
            secondaryBorderColor: "#3ddc97",
            tertiaryColor: "#28233d",
            tertiaryTextColor: "#f5e6dc",
            tertiaryBorderColor: "#a29bfe",
            lineColor: "#8a8294",
            textColor: "#f5e6dc",
            noteBkgColor: "#1f1b33",
            noteTextColor: "#f5e6dc",
            noteBorderColor: "#ffbe1e",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          },
          flowchart: { curve: "basis", htmlLabels: true },
        });

        const id = `mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;
        const result = await mermaid.render(id, chart.trim());
        if (!cancelled) setSvg(result.svg);
      } catch (renderError) {
        console.error("Could not render Mermaid diagram", renderError);
        if (!cancelled) setError(true);
      }
    }

    render();
    return () => { cancelled = true; };
  }, [chart, reactId]);

  return (
    <figure
      aria-label={label}
      className="my-8 overflow-x-auto rounded-lg border border-border bg-bg-raised/70 p-4 sm:p-6"
    >
      {error ? (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-4 text-sm text-text-dim">
          Diagram unavailable. The surrounding section contains the complete description.
        </div>
      ) : svg ? (
        <div
          className="mx-auto min-w-[580px] [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="mx-auto h-64 max-w-3xl animate-pulse rounded-md bg-card-sub" />
      )}
      <figcaption className="mt-4 text-center text-xs text-muted">{label}</figcaption>
    </figure>
  );
}
