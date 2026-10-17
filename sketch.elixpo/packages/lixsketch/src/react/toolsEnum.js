// Standalone TOOLS enum re-export. The engine's index.js also exports
// TOOLS but doing it from here lets the React subpath avoid pulling
// in side-effectful modules (SceneSerializer, shape graph) just to read
// a constants map. Keep these values in lockstep with src/index.js.
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
