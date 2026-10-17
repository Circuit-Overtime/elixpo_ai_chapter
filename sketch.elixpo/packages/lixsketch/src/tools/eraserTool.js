/* eslint-disable */
// Eraser tool - extracted from eraserTool.js
// Depends on globals: svg, isEraserToolActive, ACTION_DELETE, historyStack, redoStack, clearAllSelections
import { createEraserTrail, updateEraserTrail, fadeOutEraserTrail, forceCleanupEraserTrail, getIsErasing, setIsErasing, getTargetedElements } from '../core/EraserTrail.js';

function getEraserCursorSVG() {
  const isLight = document.documentElement.dataset.canvasTheme === 'light' || document.body?.classList.contains('theme-light');
  const fill = isLight ? '#31283f' : '#f5effb';
  const stroke = isLight ? '#ffffff' : '#31283f';
  return `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="${fill}" stroke="${stroke}" stroke-width="2"/></svg>`)}`;
}

// Expose force cleanup on window so SketchEngine can call it on tool switch
window.forceCleanupEraserTrail = forceCleanupEraserTrail;

// Walk up from any element to find its top-level SVG child (direct child of svg)
function findTopLevelGroup(element) {
    if (!element || element === svg) return null;
    let current = element;
    while (current && current.parentNode !== svg) {
        current = current.parentNode;
        if (!current || current === document.body) return null;
    }
    return current;
}

// --- Function to highlight elements under the eraser ---
function handleElementHighlight(clientX, clientY) {
  if (!getIsErasing()) return;
  const targetedElements = getTargetedElements();

  const element = document.elementFromPoint(clientX, clientY);
  if (!element || element === svg) return;

  // Find the top-level SVG child group for this element
  let elementToHighlight = findTopLevelGroup(element);

  // Skip the eraser trail paths and any pointer-events:none elements
  if (!elementToHighlight) return;
  if (elementToHighlight.style.pointerEvents === 'none') return;

  if (!targetedElements.has(elementToHighlight)) {
      targetedElements.add(elementToHighlight);
      elementToHighlight.setAttribute("data-original-opacity", elementToHighlight.style.opacity || "1");
      elementToHighlight.dataset.storedOpacity = elementToHighlight.getAttribute("data-original-opacity");
      elementToHighlight.style.opacity = "0.3";
  }
}

function removeHighlight() {
  const targetedElements = getTargetedElements();
  targetedElements.forEach(element => {
      element.style.opacity = element.getAttribute("data-original-opacity") || "1";
  });
  targetedElements.clear();
}

function removeTargetedElements() {
    const targetedElements = getTargetedElements();
    const elementsToRemove = Array.from(targetedElements);

    if (elementsToRemove.length > 0) {
        const deletionActions = [];

        elementsToRemove.forEach(element => {
            const originalOpacity = element.dataset.storedOpacity || "1";
            deletionActions.push({
                type: ACTION_DELETE,
                element: element,
                parent: element.parentNode,
                nextSibling: element.nextSibling,
                originalOpacity: originalOpacity,
            });

            // Remove from DOM
            if (element.parentNode) {
                element.parentNode.removeChild(element);
            }

            // Also remove from the global shapes array
            if (window.shapes) {
                const idx = window.shapes.findIndex(s =>
                    s.element === element ||
                    s.group === element ||
                    s.wrapper === element
                );
                if (idx !== -1) {
                    window.shapes.splice(idx, 1);
                }
            }
        });

        if (deletionActions.length > 0 && window.historyStack) {
            window.historyStack.push(...deletionActions);
        }

        window.redoStack = [];
        if (typeof clearAllSelections === 'function') clearAllSelections();
        if (typeof updateUndoRedoButtons === 'function') updateUndoRedoButtons();
        targetedElements.clear();
    }
}

// --- Event Listeners ---
svg.addEventListener("pointerdown", (e) => {
  if (isEraserToolActive) {
    setIsErasing(true);
    createEraserTrail(e.clientX, e.clientY);
    handleElementHighlight(e.clientX, e.clientY);
  }
});

svg.addEventListener("pointermove", (e) => {
  if (isEraserToolActive) {
      svg.style.cursor = `url(${getEraserCursorSVG()}) 10 10, auto`;
  }
  if (!getIsErasing()) return;
  const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
  events.forEach((point) => updateEraserTrail(point.clientX, point.clientY));
  handleElementHighlight(e.clientX, e.clientY);
});

svg.addEventListener("pointerup", () => {
  if (!getIsErasing()) return;
  setIsErasing(false);
  removeTargetedElements();
  fadeOutEraserTrail();
  svg.style.cursor = "default";
});

svg.addEventListener("pointerleave", (e) => {
  if (!getIsErasing()) return;
  setIsErasing(false);
  removeTargetedElements();
  fadeOutEraserTrail();
  svg.style.cursor = "default";
});
