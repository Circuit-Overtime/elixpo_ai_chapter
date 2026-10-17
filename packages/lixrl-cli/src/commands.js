import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { emit, EXIT_CODES, requireConfirmation } from './contract.js';

function usage(message) {
  throw Object.assign(new Error(message), { code: 'invalid_usage', exitCode: EXIT_CODES.USAGE });
}

function required(value, message) {
  if (!value) usage(message);
  return value;
}

function positive(value, fallback) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) usage(`Expected a non-negative integer, received "${value}".`);
  return number;
}

function query(path, values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}

function pathPart(value) {
  return encodeURIComponent(required(value, 'A resource identifier is required.'));
}

function urlInput(destination, options) {
  const body = {
    url: required(destination, 'Usage: lixrl urls create <destination> [options]'),
    ...(options.slug ? { custom_code: options.slug } : {}),
    ...(options.title ? { title: options.title } : {}),
    ...(options.expires ? { expires_at: options.expires } : {}),
    ...(options.campaign ? { campaign: options.campaign } : {}),
    ...(options.tag?.length ? { tags: options.tag } : {}),
  };
  const utm = Object.fromEntries(['source', 'medium', 'campaign', 'term', 'content']
    .map((key) => [key, options[`utm-${key}`]])
    .filter(([, value]) => value));
  if (Object.keys(utm).length) body.utm = utm;
  return body;
}

async function writeResponse(response, output, options, message) {
  const content = Buffer.from(await response.arrayBuffer());
  if (!output) {
    process.stdout.write(content);
    return;
  }
  if (existsSync(output) && !(options.force && options.yes)) {
    usage(`Refusing to overwrite ${output}. Pass --force --yes to replace it.`);
  }
  await writeFile(output, content);
  emit({ output, bytes: content.byteLength }, options, message);
}

export async function runUrls(client, action, args, options) {
  const code = args[0];
  switch (action) {
    case 'list':
      return emit(await client.request(query('/api/urls', {
        limit: positive(options.limit, 50), offset: positive(options.offset, 0), search: options.search,
      })), options, 'Links loaded');
    case 'get':
      return emit(await client.request(`/api/urls/${pathPart(code)}`), options, 'Link loaded');
    case 'create':
      return emit(await client.request('/api/urls', { method: 'POST', body: urlInput(code, options) }), options, 'Short link created');
    case 'update': {
      required(code, 'Usage: lixrl urls update <code> [options]');
      const body = {
        ...(options.destination ? { url: options.destination } : {}),
        ...(options.title ? { title: options.title } : {}),
        ...(options['clear-title'] ? { title: null } : {}),
        ...(options.campaign ? { campaign: options.campaign } : {}),
        ...(options['clear-campaign'] ? { campaign: null } : {}),
        ...(options.tag?.length ? { tags: options.tag } : {}),
        ...(options['clear-tags'] ? { tags: [] } : {}),
        ...(options.expires ? { expires_at: options.expires } : {}),
        ...(options['clear-expiry'] ? { expires_at: null } : {}),
      };
      if (!Object.keys(body).length) usage('Provide at least one field to update.');
      return emit(await client.request(`/api/urls/${pathPart(code)}`, { method: 'PATCH', body }), options, 'Link updated');
    }
    case 'enable':
    case 'disable':
      return emit(await client.request(`/api/urls/${pathPart(code)}`, {
        method: 'PATCH', body: { is_active: action === 'enable' },
      }), options, action === 'enable' ? 'Link enabled' : 'Link disabled');
    case 'delete':
      requireConfirmation(options, `Deleting ${required(code, 'Usage: lixrl urls delete <code> --yes')}`);
      return emit(await client.request(`/api/urls/${pathPart(code)}`, { method: 'DELETE' }), options, 'Link deleted');
    case 'bulk-create': { // JSON array or {"links": [...]}
      const file = required(options.file, 'Usage: lixrl urls bulk-create --file <links.json>');
      const input = JSON.parse(await readFile(file, 'utf8'));
      const links = Array.isArray(input) ? input : input.links;
      if (!Array.isArray(links)) usage('Bulk input must be an array or an object containing a links array.');
      return emit(await client.request('/api/urls/bulk-create', { method: 'POST', body: { links } }), options, 'Links created');
    }
    case 'bulk-delete':
      requireConfirmation(options, 'Bulk deletion');
      if (!args.length) usage('Usage: lixrl urls bulk-delete <code...> --yes');
      return emit(await client.request('/api/urls/bulk-delete', { method: 'POST', body: { codes: args } }), options, 'Links deleted');
    case 'analytics':
      return emit(await client.request(query(`/api/urls/${pathPart(code)}/analytics`, { days: positive(options.days, 7) })), options, 'Analytics loaded');
    case 'export': {
      const response = await client.request('/api/urls/export.csv', { raw: true });
      return writeResponse(response, options.output, options, 'Links exported');
    }
    case 'export-clicks': {
      const response = await client.request(`/api/urls/${pathPart(code)}/clicks.csv`, { raw: true });
      return writeResponse(response, options.output, options, 'Clicks exported');
    }
    default:
      usage('Usage: lixrl urls <list|get|create|update|enable|disable|delete|bulk-create|bulk-delete|analytics|export|export-clicks>');
  }
}

export async function runKeys(client, action, args, options) {
  switch (action) {
    case 'list':
      return emit(await client.request('/api/keys'), options, 'API keys loaded');
    case 'create':
      return emit(await client.request('/api/keys', {
        method: 'POST',
        body: {
          name: required(options.name, 'Usage: lixrl keys create --name <name> [--scopes read|read,write]'),
          scopes: options.scopes || 'read,write',
          ...(options.expires ? { expires_at: options.expires } : {}),
        },
      }), options, 'API key created');
    case 'revoke':
      requireConfirmation(options, 'Revoking an API key');
      return emit(await client.request(`/api/keys/${pathPart(args[0])}`, { method: 'DELETE' }), options, 'API key revoked');
    default:
      usage('Usage: lixrl keys <list|create|revoke>');
  }
}

export async function runDomains(client, action, args, options) {
  const id = args[0];
  switch (action) {
    case 'list':
      return emit(await client.request('/api/subdomains'), options, 'Subdomains loaded');
    case 'claim':
      return emit(await client.request('/api/subdomains', {
        method: 'POST', body: { label: required(id, 'Usage: lixrl domains claim <label>') },
      }), options, 'Subdomain claimed');
    case 'verify':
      return emit(await client.request(`/api/subdomains/${pathPart(id)}/verify`, { method: 'POST', body: {} }), options, 'Subdomain verified');
    case 'default':
      return emit(await client.request(`/api/subdomains/${pathPart(id)}`, { method: 'PATCH', body: { is_default: true } }), options, 'Default subdomain changed');
    case 'remove':
      requireConfirmation(options, 'Removing a subdomain');
      return emit(await client.request(`/api/subdomains/${pathPart(id)}`, { method: 'DELETE' }), options, 'Subdomain removed');
    case 'links':
      return emit(await client.request(`/api/subdomains/${pathPart(id)}/links`), options, 'Subdomain links loaded');
    case 'map':
      return emit(await client.request(`/api/subdomains/${pathPart(id)}/links`, {
        method: 'POST',
        body: {
          url_code: required(args[1], 'Usage: lixrl domains map <id> <url-code> [--slug <branded-code>]'),
          ...(options.slug ? { short_code: options.slug } : {}),
        },
      }), options, 'Link mapped');
    case 'unmap':
      requireConfirmation(options, 'Removing a subdomain link mapping');
      return emit(await client.request(`/api/subdomains/${pathPart(id)}/links/${pathPart(args[1])}`, { method: 'DELETE' }), options, 'Link mapping removed');
    default:
      usage('Usage: lixrl domains <list|claim|verify|default|remove|links|map|unmap>');
  }
}
