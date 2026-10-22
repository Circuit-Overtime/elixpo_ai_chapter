/* eslint-disable */
import { installScreenSpaceControlSync } from './ScreenSpaceControls.js';
// Zoom and Pan controls - combined from zoomFunction.js + panCanvas.js
// Depends on globals: svg, freehandCanvas, currentZoom, currentViewBox, isPanningToolActive, isPanning
// Depends on globals: minScale, maxScale, zoomInBtn, zoomOutBtn, zoomPercentSpan, panStart, startCanvasX, startCanvasY

installScreenSpaceControlSync(freehandCanvas);

// === Zoom Functions ===
let currentY = 0;
const scrollRate = 50;

function updateZoomDisplay() {
  zoomPercentSpan.innerText = Math.round(currentZoom * 100) + "%";
}

function updateViewBox(anchorX = null, anchorY = null) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const scaledWidth = width / currentZoom;
  const scaledHeight = height / currentZoom;

  let centerX, centerY;

  if (anchorX === null || anchorY === null) {
    centerX = currentViewBox.x + (currentViewBox.width / 2);
    centerY = currentViewBox.y + (currentViewBox.height / 2);
  } else {

    centerX = anchorX;
    centerY = anchorY;
  }

  const viewBoxX = centerX - (scaledWidth / 2);
  const viewBoxY = centerY - (scaledHeight / 2);

  freehandCanvas.setAttribute(
    "viewBox",
    `${viewBoxX} ${viewBoxY} ${scaledWidth} ${scaledHeight}`
  );

  currentViewBox.x = viewBoxX;
  currentViewBox.y = viewBoxY;
  currentViewBox.width = scaledWidth;
  currentViewBox.height = scaledHeight;
}

zoomInBtn.addEventListener("click", function() {
  currentZoom *= 1.1;
  if (currentZoom > maxScale) currentZoom = maxScale;
  updateViewBox();
  updateZoomDisplay();
});

zoomOutBtn.addEventListener("click", function() {
  currentZoom /= 1.1;
  if (currentZoom < minScale) currentZoom = minScale;
  updateViewBox();
  updateZoomDisplay();
});

// Exposed for React Footer buttons — zoom from center of canvas
window.zoomFromCenter = function(direction) {
  if (direction > 0) {
    currentZoom *= 1.1;
    if (currentZoom > maxScale) currentZoom = maxScale;
  } else {
    currentZoom /= 1.1;
    if (currentZoom < minScale) currentZoom = minScale;
  }
  updateViewBox(); // null anchors = zoom from center
  updateZoomDisplay();
  // Sync React zoom state
  if (window.__sketchStoreApi && window.__sketchStoreApi.setZoom) {
    window.__sketchStoreApi.setZoom(currentZoom);
  }
};

window.zoomReset = function() {
  // Issue #24 bug #5: reset zoom in place around the current viewport
  // centre — do NOT recenter to (0, 0). Recentering used to make whatever
  // the user had on screen vanish until they panned back to it.
  const cx = currentViewBox.x + currentViewBox.width / 2;
  const cy = currentViewBox.y + currentViewBox.height / 2;

  currentZoom = 1;
  const rect = freehandCanvas.getBoundingClientRect();
  const vbW = rect.width || window.innerWidth;
  const vbH = rect.height || window.innerHeight;

  currentViewBox.x = cx - vbW / 2;
  currentViewBox.y = cy - vbH / 2;
  currentViewBox.width = vbW;
  currentViewBox.height = vbH;
  freehandCanvas.setAttribute(
    "viewBox",
    `${currentViewBox.x} ${currentViewBox.y} ${vbW} ${vbH}`
  );
  updateZoomDisplay();
  if (window.__sketchStoreApi && window.__sketchStoreApi.setZoom) {
    window.__sketchStoreApi.setZoom(1);
  }
};

function getShapeBoundsForFit(shape) {
  if (!shape) return null;

  const selection = window.multiSelection;
  if (selection && typeof selection.getShapeBounds === "function") {
    try {
      const bounds = selection.getShapeBounds(shape);
      if (bounds && [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) {
        return bounds;
      }
    } catch {}
  }

  // Fall back to the common shape interface when selection is unavailable.
  // Accessing x/y instead of boundingBox preserves freehand move offsets.
  const bounds = {
    x: Number(shape.x),
    y: Number(shape.y),
    width: Number(shape.width),
    height: Number(shape.height),
  };
  return Object.values(bounds).every(Number.isFinite) ? bounds : null;
}

window.zoomFit = function() {
  if (!window.shapes || window.shapes.length === 0) {
    if (window.zoomReset) window.zoomReset();
    return;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  window.shapes.forEach(shape => {
    const bounds = getShapeBoundsForFit(shape);
    if (!bounds) return;
    
    // Normalize coordinates just in case width/height is negative
    const x1 = Math.min(bounds.x, bounds.x + bounds.width);
    const x2 = Math.max(bounds.x, bounds.x + bounds.width);
    const y1 = Math.min(bounds.y, bounds.y + bounds.height);
    const y2 = Math.max(bounds.y, bounds.y + bounds.height);

    minX = Math.min(minX, x1);
    minY = Math.min(minY, y1);
    maxX = Math.max(maxX, x2);
    maxY = Math.max(maxY, y2);
  });

  if (minX === Infinity) {
    if (window.zoomReset) window.zoomReset();
    return;
  }

  const rect = freehandCanvas.getBoundingClientRect();
  const screenW = rect.width || window.innerWidth;
  const screenH = rect.height || window.innerHeight;

  const contentW = maxX - minX;
  const contentH = maxY - minY;
  
  // Add 10% padding
  const paddingX = Math.max(50, contentW * 0.1);
  const paddingY = Math.max(50, contentH * 0.1);

  const paddedW = contentW + paddingX * 2;
  const paddedH = contentH + paddingY * 2;

  // Calculate required zoom to fit the padded content in the screen
  const zoomX = screenW / paddedW;
  const zoomY = screenH / paddedH;
  
  let newZoom = Math.min(zoomX, zoomY);
  newZoom = Math.max(minScale, Math.min(newZoom, maxScale));

  // Center coordinate of the content
  const cx = minX + contentW / 2;
  const cy = minY + contentH / 2;

  // Set the new viewBox and zoom
  currentZoom = newZoom;
  const vbW = screenW / currentZoom;
  const vbH = screenH / currentZoom;

  currentViewBox.x = cx - vbW / 2;
  currentViewBox.y = cy - vbH / 2;
  currentViewBox.width = vbW;
  currentViewBox.height = vbH;

  freehandCanvas.setAttribute(
    "viewBox",
    `${currentViewBox.x} ${currentViewBox.y} ${vbW} ${vbH}`
  );
  
  updateZoomDisplay();
  if (window.__sketchStoreApi && window.__sketchStoreApi.setZoom) {
    window.__sketchStoreApi.setZoom(currentZoom);
  }
};

freehandCanvas.addEventListener("wheel", function(e) {
  if (!e.ctrlKey) return;
  e.preventDefault();

  // Determine the zoom delta
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  let newZoom = currentZoom + delta;
  if (newZoom < minScale) newZoom = minScale;
  if (newZoom > maxScale) newZoom = maxScale;

  // Get canvas bounding rect — this MUST be the SVG element's actual
  // size, not the window's. In split mode the canvas pane is narrower
  // than the viewport; using window.innerWidth here would produce a
  // viewBox aspect that doesn't match the element, and (with
  // preserveAspectRatio="none" on the host) the content gets stretched
  // / squeezed on every zoom step.
  const rect = freehandCanvas.getBoundingClientRect();

  // Calculate mouse position relative to the canvas in pixels
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  // Determine what fraction of the canvas the mouse is at
  const mouseFracX = mouseX / rect.width;
  const mouseFracY = mouseY / rect.height;

  // Compute the current viewBox coordinate under the mouse.
  // currentViewBox.width and .height represent the current viewBox dimensions.
  const anchorViewBoxX = currentViewBox.x + mouseFracX * currentViewBox.width;
  const anchorViewBoxY = currentViewBox.y + mouseFracY * currentViewBox.height;

  // New viewBox dimensions sized to the *element*, scaled by the new
  // zoom. This keeps the viewBox aspect ratio matching the element so
  // shapes stay undistorted.
  const newViewBoxWidth = rect.width / newZoom;
  const newViewBoxHeight = rect.height / newZoom;
  
  // Compute the new viewBox's x and y so that the anchor remains at the same screen fraction.
  // That means:
  //   newViewBox.x + mouseFracX * newViewBoxWidth === anchorViewBoxX
  // Solve for newViewBox.x:
  const newViewBoxX = anchorViewBoxX - mouseFracX * newViewBoxWidth;
  const newViewBoxY = anchorViewBoxY - mouseFracY * newViewBoxHeight;
  
  // Update the viewBox attribute with the new values.
  freehandCanvas.setAttribute(
    "viewBox",
    `${newViewBoxX} ${newViewBoxY} ${newViewBoxWidth} ${newViewBoxHeight}`
  );
  
  // Update our state
  currentZoom = newZoom;
  currentViewBox = {
    x: newViewBoxX,
    y: newViewBoxY,
    width: newViewBoxWidth,
    height: newViewBoxHeight
  };

  updateZoomDisplay();
  // Sync React zoom state
  if (window.__sketchStoreApi && window.__sketchStoreApi.setZoom) {
    window.__sketchStoreApi.setZoom(currentZoom);
  }
});

// Function to resize the canvas to fill the screen (initial setup)
function resizeCanvas() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  freehandCanvas.style.width = `${width}px`;
  freehandCanvas.style.height = `${height}px`;

  // Set initial viewBox based on initial zoom
  updateViewBox(); // Initial center anchor
}



let isMiddleMousePanning = false;
let isSpaceMousePanning = false;

freehandCanvas.addEventListener("mousedown", function (e) {
  // Space + primary button temporarily owns the pointer, regardless of the
  // active drawing tool. EventDispatcher yields while this flag is active.
  if (e.button === 0 && window.__spacePanActive) {
      e.preventDefault();
      isSpaceMousePanning = true;
      window.__spacePanPointerActive = true;
      isPanning = true;
      startCanvasX = e.clientX;
      startCanvasY = e.clientY;
      panStart = { x: e.clientX, y: e.clientY };
      freehandCanvas.style.cursor = 'grabbing';
      return;
  }
  // Middle mouse button panning
  if (e.button === 1) {
      e.preventDefault();
      isMiddleMousePanning = true;
      isPanning = true;
      startCanvasX = e.clientX;
      startCanvasY = e.clientY;
      panStart = { x: e.clientX, y: e.clientY };
      freehandCanvas.style.cursor = 'grabbing';
      return;
  }
  if (isPanningToolActive) {
      isPanning = true;
      startCanvasX = e.clientX;
      startCanvasY = e.clientY;
      panStart = { x: e.clientX, y: e.clientY };
      freehandCanvas.style.cursor = 'grabbing';
  }
});

freehandCanvas.addEventListener("mousemove", (e) => {
  if (!isPanning) return;

  const dx = e.clientX - panStart.x;
  const dy = e.clientY - panStart.y;
  const dxViewBox = dx / currentZoom;
  const dyViewBox = dy / currentZoom;

  currentViewBox.x -= dxViewBox;
  currentViewBox.y -= dyViewBox;

  freehandCanvas.setAttribute(
      "viewBox",
      `${currentViewBox.x} ${currentViewBox.y} ${currentViewBox.width} ${currentViewBox.height}`
  );

  panStart = { x: e.clientX, y: e.clientY };
});

freehandCanvas.addEventListener("mouseup", (e) => {
  if (isSpaceMousePanning) {
      isSpaceMousePanning = false;
      window.__spacePanPointerActive = false;
      isPanning = false;
      freehandCanvas.style.cursor = window.__spacePanActive ? 'grab' : '';
      return;
  }
  if (isMiddleMousePanning) {
      isMiddleMousePanning = false;
      isPanning = false;
      freehandCanvas.style.cursor = '';
      return;
  }
  if(isPanningToolActive)
  {
      isPanning = false;
      freehandCanvas.style.cursor = 'grab';
  }
});

freehandCanvas.addEventListener("mouseleave", () => {
  if (isSpaceMousePanning) {
      isSpaceMousePanning = false;
      window.__spacePanPointerActive = false;
      isPanning = false;
      freehandCanvas.style.cursor = window.__spacePanActive ? 'grab' : '';
      return;
  }
  if (isMiddleMousePanning) {
      isMiddleMousePanning = false;
      isPanning = false;
      freehandCanvas.style.cursor = '';
      return;
  }
  if(isPanningToolActive)
  {
      isPanning = false;
      freehandCanvas.style.cursor = 'grab';
  }
});

window.addEventListener("blur", () => {
  if (!isSpaceMousePanning) return;
  isSpaceMousePanning = false;
  window.__spacePanPointerActive = false;
  isPanning = false;
  freehandCanvas.style.cursor = '';
});

// Prevent default middle-click auto-scroll behavior
freehandCanvas.addEventListener("auxclick", (e) => {
  if (e.button === 1) e.preventDefault();
});


svg.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (e.ctrlKey) return; // Ignore zoom gestures

  if (e.shiftKey) {
      // Pan sideways when Shift is held
      currentViewBox.x += e.deltaY > 0 ? scrollRate : -scrollRate;
  } else {
      // Pan vertically
      currentViewBox.y += e.deltaY > 0 ? scrollRate : -scrollRate;
  }

  svg.setAttribute(
      "viewBox",
      `${currentViewBox.x} ${currentViewBox.y} ${currentViewBox.width} ${currentViewBox.height}`
  );
});
