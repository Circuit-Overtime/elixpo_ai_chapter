
export const LIXSCRIPT_LLM_SPEC = `
[INSTRUCTIONS — MUST FOLLOW]
Output ONLY LixScript Syntax. No markdown, no explanation.
Space apart shapes generously, use relative positioning, connect all shapes. Use $color vars. No dark colors.
Nothing should be crumpled or overlapping. Use curves for non-straight arrows. Keep IDs consistent for edits. Return COMPLETE code.

Syntax: rect/circle <id> at <x>, <y> size <w>x<h> {props} | arrow/line <id> from <src> to <tgt> {props} | text <id> at <x>, <y> {content:"t"} | frame <id> at <x>, <y> size <w>x<h> {props} | image <id> at <x>, <y> size <w>x<h> {src:"url"} | icon <id> at <x>, <y> size <w>x<h> {svg:"<path .../>", color:"#fff"} | $var = val | //comment

SHAPE PROPS: stroke fill fillStyle(none|solid|hachure|cross-hatch|dots) roughness(0-3) style(solid|dashed|dotted) label labelColor labelFontSize rotation zIndex(layer order, higher=front)
CANVAS SIZE: $canvasWidth = N and $canvasHeight = N (optional, controls preview canvas dimensions)
SHADING PROPS: shadeColor shadeOpacity(0-1) shadeDirection(top|bottom|left|right)
ARROW PROPS: curve(straight|curved|elbow) curveAmount head headLength
FRAME PROPS: frameName fillStyle(transparent|solid|grid) fillColor stroke imageURL(url) imageFit(cover|contain|fill)
IMAGE PROPS: src(url) fit(cover|contain|fill) rotation
ICON PROPS: svg(inline SVG paths) color(hex color, default #ffffff) viewBoxWidth viewBoxHeight rotation
SIDES: .top .bottom .left .right .center | REFS: .x .y .right .bottom .centerX .centerY .width .height

SHADING — gradient overlays for visual depth:
- shadeColor: color for gradient (e.g., #4A90D9)
- shadeOpacity: intensity 0-1 (default 0.15, use 0.20-0.35 for research paper blocks)
- shadeDirection: where gradient fades from (top/bottom/left/right)
- Use with fillStyle: solid for rich colored blocks
- Use to distinguish layer types in neural network diagrams

LAYOUT (CRITICAL — shapes MUST NOT overlap):
- Rect min 200x65, circle min 110x110. Scale up ~20px per extra word in label.
- Vertical gap: 150px between shape edges. Horizontal gap: 250px between shape edges.
- Use relative pos: "rect b at a.x, a.bottom + 150 size 200x65"
- Start first shape at (200, 60). Curve backward/diagonal arrows. Dash optional/error flows.
- Bright strokes only (#4A90D9 blue, #2ECC71 green, #E74C3C red, #F39C12 amber, #9B59B6 purple, #1ABC9C teal, #e0e0e0 gray). No dark colors.
- When using solid fill, always set labelColor to #ffffff for readability.

RESEARCH PAPER STYLE:
- roughness: 0 for clean technical diagrams
- Use fillStyle: solid with matching fill and stroke colors
- Add shading: shadeColor matching stroke, shadeOpacity 0.20-0.30
- Use subgroups via frames with frameName
- Label edges with dimensions: "64×64", "512-d", "B×256"
- Color-code by component type:
  Conv: #4A90D9, Pool: #2ECC71, Dense: #E74C3C, Norm: #F39C12,
  Attention: #9B59B6, Embed: #1ABC9C, Input/Output: #3498DB

EXAMPLE:
$b = #4A90D9
$g = #2ECC71
$r = #E74C3C
$w = #e0e0e0
rect login at 200, 60 size 200x65 {
  stroke: $b
  label: "Login Page"
}
rect validate at login.x, login.bottom + 150 size 260x70 {
  stroke: $b
  label: "Validate Credentials"
}
circle decision at validate.x, validate.bottom + 150 size 110x110 {
  stroke: $r
  label: "Valid?"
}
rect dash at decision.x, decision.bottom + 150 size 200x65 {
  stroke: $g
  label: "Dashboard"
}
rect err at decision.right + 250, decision.y size 200x65 {
  stroke: $r
  label: "Show Error"
}
arrow a1 from login.bottom to validate.top {
  stroke: $w
  label: "Submit"
}
arrow a2 from validate.bottom to decision.top {
  stroke: $w
}
arrow a3 from decision.bottom to dash.top {
  stroke: $g
  label: "Yes"
}
arrow a4 from decision.right to err.left {
  stroke: $r
  curve: curved
  label: "No"
}
arrow a5 from err.top to login.right {
  stroke: $r
  curve: curved
  style: dashed
  label: "Retry"
}

RESEARCH PAPER EXAMPLE (shaded blocks):
$conv = #4A90D9
$pool = #2ECC71
$dense = #E74C3C
$w = #e0e0e0

rect input at 200, 60 size 220x50 {
  stroke: #3498DB
  fill: #3498DB
  fillStyle: solid
  roughness: 0
  label: "Input 224×224×3"
  labelColor: #ffffff
  shadeColor: #3498DB
  shadeOpacity: 0.25
  shadeDirection: bottom
}
rect conv1 at input.x, input.bottom + 120 size 220x50 {
  stroke: $conv
  fill: $conv
  fillStyle: solid
  roughness: 0
  label: "Conv2D 64"
  labelColor: #ffffff
  shadeColor: $conv
  shadeOpacity: 0.25
}
rect pool1 at conv1.x, conv1.bottom + 120 size 180x45 {
  stroke: $pool
  fill: $pool
  fillStyle: solid
  roughness: 0
  label: "MaxPool 2×2"
  labelColor: #ffffff
  shadeColor: $pool
  shadeOpacity: 0.20
}
arrow a1 from input.bottom to conv1.top {
  stroke: $w
  label: "224×224×3"
}
arrow a2 from conv1.bottom to pool1.top {
  stroke: $w
  label: "224×224×64"
}`

export const LIXSCRIPT_USER_PROMPT = (prompt) =>
  `Create LixScript for: ${prompt}
Use relative positioning, $color vars, 150px vertical/250px horizontal gaps. Min rect 200x65, circle 110x110. Connect all shapes.`

export const LIXSCRIPT_EDIT_PROMPT = (prompt, previousCode) =>
  `Edit this LixScript: ${prompt}

${previousCode}

Return COMPLETE updated code. Keep IDs and spacing.`

export const LIXSCRIPT_MERMAID_PROMPT = (mermaidCode) =>
  `Convert Mermaid→LixScript. [text]→rect, (text)→circle, {text}→circle. 150px V-gaps, 250px H-gaps. Min rect 200x65, circle 110x110. Relative pos. Curve non-straight arrows.

${mermaidCode}`

export const LIXSCRIPT_RESEARCH_PROMPT = (prompt) =>
  `Create a RESEARCH PAPER quality LixScript illustration for: ${prompt}

REQUIREMENTS:
- roughness: 0 (clean geometric lines, no hand-drawn effect)
- Use fillStyle: solid with color fills for all major blocks
- Add shading (shadeColor, shadeOpacity 0.20-0.30) for depth
- Set labelColor: #ffffff on all filled blocks
- Color-code by component type (Conv=#4A90D9, Pool=#2ECC71, Dense=#E74C3C, Norm=#F39C12, Attention=#9B59B6, Embed=#1ABC9C)
- Tight vertical spacing (100-130px between layers)
- Label edges with tensor dimensions where applicable
- Use frames with frameName for major sections (Encoder, Decoder, etc.)
- Use dashed lines for skip/residual connections
- Use circles for operations (add, concat, multiply)
- Publication-ready aesthetics`

export const LIXSCRIPT_RESEARCH_EDIT_PROMPT = (prompt, previousCode) =>
  `Edit this research paper LixScript illustration: ${prompt}

${previousCode}

Return COMPLETE updated code. Keep IDs, spacing, and research paper style (roughness:0, solid fills, shading).`
