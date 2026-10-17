// Generate an image asset from a prompt file via the Pollinations API.
//
// Usage:
//   node scripts/generate-asset.mjs <name>
//   node scripts/generate-asset.mjs all
//
// Each prompt lives in prompts/<name>.md with frontmatter:
//   ---
//   output: public/assets/.../foo.webp
//   width: 1024
//   height: 512
//   model: gptimage
//   quality: high
//   ---
//   <the prompt text>
//
// Reads POLLINATIONS_TOKEN from the environment (.env.local). Output is converted to WebP.

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const API = "https://gen.pollinations.ai/image";
const MEDIA_UPLOAD_API = "https://media.pollinations.ai/upload";
const PROMPTS_DIR = "prompts";
const PORTFOLIO_ORDER_FILE = "content/portfolio-order.json";
const MEMBER_PROMPT_NAME = "member-card-cover";
const UPLOAD_TIMEOUT_MS = 120_000;
const GENERATION_TIMEOUT_MS = 180_000;
const GENERATION_ATTEMPTS = 3;

function loadLocalEnv(file = ".env.local") {
  if (!fs.existsSync(file)) return;

  if (typeof process.loadEnvFile === "function") {
    process.loadEnvFile(file);
    return;
  }

  // Compatibility fallback for early Node 20 releases without process.loadEnvFile.
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;

    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadLocalEnv();

function parsePromptFile(file) {
  const raw = fs.readFileSync(file, "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing frontmatter block`);
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > -1) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, prompt: m[2].trim() };
}

async function generate(name, token) {
  const file = path.join(PROMPTS_DIR, name.endsWith(".md") ? name : `${name}.md`);
  if (!fs.existsSync(file)) throw new Error(`prompt file not found: ${file}`);

  const { meta, prompt } = parsePromptFile(file);
  if (meta.type === "member-cover-edit") {
    await generateMemberCovers(meta, prompt, token);
    return;
  }
  if (!meta.output) throw new Error(`${file}: 'output' missing in frontmatter`);

  const MAX = 768; // cap generation + output resolution
  const width = Math.min(parseInt(meta.width || "768", 10), MAX);
  const height = Math.min(parseInt(meta.height || "768", 10), MAX);
  const model = meta.model || "gptimage";

  const params = new URLSearchParams({
    model,
    width: String(width),
    height: String(height),
    seed: String(validSeed(meta.seed, stableSeed(name))),
    nologo: "true",
  });
  const url = `${API}/${encodeURIComponent(prompt)}?${params}`;

  process.stdout.write(`→ ${name} (${model}, ${width}x${height})... `);
  const buf = await requestImage(url, token, name);

  fs.mkdirSync(path.dirname(meta.output), { recursive: true });
  // Downscale to the capped size if the API returned larger, then encode by extension.
  const ext = path.extname(meta.output).toLowerCase();
  let pipeline = sharp(buf).resize(width, height, { fit: "cover", withoutEnlargement: true });
  if (ext === ".png") pipeline = pipeline.png({ compressionLevel: 9 });
  else if (ext === ".jpg" || ext === ".jpeg") pipeline = pipeline.jpeg({ quality: 82 });
  else pipeline = pipeline.webp({ quality: 72, effort: 6 });
  await pipeline.toFile(meta.output);
  const { size } = fs.statSync(meta.output);
  console.log(`saved ${meta.output} (${(size / 1024).toFixed(0)} KB)`);
}

function resolveMemberPath(template, slug) {
  return template.replaceAll("{slug}", slug);
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function sourceMimeType(format) {
  if (format === "webp") return "image/webp";
  if (format === "png") return "image/png";
  if (format === "avif") return "image/avif";
  return "image/jpeg";
}

function stableSeed(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  // Pollinations accepts signed-positive 32-bit seeds only (max 2^31 - 1).
  return (hash >>> 0) & 0x7fffffff;
}

function validSeed(value, fallback) {
  const seed = Number.parseInt(value, 10);
  return Number.isInteger(seed) && seed >= 0 && seed <= 0x7fffffff ? seed : fallback;
}

async function responseError(response) {
  const raw = await response.text();
  try {
    const data = JSON.parse(raw);
    const fields = data.error?.details?.fieldErrors;
    if (fields && Object.keys(fields).length > 0) {
      return `${data.error.message}: ${JSON.stringify(fields)}`;
    }
  } catch {
    // Fall back to the raw response when the API does not return JSON.
  }
  return raw.slice(0, 2_000);
}

async function uploadSourceImage(source, token) {
  const sourceBuffer = fs.readFileSync(source);
  const metadata = await sharp(sourceBuffer).metadata();
  const form = new FormData();
  form.append(
    "file",
    new Blob([sourceBuffer], { type: sourceMimeType(metadata.format) }),
    path.basename(source),
  );

  const response = await fetchWithTimeout(
    MEDIA_UPLOAD_API,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    },
    UPLOAD_TIMEOUT_MS,
  );
  if (!response.ok) {
    throw new Error(`media upload ${response.status}: ${await responseError(response)}`);
  }

  const data = await response.json();
  const mediaUrl = data.url || data.file?.url || data.data?.url;
  if (!mediaUrl) throw new Error("media upload returned no URL");
  return mediaUrl;
}

async function requestImage(url, token, slug) {
  for (let attempt = 1; attempt <= GENERATION_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        url,
        { headers: { Authorization: `Bearer ${token}` } },
        GENERATION_TIMEOUT_MS,
      );
      if (!response.ok) {
        const message = `${slug}: generation ${response.status}: ${await responseError(response)}`;
        if (attempt < GENERATION_ATTEMPTS && (response.status === 429 || response.status >= 500)) {
          console.warn(`\n  retry ${attempt}/${GENERATION_ATTEMPTS - 1}: ${message}`);
          continue;
        }
        throw new Error(message);
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) {
        throw new Error(`${slug}: expected an image, received ${contentType || "unknown content"}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      const timedOut = error.name === "AbortError";
      if (!timedOut || attempt === GENERATION_ATTEMPTS) throw error;
      // Pollinations continues generation after a timeout. Retrying this exact URL
      // (including its stable seed) reconnects to that job or its cached result.
      console.warn(`\n  retry ${attempt}/${GENERATION_ATTEMPTS - 1}: timed out, reconnecting to the same job`);
    }
  }

  throw new Error(`${slug}: generation failed after ${GENERATION_ATTEMPTS} attempts`);
}

async function generateMemberCovers(meta, prompt, token) {
  if (!meta.source || !meta.output) {
    throw new Error("member cover prompt requires 'source' and 'output' frontmatter");
  }

  const slugs = JSON.parse(fs.readFileSync(PORTFOLIO_ORDER_FILE, "utf8"));
  const width = Math.min(parseInt(meta.width || "768", 10), 768);
  const height = Math.min(parseInt(meta.height || "768", 10), 768);
  const model = meta.model || "gptimage";
  const force = process.env.FORCE_ASSET_GENERATION === "1";

  for (const slug of slugs) {
    const source = resolveMemberPath(meta.source, slug);
    const output = resolveMemberPath(meta.output, slug);
    if (!fs.existsSync(source)) {
      console.warn(`↷ ${slug}: source not found (${source})`);
      continue;
    }
    if (!force && fs.existsSync(output)) {
      console.log(`↷ ${slug}: output already exists (${output}); set FORCE_ASSET_GENERATION=1 to replace it`);
      continue;
    }

    process.stdout.write(`→ ${slug}: uploading source... `);
    const sourceUrl = await uploadSourceImage(source, token);
    console.log("uploaded");

    const params = new URLSearchParams({
      model,
      image: sourceUrl,
      width: String(width),
      height: String(height),
      seed: String(stableSeed(slug)),
      nologo: "true",
    });
    const editUrl = `${API}/${encodeURIComponent(prompt)}?${params}`;

    process.stdout.write(`  editing (${model}, ${width}x${height})... `);
    const editedImage = await requestImage(editUrl, token, slug);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    await sharp(editedImage)
      .resize(width, height, { fit: "cover", position: "centre" })
      .webp({ quality: 72, effort: 6 })
      .toFile(output);
    const { size } = fs.statSync(output);
    console.log(`saved ${output} (${(size / 1024).toFixed(0)} KB)`);
  }
}

async function main() {
  const token = process.env.POLLINATIONS_TOKEN || process.env.POLLINATIONS_API_KEY;
  if (!token) {
    console.error("Missing POLLINATIONS_TOKEN (or POLLINATIONS_API_KEY). Set it in .env.local or the shell environment.");
    process.exit(1);
  }

  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: node scripts/generate-asset.mjs <name|members|all>");
    process.exit(1);
  }

  const names =
    arg === "members"
      ? [MEMBER_PROMPT_NAME]
      : arg === "all"
      ? fs.readdirSync(PROMPTS_DIR)
          .filter((file) => file.endsWith(".md") && fs.readFileSync(path.join(PROMPTS_DIR, file), "utf8").startsWith("---\n"))
          .map((file) => file.replace(/\.md$/, ""))
      : [arg];

  for (const name of names) {
    try {
      await generate(name, token);
    } catch (err) {
      console.error(`✗ ${name}: ${err.message}`);
      if (arg !== "all") process.exit(1);
    }
  }
}

main();
