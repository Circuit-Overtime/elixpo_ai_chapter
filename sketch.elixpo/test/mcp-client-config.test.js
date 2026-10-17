import assert from 'node:assert/strict'
import test from 'node:test'
import {
  codexConfigFromMcpJson,
  createCodexTomlConfig,
  createMcpJsonConfig,
} from '../src/lib/mcpClientConfig.js'

const options = {
  origin: 'https://sketch.elixpo.com/profile?tab=workspaces',
  sessionId: 'lx-example',
  token: 'lixmcp_test-token',
  encryptionKey: 'test_encryption-key',
}

test('creates valid plain MCP JSON with credentials', () => {
  const config = createMcpJsonConfig(options)
  const parsed = JSON.parse(config)
  const server = parsed.mcpServers.lixsketch

  assert.deepEqual(server.args, [
    '-y',
    '@elixpo/lixsketch@latest',
    '--remote',
    'https://sketch.elixpo.com',
    '--workspace',
    'lx-example',
  ])
  assert.equal(server.env.LIXSKETCH_AGENT_TOKEN, options.token)
  assert.equal(server.env.LIXSKETCH_ENCRYPTION_KEY, options.encryptionKey)
  assert.doesNotMatch(config, /\[https?:|LIXSKETCH\\_/)
})

test('creates Codex TOML directly and from saved MCP JSON', () => {
  const direct = createCodexTomlConfig(options)
  const recovered = codexConfigFromMcpJson(createMcpJsonConfig(options))

  assert.equal(recovered, direct)
  assert.match(direct, /^\[mcp_servers\.lixsketch\]/)
  assert.match(direct, /startup_timeout_sec = 30/)
  assert.match(direct, /\[mcp_servers\.lixsketch\.env\]/)
  assert.match(direct, /LIXSKETCH_AGENT_TOKEN = "lixmcp_test-token"/)
  assert.match(direct, /LIXSKETCH_ENCRYPTION_KEY = "test_encryption-key"/)
})
