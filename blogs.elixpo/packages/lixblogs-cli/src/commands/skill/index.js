import { access, cp, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireConfirmation } from '../../cli/contract.js';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
// Source commands live at src/commands/skill; the published executable lives
// at dist/. Supporting both keeps source-level tests and the bundled CLI on
// the same implementation without embedding an installation path at build time.
const packageRoot = path.basename(moduleDirectory) === 'dist'
  ? path.resolve(moduleDirectory, '..')
  : path.resolve(moduleDirectory, '../../..');
const bundledRoot = path.join(packageRoot, 'skills');
const developmentRoot = path.resolve(packageRoot, '../..', '.agents', 'skills');

async function exists(candidate) {
  try { await access(candidate); return true; } catch { return false; }
}

async function root() {
  if (await exists(bundledRoot)) return bundledRoot;
  if (await exists(developmentRoot)) return developmentRoot;
  const error = new Error('No bundled LixBlogs skills were found. Reinstall @elixpo/lixblogs-cli.');
  error.code = 'skills_unavailable';
  throw error;
}

function validateName(name) {
  if (!/^lixblogs-[a-z0-9-]+$/.test(name || '')) {
    const error = new Error('A valid lixblogs-* skill name is required.');
    error.code = 'invalid_skill_name';
    throw error;
  }
  return name;
}

async function metadata(directory, name) {
  const content = await readFile(path.join(directory, name, 'SKILL.md'), 'utf8');
  const description = content.match(/^description:\s*(.+)$/m)?.[1] || content.match(/^description:\s*>-\s*\n\s*(.+)$/m)?.[1] || '';
  const minimumCliVersion = content.match(/`@elixpo\/lixblogs-cli`\s+([0-9.]+)/)?.[1] || null;
  return { name, description: description.trim(), minimumCliVersion, content };
}

export async function skillList() {
  const directory = await root();
  const entries = await readdir(directory, { withFileTypes: true });
  return Promise.all(entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('lixblogs-'))
    .map((entry) => metadata(directory, entry.name))
  ).then((skills) => skills.map(({ content: _content, ...skill }) => skill).sort((a, b) => a.name.localeCompare(b.name)));
}

export async function skillInspect({ name }) {
  const directory = await root();
  const skillName = validateName(name);
  if (!(await exists(path.join(directory, skillName, 'SKILL.md')))) {
    const error = new Error(`Skill "${skillName}" is not bundled.`);
    error.code = 'skill_not_found';
    throw error;
  }
  return metadata(directory, skillName);
}

export async function skillInstall({ name, options }) {
  const directory = await root();
  const skillName = validateName(name);
  const source = path.join(directory, skillName);
  if (!(await exists(path.join(source, 'SKILL.md')))) {
    const error = new Error(`Skill "${skillName}" is not bundled.`);
    error.code = 'skill_not_found';
    throw error;
  }
  const targetRoot = path.resolve(options.target || '.agents/skills');
  const target = path.join(targetRoot, skillName);
  if (options['dry-run']) return { dryRun: true, name: skillName, target, replace: await exists(target) };
  if (await exists(target)) {
    if (!options.force) {
      const error = new Error(`Skill already exists at ${target}.`);
      error.code = 'skill_exists';
      error.hint = 'Inspect the existing skill or re-run with --force --yes to replace it.';
      throw error;
    }
    requireConfirmation(options, `Replacing ${target}`);
  } else {
    requireConfirmation(options, `Installing ${skillName} into ${targetRoot}`);
  }
  await cp(source, target, { recursive: true, force: Boolean(options.force) });
  return { installed: true, name: skillName, target };
}

export async function skillInstallAll({ options }) {
  const directory = await root();
  const skills = await skillList();
  const targetRoot = path.resolve(options.target || '.agents/skills');
  const targets = await Promise.all(skills.map(async ({ name }) => {
    const target = path.join(targetRoot, name);
    return { name, target, replace: await exists(target) };
  }));

  if (options['dry-run']) return { dryRun: true, all: true, targetRoot, skills: targets };
  const existing = targets.filter(({ replace }) => replace);
  if (existing.length && !options.force) {
    const error = new Error(`Skills already exist: ${existing.map(({ name }) => name).join(', ')}.`);
    error.code = 'skill_exists';
    error.hint = 'Inspect the existing skills or re-run with --all --force --yes to replace the complete set.';
    throw error;
  }

  requireConfirmation(options, `${existing.length ? 'Replacing' : 'Installing'} all LixBlogs skills in ${targetRoot}`);
  await Promise.all(targets.map(({ name, target }) =>
    cp(path.join(directory, name), target, { recursive: true, force: Boolean(options.force) })
  ));
  return { installed: true, all: true, targetRoot, skills: targets.map(({ name, target }) => ({ name, target })) };
}
