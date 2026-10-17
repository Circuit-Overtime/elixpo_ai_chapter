# Use Cases

LixSketch works for anyone who thinks visually. Here's how teams and individuals use it across different workflows.

## Architecture Diagrams

Map out your system's components, services, and data flow. LixSketch's **smart arrows** auto-attach to shapes, so when you rearrange components the connections follow.

Perfect for:

- **Microservice architectures** — visualize service boundaries and communication
- **Database schemas** — map table relationships
- **API flows** — trace request/response paths
- **Infrastructure** — diagram cloud resources and networking

```lixscript
// Microservice Architecture
$blue = #4A90D9
$green = #2ECC71
$purple = #9B59B6
$orange = #E67E22
$gray = #e0e0e0

rect gateway at 200, 30 size 160x50 {
  stroke: $blue
  label: "API Gateway"
}

rect auth at 60, 150 size 140x50 {
  stroke: $green
  label: "Auth Service"
}

rect users at 200, 150 size 140x50 {
  stroke: $purple
  label: "User Service"
}

rect billing at 340, 150 size 140x50 {
  stroke: $orange
  label: "Billing"
}

rect db1 at 60, 270 size 140x50 {
  stroke: $green
  label: "Auth DB"
}

rect db2 at 200, 270 size 140x50 {
  stroke: $purple
  label: "User DB"
}

rect stripe at 340, 270 size 140x50 {
  stroke: $orange
  label: "Stripe API"
}

arrow a1 from gateway.bottom to auth.top {
  stroke: $gray
}

arrow a2 from gateway.bottom to users.top {
  stroke: $gray
}

arrow a3 from gateway.bottom to billing.top {
  stroke: $gray
}

arrow a4 from auth.bottom to db1.top {
  stroke: $gray
}

arrow a5 from users.bottom to db2.top {
  stroke: $gray
}

arrow a6 from billing.bottom to stripe.top {
  stroke: $gray
}
```

## Wireframes & UI Mockups

Sketch out UI layouts quickly without the overhead of Figma or Sketch. The hand-drawn aesthetic makes it clear that **these are drafts**, not final designs — which sets the right expectations with stakeholders.

Use cases:

- **Landing page layouts** — block out hero, features, CTA sections
- **Dashboard wireframes** — plan data displays and navigation
- **Mobile screens** — sketch app flows and screen transitions
- **Component exploration** — try different layout options fast

LixSketch's rectangle, text, and image tools make wireframing fast. Use **frames** to represent screens and arrows to show navigation flow.

## Brainstorming & Ideation

The infinite canvas gives you unlimited space to think. No page boundaries, no slide constraints.

- **Mind maps** — start from a central idea and branch out
- **Mood boards** — drop images, text, and shapes to explore direction
- **Feature prioritization** — lay out features in a grid with labels
- **Sprint planning** — sketch out stories and dependencies

The **freehand brush** with pressure sensitivity is great for quick sketches and annotations during brainstorming sessions.

## Documentation

Embed diagrams directly in your technical documentation workflow:

- **README diagrams** — export SVG and embed in GitHub READMEs
- **Architecture Decision Records** — visualize the context and consequences
- **Onboarding docs** — map out system topology for new team members
- **API documentation** — diagram request flows and data models

Export as **SVG** to keep diagrams crisp at any zoom level, or **PNG** for quick embedding.

## Education & Presentations

The **laser pointer** tool and hand-drawn aesthetic make LixSketch great for teaching:

- **Concept explanation** — draw diagrams live while explaining
- **Code architecture** — map out how modules connect
- **Data structures** — visualize trees, graphs, linked lists
- **Protocol walkthroughs** — step through network protocols visually

```lixscript
// Binary Tree Visualization
$blue = #4A90D9
$green = #2ECC71
$purple = #9B59B6
$gray = #e0e0e0

circle root at 220, 40 size 50x50 {
  stroke: $blue
  label: "8"
}

circle left at 120, 140 size 50x50 {
  stroke: $green
  label: "3"
}

circle right at 320, 140 size 50x50 {
  stroke: $green
  label: "10"
}

circle ll at 60, 240 size 50x50 {
  stroke: $purple
  label: "1"
}

circle lr at 170, 240 size 50x50 {
  stroke: $purple
  label: "6"
}

circle rr at 370, 240 size 50x50 {
  stroke: $purple
  label: "14"
}

arrow a1 from root.bottom to left.top {
  stroke: $gray
}

arrow a2 from root.bottom to right.top {
  stroke: $gray
}

arrow a3 from left.bottom to ll.top {
  stroke: $gray
}

arrow a4 from left.bottom to lr.top {
  stroke: $gray
}

arrow a5 from right.bottom to rr.top {
  stroke: $gray
}
```

## Flowcharts & Process Diagrams

Map out decision trees, user flows, and business processes. Smart arrows make it easy to restructure flows without redrawing connections.

- **User journeys** — trace the path from landing to conversion
- **CI/CD pipelines** — visualize build, test, deploy steps
- **Incident response** — document escalation procedures
- **Approval workflows** — map out review and sign-off chains

## Open Source Projects

LixSketch is itself open source, and it's built for open source workflows:

- **Contribution guides** — diagram the PR review flow
- **Architecture overviews** — help contributors understand the codebase
- **Roadmap visualization** — share planned features visually
- **Issue triage** — sketch out proposed solutions in GitHub issues

Export diagrams as SVG, commit them to your repo, and reference them in your docs.

## Why LixSketch Over Alternatives?

- **No account required** — open a URL and start drawing
- **E2E encrypted** — your data stays private by architecture
- **Open source** — audit the code, self-host, contribute
- **Hand-drawn aesthetic** — signals "draft" not "final"
- **LixScript** — generate diagrams from code
- **Real-time collab** — draw together without setup
- **Zero friction** — no install, no sign-up, no paywall
