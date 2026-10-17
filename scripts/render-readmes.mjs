import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";

const root = process.cwd();
const mode = process.argv[2] ?? "--check";
const validModes = new Set(["--check", "--write", "--sync-workspace"]);

if (!validModes.has(mode)) {
  console.error("Usage: node scripts/render-readmes.mjs [--check|--write|--sync-workspace]");
  process.exit(2);
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

async function readJson(relativePath) {
  return JSON.parse(await read(relativePath));
}

const [organization, taxonomy, repositories, sharedTemplate] = await Promise.all([
  readJson("content/organization.json"),
  readJson("content/taxonomy.json"),
  readJson("content/repositories.json"),
  read("content/readme/shared.md"),
]);

function activeUrl(key) {
  const endpoint = organization.urls[key];
  if (!endpoint || !["active", "planned"].includes(endpoint.status)) {
    throw new Error(`organization.urls.${key} is unavailable`);
  }
  return endpoint.url;
}

function portalUrl(pathname) {
  return new URL(pathname, `${activeUrl("website")}/`).toString().replace(/\/$/, "");
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|");
}

function titleCase(value) {
  return value.replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function publicFamiliesTable() {
  const lines = ["| Public family | Includes |", "| --- | --- |"]; 
  for (const family of taxonomy.publicFamilies) {
    lines.push(`| **${escapeCell(family.label)}** | ${escapeCell(family.description)} |`);
  }
  return lines.join("\n");
}

function repositoryDirectory() {
  const familyOrder = new Map(taxonomy.publicFamilies.map((family, index) => [family.id, index]));
  const lifecycleOrder = new Map(taxonomy.lifecycles.map((lifecycle, index) => [lifecycle, index]));
  const entries = repositories.entries
    .filter((entry) => entry.disposition === "public-entry" && entry.lifecycle !== "archived")
    .sort((left, right) =>
      familyOrder.get(left.publicClass) - familyOrder.get(right.publicClass) ||
      lifecycleOrder.get(left.lifecycle) - lifecycleOrder.get(right.lifecycle) ||
      left.name.localeCompare(right.name),
    );

  const sections = [];
  for (const family of taxonomy.publicFamilies) {
    const familyEntries = entries.filter((entry) => entry.publicClass === family.id);
    if (familyEntries.length === 0) continue;
    const lines = [
      `### ${family.label}`,
      "",
      "| Repository | Lifecycle | Relationship |",
      "| --- | --- | --- |",
    ];
    for (const entry of familyEntries) {
      lines.push(
        `| [\`${escapeCell(entry.name)}\`](${entry.repositoryUrl}) | ${titleCase(entry.lifecycle)} | ${titleCase(entry.relationship)} |`,
      );
    }
    sections.push(lines.join("\n"));
  }
  return sections.join("\n\n");
}

function replaceTokens(template, tokens) {
  let rendered = template;
  for (const [token, value] of Object.entries(tokens)) {
    rendered = rendered.replaceAll(`{{${token}}}`, value);
  }
  const unresolved = rendered.match(/{{[A-Z0-9_]+}}/g);
  if (unresolved) throw new Error(`Unresolved README tokens: ${unresolved.join(", ")}`);
  return rendered.trimEnd();
}

const shared = replaceTokens(sharedTemplate, {
  ONE_LINE_DESCRIPTION: organization.oneLineDescription,
  PUBLIC_LINE: organization.publicLine,
  FULL_DESCRIPTION: organization.fullDescription,
  PUBLIC_FAMILIES: publicFamiliesTable(),
  CURRENT_DIRECTORY: repositoryDirectory(),
  REGISTRY_DATE: repositories.snapshotDate,
  WEBSITE_URL: activeUrl("website"),
  GITHUB_URL: activeUrl("github"),
  DISCUSSIONS_URL: activeUrl("discussions"),
  CHAPTER_URL: activeUrl("chapterRepository"),
  PACKAGES_URL: activeUrl("packages"),
  RESEARCH_PUBLISHER_URL: activeUrl("research"),
  RESEARCH_INDEX_URL: portalUrl("research"),
  ASSETS_URL: activeUrl("assets"),
  TRADEMARK_POLICY_URL: "https://github.com/elixpo/elixpo/blob/main/docs/policies/trademark-and-brand-use.md",
  COMMUNITY_URL: portalUrl("community"),
  PEOPLE_URL: portalUrl("people"),
  CONTRIBUTORS_URL: portalUrl("contributors"),
  HISTORY_URL: portalUrl("history"),
});

const sharedHash = createHash("sha256").update(shared).digest("hex");
const sharedBlock = [
  `<!-- BEGIN ELIXPO SHARED · sha256:${sharedHash} · generated from elixpo/elixpo -->`,
  shared,
  "<!-- END ELIXPO SHARED -->",
].join("\n\n");

const targets = [
  {
    name: "organization",
    template: "content/readme/organization.md",
    generated: "docs/readme/generated/organization.md",
    workspace: "../.github/profile/README.md",
  },
  {
    name: "chapter",
    template: "content/readme/chapter.md",
    generated: "docs/readme/generated/chapter.md",
    workspace: "../elixpo_chapter/README.md",
  },
  {
    name: "portal",
    template: "content/readme/portal.md",
    generated: "docs/readme/generated/portal.md",
    workspace: "README.md",
  },
];

const outputs = [];
for (const target of targets) {
  const wrapper = await read(target.template);
  outputs.push({
    ...target,
    content: replaceTokens(wrapper, { SHARED: sharedBlock }) + "\n",
  });
}

if (mode === "--check") {
  const mismatches = [];
  for (const output of outputs) {
    try {
      const current = await read(output.generated);
      if (current !== output.content) mismatches.push(output.generated);
    } catch {
      mismatches.push(output.generated);
    }

    const workspacePath = resolve(root, output.workspace);
    const isPortalReadme = output.workspace === "README.md";
    try {
      const currentWorkspace = await readFile(workspacePath, "utf8");
      if (currentWorkspace !== output.content) mismatches.push(output.workspace);
    } catch (error) {
      // Sibling repositories are not expected in a single-repository CI clone.
      // The portal README is always present and must never be skipped.
      if (isPortalReadme || error?.code !== "ENOENT") mismatches.push(output.workspace);
    }
  }
  if (mismatches.length > 0) {
    console.error("Generated READMEs are stale:");
    for (const mismatch of mismatches) console.error(`- ${mismatch}`);
    console.error("Run: npm run readme:write");
    process.exit(1);
  }
  console.log(`README sources valid; shared sha256:${sharedHash}.`);
  process.exit(0);
}

for (const output of outputs) {
  const generatedPath = resolve(root, output.generated);
  await mkdir(dirname(generatedPath), { recursive: true });
  await writeFile(generatedPath, output.content);
  console.log(`Wrote ${output.generated}`);

  if (mode === "--sync-workspace") {
    const workspacePath = resolve(root, output.workspace);
    await mkdir(dirname(workspacePath), { recursive: true });
    await writeFile(workspacePath, output.content);
    console.log(`Synchronized ${output.workspace}`);
  }
}
