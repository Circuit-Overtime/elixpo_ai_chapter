import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const timeoutMs = Number.parseInt(process.env.ELIXPO_LINK_TIMEOUT_MS ?? "12000", 10);
const concurrency = Number.parseInt(process.env.ELIXPO_LINK_CHECK_CONCURRENCY ?? "8", 10);

async function readJson(path) {
  return JSON.parse(await readFile(resolve(root, path), "utf8"));
}

function collectUrls(value, location, records) {
  if (typeof value === "string" && /^https?:\/\//.test(value)) {
    const locations = records.get(value) ?? [];
    locations.push(location);
    records.set(value, locations);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectUrls(item, `${location}[${index}]`, records));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) collectUrls(item, `${location}.${key}`, records);
  }
}

function normalizedUrl(url) {
  return url.replace(/\/$/, "");
}

async function request(url, method) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Elixpo-Registry-Link-Check/1.0 (+https://elixpo.com)",
        Accept: "text/html,application/json,application/pdf,*/*;q=0.5",
        ...(method === "GET" ? { Range: "bytes=0-0" } : {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function checkUrl(url) {
  try {
    let response = await request(url, "HEAD");
    if ([400, 403, 405, 406, 415, 501].includes(response.status)) response = await request(url, "GET");
    if (response.status === 404 || response.status === 410) return { kind: "failure", status: response.status };
    if (response.ok || (response.status >= 300 && response.status < 400)) return { kind: "ok", status: response.status };
    return { kind: "warning", status: response.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { kind: "warning", status: message };
  }
}

const contentFiles = (await readdir(resolve(root, "content"), { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
  .map((entry) => `content/${entry.name}`)
  .sort();
const recordPaths = [...contentFiles, "brand/provenance.json"];
const urls = new Map();
for (const path of recordPaths) collectUrls(await readJson(path), path, urls);

const organization = await readJson("content/organization.json");
const plannedUrls = new Set(
  Object.values(organization.urls)
    .filter((entry) => entry.status === "planned" && /^https?:\/\//.test(entry.url))
    .map((entry) => normalizedUrl(entry.url)),
);
const queue = [...urls.entries()].filter(([url]) => !plannedUrls.has(normalizedUrl(url)));
const plannedCount = urls.size - queue.length;
const failures = [];
const warnings = [];
let checked = 0;

async function worker() {
  while (queue.length > 0) {
    const [url, locations] = queue.shift();
    const result = await checkUrl(url);
    checked += 1;
    if (result.kind === "failure") failures.push({ url, locations, status: result.status });
    if (result.kind === "warning") warnings.push({ url, locations, status: result.status });
  }
}

await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));

for (const warning of warnings) {
  console.warn(`Link warning (${warning.status}): ${warning.url}\n  ${warning.locations.join("\n  ")}`);
}
if (failures.length > 0) {
  console.error(`Registry link check failed with ${failures.length} confirmed dead link(s):`);
  for (const failure of failures) console.error(`- HTTP ${failure.status}: ${failure.url}\n  ${failure.locations.join("\n  ")}`);
  process.exitCode = 1;
} else {
  console.log(
    `Registry link check complete: ${checked} live URLs checked; ${plannedCount} planned URL(s) skipped; ${warnings.length} transient or access warning(s); no confirmed 404/410 responses.`,
  );
}
