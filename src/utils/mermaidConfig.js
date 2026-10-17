export const MERMAID_FONT_FAMILY = "'lixDefault', 'Inter', system-ui, sans-serif";

const sharedThemeVariables = {
  fontFamily: MERMAID_FONT_FAMILY,
  fontSize: '15px',
};

export function getMermaidConfig(isDark) {
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    theme: isDark ? 'dark' : 'default',
    // Native SVG labels avoid foreignObject sizing differences between
    // Firefox, Chromium, and WebKit and remain measurable inside the viewport.
    htmlLabels: false,
    themeVariables: isDark ? {
      ...sharedThemeVariables,
      primaryColor: '#25243a',
      primaryTextColor: '#f3f0ff',
      primaryBorderColor: '#a78bfa',
      lineColor: '#a1a8b8',
      secondaryColor: '#1d2230',
      tertiaryColor: '#141824',
      nodeTextColor: '#f3f0ff',
      nodeBorder: '#a78bfa',
      mainBkg: '#25243a',
      clusterBkg: '#191d29',
      clusterBorder: '#42485a',
      titleColor: '#ddd6fe',
      edgeLabelBackground: '#141824',
    } : {
      ...sharedThemeVariables,
      primaryColor: '#eee9ff',
      primaryTextColor: '#201b35',
      primaryBorderColor: '#7c5ce0',
      lineColor: '#667085',
      secondaryColor: '#f6f3ff',
      tertiaryColor: '#fbfaff',
      nodeTextColor: '#201b35',
      nodeBorder: '#7c5ce0',
      mainBkg: '#eee9ff',
      clusterBkg: '#f7f5ff',
      clusterBorder: '#d7d0eb',
      titleColor: '#6046b6',
      edgeLabelBackground: '#fbfaff',
    },
    flowchart: {
      padding: 20,
      nodeSpacing: 48,
      rankSpacing: 56,
      curve: 'basis',
      htmlLabels: false,
      useMaxWidth: false,
    },
    sequence: {
      useMaxWidth: false,
      diagramMarginX: 24,
      diagramMarginY: 20,
      actorMargin: 48,
      boxMargin: 10,
      noteMargin: 10,
      messageMargin: 34,
      mirrorActors: false,
    },
    class: { useMaxWidth: false },
    er: { useMaxWidth: false },
  };
}

export function normalizeMermaidSource(source = '') {
  let diagram = String(source).replace(/^\uFEFF/, '').trim();
  diagram = diagram
    .replace(/^```[ \t]*mermaid[ \t]*(?:\r?\n)?/i, '')
    .replace(/\r?\n?```[ \t]*$/, '')
    .trim();

  return diagram
    .replace(/^\s*(?:seq|sequence)(?:diagram)?\b/i, 'sequenceDiagram')
    .replace(/^\s*class(?:diagram)?\b/i, 'classDiagram')
    .replace(/^\s*er(?:diagram)?\b/i, 'erDiagram')
    .replace(/^\s*gitgraph\b/i, 'gitGraph')
    .replace(/^\s*statediagram\b/i, 'stateDiagram');
}

export function prepareMermaidSvg(svg) {
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(svg, 'image/svg+xml');
  const svgElement = documentNode.querySelector('svg');
  if (!svgElement) return svg;

  // Preserve a numeric intrinsic size from the viewBox. Chromium/WebKit can
  // resolve an SVG with only a viewBox and forced 100% width/height differently
  // from Firefox, which clips or stretches complex diagrams in fixed viewports.
  const viewBox = (svgElement.getAttribute('viewBox') || '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
    svgElement.setAttribute('width', String(viewBox[2]));
    svgElement.setAttribute('height', String(viewBox[3]));
  } else {
    svgElement.removeAttribute('width');
    svgElement.removeAttribute('height');
  }
  svgElement.removeAttribute('style');
  svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svgElement.setAttribute('class', `${svgElement.getAttribute('class') || ''} lix-mermaid-svg`.trim());
  svgElement.setAttribute('role', 'img');
  svgElement.setAttribute('aria-label', 'Mermaid diagram');
  return svgElement.outerHTML;
}
