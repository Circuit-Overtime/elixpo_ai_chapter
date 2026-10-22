import { applyScenePatch, createEmptyScene, getSceneSummary, mergeTemplateScene, validateScene, MCP_LIMITS } from './scene.js';
import { MarketplaceTemplateProvider } from './templates.js';
import { renderSceneSvg } from './preview.js';
import { compileLixScript } from './lixscript.js';

const SERVER_NAME = 'lixsketch';
const SERVER_VERSION = '1.1.0';
const PROTOCOL_VERSION = '2025-11-25';
const SUPPORTED_PROTOCOL_VERSIONS = new Set([PROTOCOL_VERSION, '2025-06-18', '2024-11-05']);

const PATCH_OPERATION_SCHEMA = {
  oneOf: [
    { type: 'object', required: ['op', 'shape'], properties: { op: { const: 'add' }, shape: { type: 'object', description: 'A rectangle, circle, line, arrow, frame, freehandStroke, or text shape.' } } },
    { type: 'object', required: ['op', 'shapeID', 'changes'], properties: { op: { const: 'update' }, shapeID: { type: 'string' }, changes: { type: 'object' } } },
    { type: 'object', required: ['op'], properties: { op: { const: 'delete' }, shapeID: { type: 'string' }, shapeIDs: { type: 'array', items: { type: 'string' } } } },
    { type: 'object', required: ['op', 'shapeIDs', 'dx', 'dy'], properties: { op: { const: 'translate' }, shapeIDs: { type: 'array', items: { type: 'string' } }, dx: { type: 'number' }, dy: { type: 'number' } } },
    { type: 'object', required: ['op', 'name'], properties: { op: { const: 'rename_canvas' }, name: { type: 'string', maxLength: 72 } } },
  ],
};

export const LIXSKETCH_MCP_TOOLS = Object.freeze([
  {
    name: 'canvas_get',
    title: 'Read LixSketch canvas',
    description: 'Return the canvas summary and optionally its editable scene shapes. Read this before mutation to obtain the current revision.',
    inputSchema: { type: 'object', properties: { includeShapes: { type: 'boolean', default: false }, shapeIDs: { type: 'array', maxItems: 500, items: { type: 'string' } } }, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'canvas_apply_patch',
    title: 'Apply atomic canvas patch',
    description: `Atomically add, update, translate, or delete shapes. Supports ${MCP_LIMITS.maxOperations} operations per call, optimistic revision checks, and dry runs.`,
    inputSchema: { type: 'object', required: ['operations'], properties: { expectedRevision: { type: 'integer', minimum: 0 }, dryRun: { type: 'boolean', default: false }, operations: { type: 'array', minItems: 1, maxItems: MCP_LIMITS.maxOperations, items: PATCH_OPERATION_SCHEMA } }, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  },
  {
    name: 'canvas_validate',
    title: 'Validate LixSketch canvas',
    description: 'Validate the current scene format, supported shapes, unique IDs, and package limits.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'canvas_preview',
    title: 'Render canvas preview',
    description: 'Render a lightweight SVG preview of the current scene for visual inspection before or after edits.',
    inputSchema: { type: 'object', properties: { background: { type: 'string', pattern: '^#[0-9a-fA-F]{3,8}$' }, padding: { type: 'number', minimum: 0, maximum: 200, default: 40 } }, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'canvas_new',
    title: 'Create blank LixSketch canvas',
    description: 'Replace the current scene with a blank canvas. Requires explicit confirmation.',
    inputSchema: { type: 'object', required: ['confirm'], properties: { name: { type: 'string', maxLength: 72 }, confirm: { const: true } }, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  },
  {
    name: 'lixscript_apply',
    title: 'Apply LixScript diagram',
    description: 'Compile LixScript into the same validated atomic scene patch used by structured canvas edits. Supports revisions and dry runs.',
    inputSchema: { type: 'object', required: ['source'], properties: { source: { type: 'string', maxLength: 100000 }, x: { type: 'number' }, y: { type: 'number' }, expectedRevision: { type: 'integer', minimum: 0 }, dryRun: { type: 'boolean', default: false } }, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: 'templates_search',
    title: 'Search LixSketch templates',
    description: 'Search published workspace and component templates in the LixSketch marketplace.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', maxLength: 80 }, tag: { type: 'string', maxLength: 24 }, limit: { type: 'integer', minimum: 1, maximum: 24, default: 12 } }, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'template_insert',
    title: 'Insert LixSketch template',
    description: 'Insert a published template into the current canvas, remapping every shape and relationship ID. The operation is atomic and supports a dry run.',
    inputSchema: { type: 'object', required: ['slug'], properties: { slug: { type: 'string', pattern: '^[a-z0-9-]{1,80}$' }, x: { type: 'number' }, y: { type: 'number' }, expectedRevision: { type: 'integer', minimum: 0 }, dryRun: { type: 'boolean', default: false } }, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
]);

function toolResult(value, message) {
  return {
    content: [{ type: 'text', text: message || JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function toolError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: 'text', text: message }], structuredContent: { error: message } };
}

export class LixSketchMcpServer {
  constructor({ store, templateProvider = new MarketplaceTemplateProvider(), serverInfo = {} } = {}) {
    if (!store?.read || !store?.write) throw new Error('createLixSketchMcpServer requires a scene store with read() and write()');
    this.store = store;
    this.templateProvider = templateProvider;
    this.serverInfo = { name: SERVER_NAME, version: SERVER_VERSION, ...serverInfo };
    this.mutationChain = Promise.resolve();
  }

  listTools() {
    return LIXSKETCH_MCP_TOOLS;
  }

  async callTool(name, args = {}) {
    try {
      switch (name) {
        case 'canvas_get': {
          const scene = await this.store.read();
          let shapes;
          if (args.includeShapes) {
            const ids = new Set(args.shapeIDs || []);
            shapes = ids.size ? scene.shapes.filter((shape) => ids.has(shape.shapeID)) : scene.shapes;
          }
          return toolResult({ summary: getSceneSummary(scene), ...(shapes ? { shapes } : {}) });
        }
        case 'canvas_validate': {
          const scene = await this.store.read();
          const validation = validateScene(scene);
          return toolResult({ ...validation, summary: getSceneSummary(scene), limits: MCP_LIMITS });
        }
        case 'canvas_preview': {
          const scene = await this.store.read();
          const svg = renderSceneSvg(scene, args);
          return toolResult({ svg, dataUrl: `data:image/svg+xml;base64,${encodeBase64(svg)}`, summary: getSceneSummary(scene) }, svg);
        }
        case 'templates_search': {
          const templates = await this.templateProvider.search(args);
          return toolResult({ templates: templates.map(safeTemplateMetadata) });
        }
        case 'canvas_apply_patch':
          return await this.enqueueMutation(async () => {
            const scene = await this.store.read();
            const result = applyScenePatch(scene, args.operations, args);
            if (!args.dryRun) await this.store.write(result.scene);
            return toolResult({ revision: result.revision, dryRun: result.dryRun, changedShapeIDs: result.changedShapeIDs, summary: getSceneSummary(result.scene) }, args.dryRun ? 'Canvas patch is valid. No changes were saved.' : `Canvas patch saved at revision ${result.revision}.`);
          });
        case 'canvas_new':
          if (args.confirm !== true) throw new Error('canvas_new requires confirm=true');
          return await this.enqueueMutation(async () => {
            const current = await this.store.read();
            const scene = createEmptyScene(args.name);
            scene.mcpRevision = Number(current.mcpRevision || 0) + 1;
            await this.store.write(scene);
            return toolResult({ summary: getSceneSummary(scene) }, 'Blank canvas created.');
          });
        case 'lixscript_apply':
          return await this.enqueueMutation(async () => {
            const scene = await this.store.read();
            const compiled = compileLixScript(args.source, args);
            const result = applyScenePatch(scene, compiled.operations, args);
            if (!args.dryRun) await this.store.write(result.scene);
            return toolResult({ revision: result.revision, dryRun: result.dryRun, sourceShapeCount: compiled.sourceShapeCount, createdShapeIDs: result.changedShapeIDs, summary: getSceneSummary(result.scene) }, args.dryRun ? 'LixScript is valid. No changes were saved.' : `LixScript added ${result.changedShapeIDs.length} canvas elements.`);
          });
        case 'template_insert':
          return await this.enqueueMutation(async () => {
            const scene = await this.store.read();
            const revision = Number(scene.mcpRevision || 0);
            if (args.expectedRevision !== undefined && Number(args.expectedRevision) !== revision) throw new Error(`Revision conflict: expected ${args.expectedRevision}, current ${revision}`);
            const template = await this.templateProvider.load(args.slug);
            const result = mergeTemplateScene(scene, template.scene, args);
            if (!args.dryRun) await this.store.write(result.scene);
            return toolResult({ template: safeTemplateMetadata(template.metadata), revision: result.revision, dryRun: Boolean(args.dryRun), importedShapeIDs: result.importedShapeIDs, summary: getSceneSummary(result.scene) }, args.dryRun ? 'Template import is valid. No changes were saved.' : `Template inserted with ${result.importedShapeIDs.length} shapes.`);
          });
        default: throw new Error(`Unknown tool "${name}"`);
      }
    } catch (error) {
      return toolError(error);
    }
  }

  enqueueMutation(operation) {
    const pending = this.mutationChain.then(operation, operation);
    this.mutationChain = pending.catch(() => {});
    return pending;
  }

  async handleRequest(request) {
    const method = request?.method;
    if (method === 'initialize') {
      const requested = request.params?.protocolVersion;
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.has(requested) ? requested : PROTOCOL_VERSION;
      return { protocolVersion, capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } }, serverInfo: this.serverInfo, instructions: 'Before any mutation, call canvas_get and retain its revision. Preserve unrelated shapes. Send expectedRevision and dryRun: true first, inspect canvas_preview for layout changes, then commit the same validated operation with dryRun: false. Never clear or replace a canvas unless the user explicitly requests it. Prefer lixscript_apply for diagrams and template_insert for reusable component packs.' };
    }
    if (method === 'ping') return {};
    if (method === 'tools/list') return { tools: this.listTools() };
    if (method === 'tools/call') return this.callTool(request.params?.name, request.params?.arguments || {});
    if (method === 'resources/list') return { resources: [{ uri: 'lixsketch://canvas', name: 'Current LixSketch canvas', description: 'The active editable .lixjson scene', mimeType: 'application/vnd.lixsketch+json' }, { uri: 'lixsketch://canvas/preview.svg', name: 'Current canvas preview', description: 'A lightweight SVG preview of the current scene', mimeType: 'image/svg+xml' }] };
    if (method === 'resources/read') {
      const scene = await this.store.read();
      if (request.params?.uri === 'lixsketch://canvas') return { contents: [{ uri: 'lixsketch://canvas', mimeType: 'application/vnd.lixsketch+json', text: JSON.stringify(scene) }] };
      if (request.params?.uri === 'lixsketch://canvas/preview.svg') return { contents: [{ uri: 'lixsketch://canvas/preview.svg', mimeType: 'image/svg+xml', text: renderSceneSvg(scene) }] };
      throw Object.assign(new Error('Resource not found'), { code: -32002 });
    }
    if (method?.startsWith('notifications/')) return undefined;
    throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
  }
}

function safeTemplateMetadata(template = {}) {
  return { id: template.id, slug: template.slug, title: template.title, description: template.description || '', tags: template.tags || [], publisher: template.publisher, views: template.views, forks: template.forks, clones: template.clones, publishedAt: template.publishedAt, updatedAt: template.updatedAt };
}

function encodeBase64(value) {
  if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(value)));
  return Buffer.from(value, 'utf8').toString('base64');
}

export function createLixSketchMcpServer(options) {
  return new LixSketchMcpServer(options);
}

export { PROTOCOL_VERSION as LIXSKETCH_MCP_PROTOCOL_VERSION };
