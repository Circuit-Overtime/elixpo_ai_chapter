#!/usr/bin/env node

import { createLixSketchMcpServer } from './server.js';
import { FileSceneStore } from './fileStore.js';
import { MarketplaceTemplateProvider } from './templates.js';
import { serveLixSketchStdio } from './stdioTransport.js';
import { RemoteSceneStore } from './remoteStore.js';

function parseArguments(argv) {
  const options = { scene: process.env.LIXSKETCH_SCENE_FILE || './lixsketch-mcp.lixjson', remote: process.env.LIXSKETCH_REMOTE_URL || '', workspace: process.env.LIXSKETCH_WORKSPACE_ID || '', marketplaceUrl: process.env.LIXSKETCH_MARKETPLACE_URL || 'https://sketch.elixpo.com' };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--scene') options.scene = argv[++index];
    else if (argument === '--remote') options.remote = argv[++index];
    else if (argument === '--workspace') options.workspace = argv[++index];
    else if (argument === '--marketplace-url') options.marketplaceUrl = argv[++index];
    else if (argument === '--help' || argument === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.scene) throw new Error('--scene requires a file path');
  if (options.remote && !options.workspace) throw new Error('--remote requires --workspace or LIXSKETCH_WORKSPACE_ID');
  return options;
}

function printHelp() {
  process.stderr.write(`LixSketch MCP server\n\nUsage:\n  lixsketch-mcp --scene ./diagram.lixjson\n  lixsketch-mcp --remote https://sketch.elixpo.com --workspace lx-...\n\nOptions:\n  --scene <path>             Atomic local .lixjson scene file\n  --remote <origin>          Remote LixSketch deployment origin\n  --workspace <id>           Remote workspace session ID\n  --marketplace-url <url>    Template marketplace origin\n  -h, --help                 Show this help\n\nRemote environment (never pass secrets as arguments):\n  LIXSKETCH_AGENT_TOKEN\n  LIXSKETCH_ENCRYPTION_KEY\n\nOther environment:\n  LIXSKETCH_SCENE_FILE\n  LIXSKETCH_REMOTE_URL\n  LIXSKETCH_WORKSPACE_ID\n  LIXSKETCH_MARKETPLACE_URL\n`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { printHelp(); return; }
  const store = options.remote
    ? new RemoteSceneStore({ baseUrl: options.remote, workspaceId: options.workspace, token: process.env.LIXSKETCH_AGENT_TOKEN, encryptionKey: process.env.LIXSKETCH_ENCRYPTION_KEY })
    : new FileSceneStore(options.scene);
  const server = createLixSketchMcpServer({ store, templateProvider: new MarketplaceTemplateProvider({ baseUrl: options.marketplaceUrl }) });
  const transport = serveLixSketchStdio(server);
  const close = () => { void transport.close().finally(() => process.exit(0)); };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  process.stderr.write(`LixSketch MCP ready: ${store.filePath || `${options.remote}/c/${options.workspace}`}\n`);
  await transport.closed;
}

main().catch((error) => {
  process.stderr.write(`LixSketch MCP failed: ${error?.message || error}\n`);
  process.exitCode = 1;
});
