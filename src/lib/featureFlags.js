// Remote workspace MCP is still under validation. Keep local development
// available for testing, but do not expose grants or remote edits in a
// production deployment until the integration is explicitly released.
export const REMOTE_MCP_ENABLED = process.env.NODE_ENV !== 'production'

