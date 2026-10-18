"use client";

import { useEffect, useId, useState } from "react";

const architectureChart = `flowchart LR
  registry[Canonical registry] --> portal[elixpo.com]
  registry --> standards[Repository Standard]
  standards --> chapter[Elixpo Chapter]

  projects[Project repositories] --> chapter
  researchProjects[Research repositories] --> chapter
  services[Operated services] --> chapter

  chapter --> releases[Public releases]
  releases --> portal
  researchProjects --> research[research.elixpo.com]
  projects --> packages[packages.elixpo.com]
  research --> portal
  packages --> portal

  contributors[Contributors and maintainers] --> projects
  contributors --> researchProjects
  contributors --> services
  portal --> record[Lifecycle, custody, credit, and history]

  classDef authority fill:#142018,color:#ffffff,stroke:#142018,stroke-width:2px;
  classDef work fill:#f0e6d3,color:#142018,stroke:#b8aa91;
  classDef publish fill:#dfe9ff,color:#142018,stroke:#7891c7;
  classDef evidence fill:#dfeee5,color:#142018,stroke:#75a58a;
  class registry,standards,chapter authority;
  class projects,researchProjects,services,contributors work;
  class portal,research,packages publish;
  class releases,record evidence;`;

export function ArchitectureDiagram() {
  const reactId = useId();
  const [svg, setSvg] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const render = async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          fontFamily: '"Avenir Next", "Segoe UI", sans-serif',
          themeVariables: {
            background: "#fbfbf8",
            primaryTextColor: "#142018",
            lineColor: "#65736a",
            fontSize: "15px",
          },
          flowchart: { curve: "basis", htmlLabels: false, nodeSpacing: 34, rankSpacing: 58 },
        });
        const id = `elixpo-architecture-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;
        const rendered = await mermaid.render(id, architectureChart);
        if (active) setSvg(rendered.svg);
      } catch {
        if (active) setFailed(true);
      }
    };
    void render();
    return () => { active = false; };
  }, [reactId]);

  if (!svg || failed) {
    return <pre className="architecture-diagram-source" aria-label="Elixpo architecture diagram source">{architectureChart}</pre>;
  }

  return <div className="architecture-diagram-svg" role="img" aria-label="Flow diagram of Elixpo repositories, Chapters, publication surfaces, releases, and public records" dangerouslySetInnerHTML={{ __html: svg }} />;
}
