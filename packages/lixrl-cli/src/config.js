import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_API_URL = 'https://lixrl.com';
const PROFILE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

export function validateProfile(value = 'default') {
  if (!PROFILE_PATTERN.test(value)) {
    const error = new Error('Profile names must be 1–64 letters, numbers, dots, hyphens, or underscores.');
    error.code = 'invalid_profile';
    throw error;
  }
  return value;
}

export function resolveConfig({ options = {}, env = process.env } = {}) {
  const apiUrl = new URL(options['api-url'] || env.LIXRL_API_URL || DEFAULT_API_URL);
  if (apiUrl.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(apiUrl.hostname)) {
    throw new Error('The Lixrl API must use HTTPS outside local development.');
  }
  apiUrl.pathname = apiUrl.pathname.replace(/\/$/, '');
  apiUrl.search = '';
  apiUrl.hash = '';
  return {
    apiUrl: apiUrl.toString().replace(/\/$/, ''),
    profile: validateProfile(options.profile || env.LIXRL_PROFILE || 'default'),
  };
}

function configFile(env = process.env) {
  const root = env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(root, 'elixpo', 'lixrl-cli', 'config.json');
}

export class ProfileRegistry {
  constructor({ file = configFile() } = {}) {
    this.file = file;
  }

  async read() {
    try {
      const value = JSON.parse(await readFile(this.file, 'utf8'));
      return {
        active: typeof value.active === 'string' ? value.active : null,
        profiles: Array.isArray(value.profiles) ? value.profiles.filter((item) => typeof item === 'string') : [],
      };
    } catch (error) {
      if (error?.code === 'ENOENT') return { active: null, profiles: [] };
      throw error;
    }
  }

  async write(value) {
    await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    await writeFile(this.file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  }

  async add(profile) {
    const value = await this.read();
    value.profiles = [...new Set([...value.profiles, validateProfile(profile)])].sort();
    value.active = profile;
    await this.write(value);
  }

  async remove(profile) {
    const value = await this.read();
    value.profiles = value.profiles.filter((item) => item !== profile);
    if (value.active === profile) value.active = value.profiles[0] || null;
    await this.write(value);
  }

  async use(profile) {
    const value = await this.read();
    validateProfile(profile);
    if (!value.profiles.includes(profile)) {
      const error = new Error(`Profile "${profile}" is not logged in.`);
      error.code = 'profile_not_found';
      throw error;
    }
    value.active = profile;
    await this.write(value);
  }

  async selected(fallback = 'default') {
    return (await this.read()).active || validateProfile(fallback);
  }
}
