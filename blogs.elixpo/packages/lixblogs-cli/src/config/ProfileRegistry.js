/**
 * ProfileRegistry — tracks which profile IDs the user has ever logged into,
 * so the CLI can support `lixblogs auth status` (no profile given, meaning
 * "show me all of them") and profile-switching commands.
 *
 * This deliberately stores NOTHING sensitive — just profile names/IDs, not
 * tokens. It's fine for this to live in a plain config file on disk (not
 * the keychain), since profile *names* aren't a secret; only the
 * credentials tied to them are, and those live in CredentialStore.
 *
 * Rationale for why this exists at all: OS keychains generally don't
 * support "list all entries for this service" without extra permissions
 * (see KeychainCredentialStore.listProfiles, which explicitly throws and
 * points here instead). This registry is what makes listing/switching
 * profiles possible without asking the OS keychain to do something most
 * platforms don't reliably support.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

function defaultRegistryPath() {
  return path.join(os.homedir(), ".config", "lixblogs", "profiles.json");
}

export class ProfileRegistry {
  /** @param {string} [registryPath] */
  constructor(registryPath = defaultRegistryPath()) {
    this._path = registryPath;
  }

  /** @returns {Promise<string[]>} */
  async list() {
    return (await this._read()).profiles;
  }

  async getActive() {
    const data = await this._read();
    return data.activeProfile && data.profiles.includes(data.activeProfile)
      ? data.activeProfile
      : data.profiles[0] || null;
  }

  async setActive(profileId) {
    validateProfileId(profileId);
    const data = await this._read();
    if (!data.profiles.includes(profileId)) {
      throw new Error(`Profile "${profileId}" does not exist. Log in with it first.`);
    }
    await this._write(data.profiles, profileId);
  }

  async _read() {
    try {
      const raw = await fs.readFile(this._path, "utf8");
      const data = JSON.parse(raw);
      const profiles = Array.isArray(data.profiles)
        ? data.profiles.filter((profile) => typeof profile === "string")
        : [];
      return {
        profiles,
        activeProfile: typeof data.activeProfile === "string" ? data.activeProfile : null,
      };
    } catch (err) {
      if (err.code === "ENOENT") return { profiles: [], activeProfile: null };
      throw err;
    }
  }

  /** @param {string} profileId */
  async add(profileId) {
    validateProfileId(profileId);
    const data = await this._read();
    const profiles = new Set(data.profiles);
    profiles.add(profileId);
    await this._write([...profiles], data.activeProfile || profileId);
  }

  /** @param {string} profileId */
  async remove(profileId) {
    const data = await this._read();
    const profiles = data.profiles.filter((id) => id !== profileId);
    const activeProfile = data.activeProfile === profileId ? profiles[0] || null : data.activeProfile;
    await this._write(profiles, activeProfile);
  }

  async _write(profiles, activeProfile = null) {
    await fs.mkdir(path.dirname(this._path), { recursive: true });
    const temporaryPath = `${this._path}.${process.pid}.tmp`;
    await fs.writeFile(
      temporaryPath,
      JSON.stringify({ activeProfile, profiles }, null, 2),
      { encoding: "utf8", mode: 0o600 },
    );
    await fs.rename(temporaryPath, this._path);
  }
}

export function validateProfileId(profileId) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(profileId || "")) {
    throw new Error("Profile names must be 1-64 characters using letters, numbers, dot, dash, or underscore.");
  }
  return profileId;
}
