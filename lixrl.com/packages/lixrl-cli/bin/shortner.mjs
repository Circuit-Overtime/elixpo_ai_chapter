#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';
import { resolveConfig, ProfileRegistry, validateProfile } from '../src/config.js';
import { CredentialStore, validateKey } from '../src/credentials.js';
import { LixrlClient } from '../src/client.js';
import { findValidLocalLogin } from '../src/login.js';
import { validateInvocation } from '../src/invocation.js';
import { emit, fail, EXIT_CODES } from '../src/contract.js';
import {
  approvalChallenge,
  colorEnabled,
  listenForEnter,
  loginChallenge,
  openBrowser,
  promptConfirm,
  promptEnter,
  promptLoginMethod,
  promptSecret,
  successLine,
  withSpinner,
} from '../src/ui.js';
import { runDomains, runKeys, runUrls } from '../src/commands.js';
import { qrRequiresLogin, runQr, validateQrInvocation } from '../src/qr.js';
import { runSkills } from '../src/skills.js';
import {
  AccountsDeviceAuth,
  fetchLixrlCliConfig,
  startLixrlAuthorization,
  waitForDeviceApproval,
  waitForLixrlApproval,
} from '../src/device-auth.js';

const require = createRequire(import.meta.url);
const VERSION = require('../package.json').version;

function withLoadingClient(client, message, loading) {
  return {
    request: (...args) => loading(message, () => client.request(...args)),
    me: () => loading(message, () => client.me()),
  };
}

const OPTIONS = {
  profile: { type: 'string' },
  'api-url': { type: 'string' },
  json: { type: 'boolean', default: false },
  quiet: { type: 'boolean', default: false },
  'no-input': { type: 'boolean', default: false },
  open: { type: 'boolean', default: false },
  key: { type: 'boolean', default: false },
  'new-key': { type: 'boolean', default: false },
  'accounts-url': { type: 'string' },
  'client-id': { type: 'string' },
  yes: { type: 'boolean', short: 'y', default: false },
  force: { type: 'boolean', default: false },
  limit: { type: 'string' },
  offset: { type: 'string' },
  search: { type: 'string' },
  destination: { type: 'string' },
  slug: { type: 'string' },
  title: { type: 'string' },
  'clear-title': { type: 'boolean', default: false },
  campaign: { type: 'string' },
  'clear-campaign': { type: 'boolean', default: false },
  tag: { type: 'string', multiple: true },
  'clear-tags': { type: 'boolean', default: false },
  expires: { type: 'string' },
  'clear-expiry': { type: 'boolean', default: false },
  'utm-source': { type: 'string' },
  'utm-medium': { type: 'string' },
  'utm-campaign': { type: 'string' },
  'utm-term': { type: 'string' },
  'utm-content': { type: 'string' },
  days: { type: 'string' },
  file: { type: 'string' },
  output: { type: 'string', short: 'o' },
  name: { type: 'string' },
  scopes: { type: 'string' },
  format: { type: 'string' },
  style: { type: 'string' },
  size: { type: 'string' },
  logo: { type: 'string' },
  track: { type: 'boolean', default: false },
  target: { type: 'string' },
  help: { type: 'boolean', short: 'h', default: false },
  version: { type: 'boolean', short: 'v', default: false },
};

const HELP = `lixrl — production CLI for Lixrl

Usage:
  lixrl login [--profile <name>] [--open]
  lixrl login --new-key [--profile <name>] [--open]
  lixrl login --key [--profile <name>] [--open]
  lixrl logout [--profile <name>] --yes
  lixrl whoami [--profile <name>] [--json]
  lixrl profiles [--json]
  lixrl use <profile> [--json]
  lixrl urls list [--limit 50] [--search <text>]
  lixrl urls create <destination> [--slug <code>] [--title <title>]
  lixrl urls get|delete|enable|disable|analytics <code>
  lixrl urls update <code> [--destination <url>] [--title <title>]
  lixrl urls bulk-create --file <links.json>
  lixrl urls bulk-delete <code...> --yes
  lixrl urls export [--output <file.csv>]
  lixrl urls export-clicks <code> [--output <file.csv>]
  lixrl keys list|create|revoke
  lixrl domains list|claim|verify|default|remove|links|map|unmap
  lixrl qr <destination> [--format svg|png|jpg] [--style rounded]
  lixrl qr <destination> --track [--title <title>]
  lixrl skills list|inspect|install [name]

Authentication:
  lixrl login reuses a valid local key or asks whether to create a new key with
  Elixpo Accounts or paste an existing key. CI should provide LIXRL_API_KEY.

Global flags:
  --profile <name>    select a stored account
  --api-url <url>     API origin (default: https://lixrl.com)
  --open              open the Accounts approval page during device login
  --key               paste an existing Lixrl API key instead of device login
  --new-key           create a new key even when a valid local key exists
  --force             rotate a valid local login instead of reusing it
  --json              stable machine-readable output
  --no-input          never prompt
  --quiet             suppress ordinary output
  --yes, -y           confirm destructive operations
  --help, -h          show help
  --version, -v       show version
`;

async function main(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    throw Object.assign(new Error(error?.message || 'Invalid command options.'), {
      code: 'invalid_usage',
      exitCode: EXIT_CODES.USAGE,
    });
  }
  const options = parsed.values;
  const [command, subcommand, ...args] = parsed.positionals;
  if (options.version) return process.stdout.write(`${VERSION}\n`);
  if (options.help || !command) return process.stdout.write(HELP);
  validateInvocation(command, subcommand, args, options);
  if (command === 'qr') validateQrInvocation(subcommand, options);
  const loading = (message, task) => withSpinner(message, task, options);

  const config = resolveConfig({ options });
  const registry = new ProfileRegistry();
  const credentials = new CredentialStore();
  const profile = options.profile ? validateProfile(options.profile) : await registry.selected(config.profile);

  if (command === 'login') {
    let directKeyLogin = options.key || (!options['new-key'] && Boolean(process.env.LIXRL_API_KEY));
    let key;
    let user;
    const existing = await loading('Checking local profile', () => findValidLocalLogin({
      credentials,
      profile,
      apiUrl: config.apiUrl,
      force: options.force || options['new-key'],
      directKeyLogin,
    }));
    if (existing) {
      user = existing.user;
      const loginResult = {
        profile,
        reused: true,
        user: { email: user.email, display_name: user.display_name, tier: user.tier },
      };
      if (options.json) return emit(loginResult, options);
      if (!options.quiet) {
        process.stdout.write(`${successLine(`Already logged in as ${user.email} (${profile}).`, colorEnabled(process.stdout))}\n`);
        process.stdout.write('  Use `lixrl login --force` only when you want to rotate this key.\n');
      }
      return undefined;
    }

    if (options['no-input'] && !directKeyLogin) {
      throw Object.assign(new Error('Device login is interactive. Use lixrl login or provide LIXRL_API_KEY for --no-input.'), { code: 'login_required', exitCode: EXIT_CODES.AUTH });
    }

    if (!directKeyLogin && !options['new-key'] && process.stdin.isTTY && process.stderr.isTTY) {
      directKeyLogin = await promptLoginMethod() === 'existing';
    }

    if (directKeyLogin) {
      if (options.open) openBrowser(`${config.apiUrl}/profile/keys`);
      key = validateKey(process.env.LIXRL_API_KEY || await promptSecret('Paste Lixrl API key: '));
      user = await loading('Verifying API key', () => (
        new LixrlClient({ apiUrl: config.apiUrl, apiKey: key }).me()
      ));
    } else {
      const progress = !options.quiet && !options.json;
      const color = colorEnabled(process.stderr);
      const deviceConfig = await loading('Connecting to Lixrl', () => (
        fetchLixrlCliConfig({ apiUrl: config.apiUrl })
      ));
      const auth = new AccountsDeviceAuth({
        accountsUrl: options['accounts-url'] || deviceConfig.accountsUrl,
        clientId: options['client-id'] || deviceConfig.clientId,
        audience: deviceConfig.audience,
      });
      const challenge = await loading('Starting device login', () => auth.requestDeviceCode());
      const approvalUrl = challenge.verificationUriComplete || challenge.verificationUri;
      if (progress) process.stderr.write(`${loginChallenge({
        url: approvalUrl,
        code: challenge.userCode,
        expiresInSeconds: challenge.expiresInSeconds,
        profile,
        interactive: process.stdin.isTTY && !options.open,
        color,
      })}\n`);
      let stopListening = () => {};
      if (options.open) openBrowser(approvalUrl);
      else if (progress && process.stdin.isTTY) {
        stopListening = listenForEnter({ open: openBrowser, url: approvalUrl });
      }
      let token;
      try {
        token = await loading('Waiting for browser approval', () => waitForDeviceApproval(auth, challenge));
      } finally {
        stopListening();
      }
      let authorization;
      try {
        const startAuthorization = () => loading('Preparing key approval', () => (
          startLixrlAuthorization({
            apiUrl: config.apiUrl,
            accessToken: token.accessToken,
          })
        ));
        try {
          authorization = await startAuthorization();
        } catch (error) {
          const recoverable = ['api_key_limit_reached', 'key_limit_reached'].includes(error?.code);
          const interactive = !options.quiet && !options.json && !options['no-input'];
          if (!recoverable || !interactive) throw error;

          const manageUrl = error.details?.manage_url || `${config.apiUrl}/profile/keys`;
          if (!await promptConfirm('The CLI cannot revoke account keys itself. Open key settings in your browser?')) throw error;
          openBrowser(manageUrl);
          await promptEnter('Revoke an active key in the browser and wait until it shows “Revoked”. Then return here.');
          authorization = await startAuthorization();
        }
      } finally {
        await auth.revoke(token.refreshToken);
        await auth.revoke(token.accessToken);
      }
      if (progress) process.stderr.write(`${approvalChallenge({ url: authorization.approvalUrl, color })}\n`);
      if (options.open) openBrowser(authorization.approvalUrl);
      const result = await loading('Waiting for key approval', () => (
        waitForLixrlApproval(config.apiUrl, authorization)
      ));
      key = validateKey(result.key);
      user = result.user;
    }

    if (!process.env.LIXRL_API_KEY) {
      await loading('Saving credentials', () => credentials.set(profile, key));
    }
    await registry.add(profile);
    const loginResult = {
      profile,
      reused: false,
      user: { email: user.email, display_name: user.display_name, tier: user.tier },
    };
    if (options.json) return emit(loginResult, options);
    if (!options.quiet) {
      process.stdout.write(`${successLine(`Logged in as ${user.email} (${profile}).`, colorEnabled(process.stdout))}\n`);
      process.stdout.write('  Credentials saved securely in the OS keychain.\n');
    }
    return undefined;
  }

  if (command === 'profiles') {
    const state = await registry.read();
    return emit({ active: state.active, profiles: state.profiles }, options, 'Profiles loaded');
  }
  if (command === 'use') {
    if (!subcommand) throw Object.assign(new Error('Usage: lixrl use <profile>'), { exitCode: EXIT_CODES.USAGE });
    await registry.use(subcommand);
    return emit({ active: subcommand }, options, 'Active profile changed');
  }
  if (command === 'skills') return runSkills(subcommand, args, options);

  if (command === 'qr' && !qrRequiresLogin(options)) {
    return runQr(null, subcommand, options, (task) => loading('Generating QR code', task));
  }

  const key = await loading('Reading local credentials', () => credentials.get(profile));
  if (!key) throw Object.assign(new Error(`Profile "${profile}" is not logged in. Run lixrl login.`), { code: 'login_required', exitCode: EXIT_CODES.AUTH });

  if (command === 'logout') {
    if (!options.yes) throw Object.assign(new Error('Logging out requires --yes.'), { code: 'confirmation_required', exitCode: EXIT_CODES.CONFIRMATION });
    if (!process.env.LIXRL_API_KEY) await credentials.delete(profile);
    await registry.remove(profile);
    return emit({ loggedOut: true, profile }, options, 'Logged out');
  }
  if (command === 'whoami') {
    const user = await loading('Checking account', () => (
      new LixrlClient({ apiUrl: config.apiUrl, apiKey: key }).me()
    ));
    return emit({ profile, ...user }, options, 'Account verified');
  }
  const client = new LixrlClient({ apiUrl: config.apiUrl, apiKey: key });
  if (command === 'qr') {
    return runQr(
      withLoadingClient(client, options.track ? 'Creating tracked QR link' : 'Checking QR access', loading),
      subcommand,
      options,
      (task) => loading('Generating QR code', task),
    );
  }
  if (['url', 'urls', 'links'].includes(command)) {
    return runUrls(withLoadingClient(client, 'Working with links', loading), subcommand, args, options);
  }
  if (['key', 'keys'].includes(command)) {
    return runKeys(withLoadingClient(client, 'Working with API keys', loading), subcommand, args, options);
  }
  if (['domain', 'domains', 'subdomains'].includes(command)) {
    return runDomains(withLoadingClient(client, 'Working with subdomains', loading), subcommand, args, options);
  }

  throw Object.assign(new Error(`Unknown command: ${command}`), { code: 'unknown_command', exitCode: EXIT_CODES.USAGE });
}

main().catch((error) => fail(error, (() => {
  try { return parseArgs({ args: process.argv.slice(2), options: OPTIONS, allowPositionals: true, strict: false }).values; }
  catch { return {}; }
})()));
