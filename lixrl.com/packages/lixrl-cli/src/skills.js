import { cp, mkdir, readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emit, EXIT_CODES } from './contract.js';

const bundled = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../skills');

export async function runSkills(action, args, options) {
  const names = (await readdir(bundled, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  if (action === 'list') return emit({ skills: names }, options, 'Bundled skills loaded');
  const name = args[0];
  if (!name || !names.includes(name)) {
    throw Object.assign(new Error(`Choose a bundled skill: ${names.join(', ')}.`), { code: 'invalid_skill', exitCode: EXIT_CODES.USAGE });
  }
  if (action === 'inspect') {
    const content = await readFile(path.join(bundled, name, 'SKILL.md'), 'utf8');
    if (options.json) return emit({ name, content }, options);
    process.stdout.write(content);
    return;
  }
  if (action === 'install') {
    const root = options.target || path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'skills');
    const target = path.join(root, name);
    if (existsSync(target) && !(options.force && options.yes)) {
      throw Object.assign(new Error(`Refusing to replace ${target}. Pass --force --yes to update it.`), {
        code: 'confirmation_required', exitCode: 5,
      });
    }
    await mkdir(root, { recursive: true });
    await cp(path.join(bundled, name), target, { recursive: true, force: true });
    return emit({ installed: name, target }, options, 'Skill installed');
  }
  throw Object.assign(new Error('Usage: lixrl skills <list|inspect|install> [name]'), { exitCode: EXIT_CODES.USAGE });
}
