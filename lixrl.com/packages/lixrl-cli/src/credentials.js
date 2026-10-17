const SERVICE = 'elixpo-lixrl-cli';

function validateKey(value) {
  const key = String(value || '').trim();
  if (!/^elu_[A-Za-z0-9_-]{20,}$/.test(key)) {
    const error = new Error('A valid Lixrl API key beginning with elu_ is required.');
    error.code = 'invalid_api_key';
    throw error;
  }
  return key;
}

export class CredentialStore {
  constructor({ keyringModule } = {}) {
    this.keyringModule = keyringModule;
  }

  async Entry(profile) {
    const module = this.keyringModule || await import('@napi-rs/keyring');
    return new module.Entry(SERVICE, profile);
  }

  async get(profile, env = process.env) {
    if (env.LIXRL_API_KEY) return validateKey(env.LIXRL_API_KEY);
    const entry = await this.Entry(profile);
    try {
      const value = entry.getPassword();
      return value ? validateKey(value) : null;
    } catch (error) {
      if (/not found|no such|nosuchitem|nosuchkeyring/i.test(String(error?.message || error))) return null;
      throw this.unavailable(error);
    }
  }

  async set(profile, key) {
    const entry = await this.Entry(profile);
    try {
      entry.setPassword(validateKey(key));
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  async delete(profile) {
    const entry = await this.Entry(profile);
    try {
      entry.deletePassword();
    } catch (error) {
      if (/not found|no such|nosuchitem|nosuchkeyring/i.test(String(error?.message || error))) return;
      throw this.unavailable(error);
    }
  }

  unavailable(error) {
    const wrapped = new Error('The OS keychain is unavailable. Configure Secret Service or use LIXRL_API_KEY for this process.');
    wrapped.code = 'keychain_unavailable';
    wrapped.cause = error;
    return wrapped;
  }
}

export { validateKey };
