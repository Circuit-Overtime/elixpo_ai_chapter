import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const check = process.argv.includes("--check");
const repository = "elixpo/elixpo";
const headers = { Accept: "application/vnd.github+json", "User-Agent": "Elixpo-Packages-Registry-Sync/1.0" };

async function fetchJson(url, requestHeaders = headers) {
  const response = await fetch(url, { headers: requestHeaders });
  if (!response.ok) throw new Error(`Unable to fetch ${url}: HTTP ${response.status}`);
  return response.json();
}

const commit = await fetchJson(`https://api.github.com/repos/${repository}/commits/main`);
const rawBase = `https://raw.githubusercontent.com/${repository}/${commit.sha}/content`;
const packages = await fetchJson(`${rawBase}/packages.json`, { "User-Agent": headers["User-Agent"] });
const schema = await fetchJson(`${rawBase}/schemas/packages.schema.json`, { "User-Agent": headers["User-Agent"] });
if (packages?.$schema !== "./schemas/packages.schema.json" || !Array.isArray(packages.linuxApplications) || !Array.isArray(packages.npmPackages)) {
  throw new Error("Canonical package registry does not satisfy the expected publication contract.");
}
if (schema?.$id !== "https://elixpo.com/schemas/packages.schema.json" || schema?.title !== "Elixpo distributed packages") {
  throw new Error("Canonical package schema does not satisfy the expected publication contract.");
}

const provenance = {
  sourceRepository: `https://github.com/${repository}`,
  sourcePaths: ["content/packages.json", "content/schemas/packages.schema.json"],
  sourceCommit: commit.sha,
  sourceCommittedAt: commit.commit.committer.date,
};
const outputs = new Map([
  ["content/packages.json", `${JSON.stringify(packages, null, 2)}\n`],
  ["content/schemas/packages.schema.json", `${JSON.stringify(schema, null, 2)}\n`],
  ["content/registry-source.json", `${JSON.stringify(provenance, null, 2)}\n`],
]);

for (const [path, expected] of outputs) {
  const absolute = resolve(process.cwd(), path);
  if (check) {
    const current = await readFile(absolute, "utf8").catch(() => "");
    if (current !== expected) {
      console.error(`${path} is stale; run npm run registry:sync and review the canonical changes.`);
      process.exitCode = 1;
    }
  } else {
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, expected);
    console.log(`Synchronized ${path} from ${commit.sha.slice(0, 12)}.`);
  }
}
