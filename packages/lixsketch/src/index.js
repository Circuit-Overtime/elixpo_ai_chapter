/* eslint-disable */
/**
 * @lixsketch/engine - Open-source SVG whiteboard engine
 *
 * Usage:
 *   import { createSketchEngine } from '@elixpo/lixsketch';
 *
 *   const engine = createSketchEngine(svgElement, {
 *     onEvent: (type, data) => console.log(type, data),
 *   });
 *   await engine.init();
 *   engine.setActiveTool('rectangle');
 *
 * Shape classes are loaded lazily by the engine during init() and exposed
 * on `window` (Rectangle, Circle, Arrow, etc.) and via `engine._modules.shapes`.
 * They CANNOT be statically imported because they depend on globals (rough, svg)
 * that are only set up during engine initialization.
 */

// Main engine class
export { SketchEngine, default } from './SketchEngine.js';

// Convenience factory
import { SketchEngine } from './SketchEngine.js';

/**
 * Create and return a new SketchEngine instance.
 *
 * @param {SVGSVGElement} svgElement - The SVG element to mount on
 * @param {Object} [options]
 * @param {number} [options.initialZoom=1]
 * @param {number} [options.minZoom=0.4]
 * @param {number} [options.maxZoom=30]
 * @param {function} [options.onEvent] - Callback for engine events:
 *   'sidebar:select'  - { sidebar, shapeName }
 *   'sidebar:clear'   - undefined
 *   'zoom:change'     - number
 *   'tool:change'     - string
 *   'scene:change'    - undefined
 * @returns {SketchEngine}
 */
export function createSketchEngine(svgElement, options = {}) {
    return new SketchEngine(svgElement, options);
}

// Scene serialization helpers — for embedded consumers (e.g. blogs.elixpo) that
// need to round-trip a scene through their own storage. saveScene reads from
// window.shapes (populated by an active engine); loadScene rebuilds shapes onto
// the active engine's SVG. Both must be called after engine.init() completes.
// Scene serializer is intentionally NOT re-exported here.
//
// SceneSerializer.js statically imports every shape module, and the shape
// modules reference bare `rough` / `svg` globals that only exist after
// engine.init() runs. Re-exporting `saveScene`/`loadScene` at this module
// scope makes any `import { ... } from '@elixpo/lixsketch'` evaluate the
// shape graph eagerly and crash with "rough is not defined".
//
// Hosts that need scene serialization should import the subpath directly,
// AFTER mounting the engine:
//   const { saveScene, loadScene } = await import(
//     '@elixpo/lixsketch/src/core/SceneSerializer.js'
//   );
// or use window.__sceneSerializer which engine.init() exposes.

// Adaptive image compressor — same one the engine uses internally for
// uploads. Exported so embedded hosts can pre-compress images before
// shipping them across a postMessage boundary.
export { compressImage } from './utils/imageCompressor.js';

// Canonical image allowlist. The engine and any embedding host should
// reject anything outside this set at every entry point (file picker,
// drag-drop, paste, server boundary).
export {
    ALLOWED_IMAGE_MIME_TYPES,
    ALLOWED_IMAGE_EXTENSIONS,
    IMAGE_ACCEPT_ATTR,
    isAllowedImage,
    isAllowedImageDataUrl,
} from './utils/allowedImageTypes.js';

// Engine-local keyboard shortcuts (tool switching, delete, group/ungroup,
// space-to-pan, escape-deselect). App-level shortcuts (cloud save, modal
// toggles) are intentionally NOT included — those belong to the consumer.
export { installEngineShortcuts, SHORTCUT_MAP } from './EngineShortcuts.js';

// Tool name constants
export const TOOLS = {
    SELECT: 'select',
    PAN: 'pan',
    RECTANGLE: 'rectangle',
    CIRCLE: 'circle',
    LINE: 'line',
    ARROW: 'arrow',
    FREEHAND: 'freehand',
    TEXT: 'text',
    CODE: 'code',
    ERASER: 'eraser',
    LASER: 'laser',
    IMAGE: 'image',
    FRAME: 'frame',
    ICON: 'icon',
    DRAW_SHAPE: 'draw-shape',
    PAINT_BUCKET: 'paint-bucket',
    LASSO: 'lasso',
    WEB_EMBED: 'web-embed',
};
