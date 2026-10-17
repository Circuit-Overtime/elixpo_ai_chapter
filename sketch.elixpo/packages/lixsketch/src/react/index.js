/**
 * @elixpo/lixsketch/react — React component bindings for the LixSketch
 * engine. Mountable in any React app (e.g. blogs.elixpo) without running a
 * second server.
 *
 * Usage:
 *   import { LixSketchCanvas } from '@elixpo/lixsketch/react';
 *   import '@elixpo/lixsketch/react/styles';
 *
 *   <LixSketchCanvas
 *     initialScene={scene}
 *     onSceneChange={(scene, metadata) => save(scene, metadata)}
 *     onUploadImage={async (dataUrl) => {
 *       const r = await fetch('/api/media/upload', { … });
 *       return { url: r.url, sizeBytes: r.sizeBytes };
 *     }}
 *     onExit={() => router.back()}
 *   />
 *
 * The component is offline-first: it does not touch any cloud sync, AI, or
 * auth code paths. The host owns persistence and image upload via the two
 * callbacks above.
 */

export { default as LixSketchCanvas } from './LixSketchCanvas.jsx';

// Re-exports — we import each from its specific source file rather than
// going through `../index.js`, which would pull SceneSerializer.js (and
// the entire shape graph that references engine globals) into the entry
// chunk. The engine entry stays available for hosts that explicitly want
// raw scene IO (`import { saveScene } from '@elixpo/lixsketch'`).
export { TOOLS } from './toolsEnum.js';
export { compressImage } from '../utils/imageCompressor.js';
export {
  ALLOWED_IMAGE_MIME_TYPES,
  IMAGE_ACCEPT_ATTR,
  ALLOWED_IMAGE_EXTENSIONS,
  isAllowedImage,
  isAllowedImageDataUrl,
} from '../utils/allowedImageTypes.js';
export { installEngineShortcuts, SHORTCUT_MAP } from '../EngineShortcuts.js';
