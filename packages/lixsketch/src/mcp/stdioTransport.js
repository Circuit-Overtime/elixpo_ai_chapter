import { createInterface } from 'node:readline';

const MAX_MESSAGE_BYTES = 10 * 1024 * 1024;

export function serveLixSketchStdio(server, { input = process.stdin, output = process.stdout } = {}) {
  if (!server?.handleRequest) throw new Error('A LixSketch MCP server is required');
  const lines = createInterface({ input, crlfDelay: Infinity, terminal: false });
  let processing = Promise.resolve();
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  const send = (message) => output.write(`${JSON.stringify(message)}\n`);

  lines.on('line', (line) => {
    processing = processing.then(async () => {
      if (!line.trim()) return;
      if (Buffer.byteLength(line, 'utf8') > MAX_MESSAGE_BYTES) {
        send({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'MCP request exceeds the 10 MB limit' } });
        return;
      }
      let request;
      try { request = JSON.parse(line); }
      catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); return; }
      if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
        if (request.id !== undefined) send({ jsonrpc: '2.0', id: request.id ?? null, error: { code: -32600, message: 'Invalid Request' } });
        return;
      }
      try {
        const result = await server.handleRequest(request);
        if (request.id !== undefined && result !== undefined) send({ jsonrpc: '2.0', id: request.id, result });
      } catch (error) {
        if (request.id !== undefined) send({ jsonrpc: '2.0', id: request.id, error: { code: Number(error?.code) || -32603, message: error?.message || 'Internal error' } });
      }
    }).catch((error) => {
      process.stderr.write(`LixSketch MCP transport error: ${error?.message || error}\n`);
    });
  });
  lines.once('close', () => processing.finally(resolveClosed));

  return {
    closed,
    close: async () => {
      lines.close();
      await processing;
    },
  };
}
