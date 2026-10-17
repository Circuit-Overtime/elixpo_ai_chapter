function requireConfigValue(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`)
  return value.trim()
}

export const MCP_CONNECTION_TEST_PROMPT = `Use the LixSketch MCP tools on my connected workspace.

1. Call canvas_get and report the workspace name, revision, and shape count.
2. Preserve every existing shape.
3. Use lixscript_apply with dryRun enabled to place a small lavender card in an empty area. Add the text "MCP connected" with readable contrast.
4. Call canvas_preview and check that the new card does not overlap existing content.
5. Apply the same change for real.
6. Call canvas_get again and confirm that the revision and shape count increased.

Stop and explain the error if any step fails. Do not replace or clear the canvas.`

function normalizedRemoteOrigin(origin) {
  const parsed = new URL(requireConfigValue(origin, 'Remote URL'))
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Remote URL must use HTTP or HTTPS')
  return parsed.origin
}

export function createMcpClientDefinition({ origin, sessionId, token, encryptionKey }) {
  return {
    command: 'npx',
    args: [
      '-y',
      '@elixpo/lixsketch@latest',
      '--remote',
      normalizedRemoteOrigin(origin),
      '--workspace',
      requireConfigValue(sessionId, 'Workspace ID'),
    ],
    env: {
      LIXSKETCH_AGENT_TOKEN: requireConfigValue(token, 'Agent token'),
      LIXSKETCH_ENCRYPTION_KEY: requireConfigValue(encryptionKey, 'Encryption key'),
    },
  }
}

export function createMcpJsonConfig(options) {
  return `${JSON.stringify({ mcpServers: { lixsketch: createMcpClientDefinition(options) } }, null, 2)}\n`
}

function tomlString(value) {
  return JSON.stringify(value)
}

export function createCodexTomlConfig(options) {
  const definition = createMcpClientDefinition(options)
  return [
    '[mcp_servers.lixsketch]',
    `command = ${tomlString(definition.command)}`,
    `args = [${definition.args.map(tomlString).join(', ')}]`,
    'startup_timeout_sec = 30',
    '',
    '[mcp_servers.lixsketch.env]',
    `LIXSKETCH_AGENT_TOKEN = ${tomlString(definition.env.LIXSKETCH_AGENT_TOKEN)}`,
    `LIXSKETCH_ENCRYPTION_KEY = ${tomlString(definition.env.LIXSKETCH_ENCRYPTION_KEY)}`,
    '',
  ].join('\n')
}

export function codexConfigFromMcpJson(jsonConfig) {
  const parsed = JSON.parse(jsonConfig)
  const definition = parsed?.mcpServers?.lixsketch
  if (!definition?.command || !Array.isArray(definition.args) || !definition?.env) {
    throw new Error('Saved MCP configuration is invalid')
  }
  return [
    '[mcp_servers.lixsketch]',
    `command = ${tomlString(definition.command)}`,
    `args = [${definition.args.map(tomlString).join(', ')}]`,
    'startup_timeout_sec = 30',
    '',
    '[mcp_servers.lixsketch.env]',
    `LIXSKETCH_AGENT_TOKEN = ${tomlString(definition.env.LIXSKETCH_AGENT_TOKEN)}`,
    `LIXSKETCH_ENCRYPTION_KEY = ${tomlString(definition.env.LIXSKETCH_ENCRYPTION_KEY)}`,
    '',
  ].join('\n')
}
