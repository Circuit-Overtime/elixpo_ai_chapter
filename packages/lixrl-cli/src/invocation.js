import { EXIT_CODES } from './contract.js';

const URL_COMMANDS = new Set(['url', 'urls', 'links']);
const KEY_COMMANDS = new Set(['key', 'keys']);
const DOMAIN_COMMANDS = new Set(['domain', 'domains', 'subdomains']);
const TOP_LEVEL_COMMANDS = new Set([
  'login', 'logout', 'whoami', 'profiles', 'use', 'skills', 'qr',
  ...URL_COMMANDS, ...KEY_COMMANDS, ...DOMAIN_COMMANDS,
]);

function usage(message, code = 'invalid_usage') {
  const exitCode = code === 'confirmation_required' ? EXIT_CODES.CONFIRMATION : EXIT_CODES.USAGE;
  throw Object.assign(new Error(message), { code, exitCode });
}

function requireValue(value, message) {
  if (!value) usage(message);
}

function requireConfirmation(options, message) {
  if (!options.yes) usage(message, 'confirmation_required');
}

function validateUrls(action, args, options) {
  const resourceActions = new Set(['get', 'delete', 'enable', 'disable', 'analytics', 'export-clicks']);
  if (action === 'list' || action === 'export') return;
  if (action === 'create') return requireValue(args[0], 'Usage: lixrl urls create <destination> [options]');
  if (resourceActions.has(action)) {
    requireValue(args[0], `Usage: lixrl urls ${action} <code>${action === 'delete' ? ' --yes' : ''}`);
    if (action === 'delete') requireConfirmation(options, 'Deleting a link requires --yes.');
    return;
  }
  if (action === 'update') {
    requireValue(args[0], 'Usage: lixrl urls update <code> [options]');
    const fields = [
      options.destination, options.title, options['clear-title'], options.campaign,
      options['clear-campaign'], options.tag?.length, options['clear-tags'],
      options.expires, options['clear-expiry'],
    ];
    if (!fields.some(Boolean)) usage('Provide at least one field to update.');
    return;
  }
  if (action === 'bulk-create') return requireValue(options.file, 'Usage: lixrl urls bulk-create --file <links.json>');
  if (action === 'bulk-delete') {
    requireValue(args[0], 'Usage: lixrl urls bulk-delete <code...> --yes');
    requireConfirmation(options, 'Bulk deletion requires --yes.');
    return;
  }
  usage('Usage: lixrl urls <list|get|create|update|enable|disable|delete|bulk-create|bulk-delete|analytics|export|export-clicks>');
}

function validateKeys(action, args, options) {
  if (action === 'list') return;
  if (action === 'create') return requireValue(options.name, 'Usage: lixrl keys create --name <name> [--scopes read|read,write]');
  if (action === 'revoke') {
    requireValue(args[0], 'Usage: lixrl keys revoke <id> --yes');
    requireConfirmation(options, 'Revoking an API key requires --yes.');
    return;
  }
  usage('Usage: lixrl keys <list|create|revoke>');
}

function validateDomains(action, args, options) {
  if (action === 'list') return;
  if (['claim', 'verify', 'default', 'remove', 'links'].includes(action)) {
    requireValue(args[0], `Usage: lixrl domains ${action} <id>${action === 'remove' ? ' --yes' : ''}`);
    if (action === 'remove') requireConfirmation(options, 'Removing a subdomain requires --yes.');
    return;
  }
  if (action === 'map' || action === 'unmap') {
    requireValue(args[0], `Usage: lixrl domains ${action} <id> <url-code>${action === 'unmap' ? ' --yes' : ''}`);
    requireValue(args[1], `Usage: lixrl domains ${action} <id> <url-code>${action === 'unmap' ? ' --yes' : ''}`);
    if (action === 'unmap') requireConfirmation(options, 'Removing a subdomain link mapping requires --yes.');
    return;
  }
  usage('Usage: lixrl domains <list|claim|verify|default|remove|links|map|unmap>');
}

export function validateInvocation(command, subcommand, args = [], options = {}) {
  if (!TOP_LEVEL_COMMANDS.has(command)) {
    usage(`Unknown command "${command}". Run lixrl --help.`, 'unknown_command');
  }
  if (URL_COMMANDS.has(command)) return validateUrls(subcommand, args, options);
  if (KEY_COMMANDS.has(command)) return validateKeys(subcommand, args, options);
  if (DOMAIN_COMMANDS.has(command)) return validateDomains(subcommand, args, options);
  if (command === 'qr') return requireValue(subcommand, 'Usage: lixrl qr <destination> [options]');
  if (command === 'login') {
    if (options.key && options['new-key']) usage('Choose either --key or --new-key, not both.');
    if (subcommand || args.length) usage('Usage: lixrl login [--key | --new-key] [--profile <name>]');
    return;
  }
  if (command === 'use') {
    requireValue(subcommand, 'Usage: lixrl use <profile>');
    if (args.length) usage('Usage: lixrl use <profile>');
    return;
  }
  if (command === 'skills') {
    if (subcommand === 'list') return;
    if (subcommand === 'inspect' || subcommand === 'install') {
      return requireValue(args[0], `Usage: lixrl skills ${subcommand} <name>`);
    }
    usage('Usage: lixrl skills <list|inspect|install> [name]');
  }
  if (subcommand || args.length) usage(`Usage: lixrl ${command}`);
}
