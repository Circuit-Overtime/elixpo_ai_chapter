import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.name === 'route.ts') {
      const source = await readFile(path, 'utf8');
      if (!source.includes("export const runtime = 'edge'")) {
        failures.push(`${path}: missing edge runtime export`);
      }
      if (/from ['"](?:node:)?(?:fs|path|crypto|stream|buffer)['"]/.test(source)) {
        failures.push(`${path}: imports a Node-only runtime module`);
      }
      if (/console\.log\([^\n]*(?:secret|token|payload)/i.test(source)) {
        failures.push(`${path}: may log credential material`);
      }
    }
  }
}

await walk(join(root, 'app', 'api'));

const migrationNames = (await readdir(join(root, 'workers', 'migrations')))
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();
for (let index = 0; index < migrationNames.length; index += 1) {
  const expected = String(index + 1).padStart(4, '0');
  if (!migrationNames[index].startsWith(`${expected}_`)) {
    failures.push(`migration sequence: expected ${expected}, found ${migrationNames[index]}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Checked API edge runtime and ${migrationNames.length} gapless migrations.`);
