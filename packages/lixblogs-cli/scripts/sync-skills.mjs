import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(packageRoot, '../..');
const sourceRoot = path.join(repositoryRoot, '.agents', 'skills');
const targetRoot = path.join(packageRoot, 'skills');

if (process.argv.includes('--clean')) {
  await rm(targetRoot, { recursive: true, force: true });
  process.exit(0);
}

const names = (await readdir(sourceRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith('lixblogs-'))
  .map((entry) => entry.name)
  .sort();

await rm(targetRoot, { recursive: true, force: true });
await mkdir(targetRoot, { recursive: true });
for (const name of names) {
  await cp(path.join(sourceRoot, name), path.join(targetRoot, name), { recursive: true });
}
process.stdout.write(`Bundled ${names.length} LixBlogs skills.\n`);
