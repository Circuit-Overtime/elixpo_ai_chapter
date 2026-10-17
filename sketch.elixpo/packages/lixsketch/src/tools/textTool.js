/* eslint-disable */
// Text tool event handlers - extracted from writeText.js
import {
    pushCreateAction,
    pushDeleteAction,
    pushDeleteActionWithAttachments,
    pushTransformAction,
    pushOptionsChangeAction,
    pushFrameAttachmentAction,
    setTextReferences,
    updateSelectedElement
} from '../core/UndoRedo.js';
import { cleanupAttachments, updateAttachedArrows } from './arrowTool.js';
import { registerRotationAnchor } from '../core/ScreenSpaceControls.js';

function getThemeStroke() { if (typeof document === "undefined") return "#fff"; return document.body && document.body.classList.contains("theme-dark") ? "#fff" : "#000000"; }
import {
    addCodeBlock,
    wrapCodeElement,
    selectCodeBlock,
    deselectCodeBlock,
    applySyntaxHighlightingToSVG,
    createHighlightedSVGText,
    updateCodeBackground,
    extractTextFromCodeElement,
    setCodeLanguage,
    getCodeLanguage,
    getSelectedCodeBlock
} from './codeTool.js';

let textSize = "20px";
let textFont = "lixFont";
let textColor = null;
let textAlign = "left";

let textColorOptions = document.querySelectorAll(".textColorSpan");
let textFontOptions = document.querySelectorAll(".textFontSpan");
let textSizeOptions = document.querySelectorAll(".textSizeSpan");
let textAlignOptions = document.querySelectorAll(".textAlignSpan");

let selectedElement = null;
let selectionBox = null;
let resizeHandles = {};
let dragOffsetX, dragOffsetY;
let isDragging = false;
let isResizing = false;
let currentResizeHandle = null;
let startBBox = null;
let startFontSize = null;
let startPoint = null;
let isRotating = false;
let rotationStartAngle = 0;
let rotationStartTransform = null;
let initialHandlePosRelGroup = null;
let initialFixedHandlePosRelGroup = null;
let resizePointerOffsetScreen = null;
let resizePadding = 0;
let initialGroupMatrix = null;
let initialGroupTx = 0;
let initialGroupTy = 0;
let initialInverseScreenCTM = null;

// Frame attachment variables
let draggedShapeInitialFrameText = null;
let hoveredFrameText = null;

setTextReferences(selectedElement, updateSelectionFeedback, svg);


function switchToSelectionTool() {
    if (window.__sketchStoreApi) {
        window.__sketchStoreApi.setActiveTool('select', { afterDraw: true });
    } else {
        window.isSelectionToolActive = true;
    }
}


// Convert group element to our TextShape class
function wrapTextElement(groupElement) {
    const textShape = new TextShape(groupElement);
    return textShape;
}

function getSVGCoordinates(event, element = svg) {
    if (!svg || !svg.createSVGPoint) {
        console.error("SVG element or createSVGPoint method not available.");
        return { x: 0, y: 0 };
    }
    let pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;

    try {
        let screenCTM = (element && typeof element.getScreenCTM === 'function' && element.getScreenCTM()) || svg.getScreenCTM();
        if (!screenCTM) {
            console.error("Could not get Screen CTM.");
            return { x: event.clientX, y: event.clientY };
        }
        let svgPoint = pt.matrixTransform(screenCTM.inverse());
        return {
            x: svgPoint.x,
            y: svgPoint.y,
        };
    } catch (error) {
         console.error("Error getting SVG coordinates:", error);
         return { x: event.clientX, y: event.clientY };
    }
}

function addText(event) {
    let { x, y } = getSVGCoordinates(event);

    let gElement = document.createElementNS("http://www.w3.org/2000/svg", "g");
    gElement.setAttribute("data-type", "text-group");
    gElement.setAttribute("transform", `translate(${x}, ${y})`);

    let textElement = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
    );
    let textAlignElement = "start";
    if (textAlign === "center") textAlignElement = "middle";
    else if (textAlign === "right") textAlignElement = "end";

    textElement.setAttribute("x", 0);
    textElement.setAttribute("y", 0);
    textElement.setAttribute("fill", textColor ?? getThemeStroke());
    textElement.setAttribute("font-size", textSize);
    textElement.setAttribute("font-family", textFont);
    textElement.setAttribute("text-anchor", textAlignElement);
    textElement.setAttribute("cursor", "default");
    textElement.setAttribute("white-space", "pre");
    textElement.setAttribute("dominant-baseline", "hanging");
    // Issue #48 bugs #1 / #3: reverted the previous `bounding-box` hit
    // area (introduced for #34 #5b) — extending the text's hit zone to
    // its full bbox meant the negative space between glyphs and around
    // the text was stealing clicks from shapes drawn ON TOP of the text
    // (drag a rect over text → text intercepts; select text then click a
    // different shape elsewhere → click lands in text's invisible bbox
    // and the text stays selected). Default `painted` only fires on
    // glyph pixels, which restores the expected pass-through. Trade-off:
    // empty-padding clicks no longer select the text — the user has to
    // click on the letters.
    textElement.setAttribute("pointer-events", "painted");
    textElement.textContent = "";

    gElement.setAttribute("data-x", x);
    gElement.setAttribute("data-y", y);
    textElement.setAttribute("data-initial-size", textSize);
    textElement.setAttribute("data-initial-font", textFont);
    textElement.setAttribute("data-initial-color", textColor ?? getThemeStroke());
    textElement.setAttribute("data-initial-align", textAlign);
    textElement.setAttribute("data-type", "text");
    gElement.appendChild(textElement);
    svg.appendChild(gElement);
    
    // Attach ID to both group and text element
    const shapeID = `text-${String(Date.now()).slice(0, 8)}-${Math.floor(Math.random() * 10000)}`;
    gElement.setAttribute('id', shapeID);
    textElement.setAttribute('id', `${shapeID}-text`);
    
    // Create TextShape wrapper for frame functionality
    const textShape = wrapTextElement(gElement);
    
    // Add to shapes array for arrow attachment and frame functionality
    if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
        shapes.push(textShape);
    }
    
    pushCreateAction({
        type: 'text',
        element: textShape,
        shapeName: 'text'
    });

    // Check if text was created inside a frame and add it
    if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
        shapes.forEach(shape => {
            if (shape.shapeName === 'frame' && shape.isShapeInFrame(textShape)) {
                shape.addShapeToFrame(textShape);
            }
        });
    }

    makeTextEditable(textElement, gElement);
}

function makeTextEditable(textElement, groupElement) {

    if (document.querySelector("textarea.svg-text-editor")) {
        return;
    }

    if (selectedElement) {
        deselectElement();
    }

    let input = document.createElement("textarea");
    input.className = "svg-text-editor";
    input.setAttribute("aria-label", "Edit canvas text");
    input.setAttribute("data-editing", "true");

    // Prefer the persisted source so re-opening the editor preserves only
    // the line breaks the user explicitly inserted with Shift+Enter.
    let textContent = '';
    const storedSource = textElement.getAttribute('data-wrap-source');
    if (storedSource !== null && storedSource !== '') {
        textContent = storedSource.replace(/ /g, '\u00A0');
    } else {
        const tspans = textElement.querySelectorAll('tspan');
        if (tspans.length > 0) {
            tspans.forEach((tspan, index) => {
                textContent += tspan.textContent.replace(/ /g, '\u00A0');
                if (index < tspans.length - 1) textContent += '\n';
            });
        } else {
            textContent = textElement.textContent.replace(/ /g, '\u00A0');
        }
    }

    input.value = textContent;
    input.style.position = "fixed";
    input.style.outline = "none";
    input.style.padding = "1px";
    input.style.margin = "0";
    input.style.boxSizing = "border-box";
    input.style.overflow = "hidden";
    input.style.resize = "none";
    input.style.whiteSpace = "pre";
    input.style.minHeight = "1.2em";
    input.style.zIndex = "10000";

    const currentFontSize = textElement.getAttribute("font-size") || "20px";
    const currentFontFamily = textElement.getAttribute("font-family") || "lixFont";
    const currentFill = textElement.getAttribute("fill") || "#fff";
    const currentAnchor = textElement.getAttribute("text-anchor") || "start";

    // Anchor the HTML editor to the SVG text origin, transformed into viewport
    // coordinates. A newly-created <text> is empty, so getBoundingClientRect()
    // reports the SVG's top-left corner instead of the clicked canvas point.
    // The CTM remains valid for empty text and also accounts for pan, zoom,
    // split-view cropping, and frame transforms.
    const groupCTM = groupElement.getScreenCTM() || svg.getScreenCTM();
    const textOrigin = svg.createSVGPoint();
    textOrigin.x = parseFloat(textElement.getAttribute("x")) || 0;
    textOrigin.y = parseFloat(textElement.getAttribute("y")) || 0;
    const screenOrigin = groupCTM
        ? textOrigin.matrixTransform(groupCTM)
        : { x: 0, y: 0 };
    const anchorTranslateX = currentAnchor === "middle" ? "-50%" : currentAnchor === "end" ? "-100%" : "0";

    input.style.left = `${screenOrigin.x}px`;
    input.style.top = `${screenOrigin.y}px`;
    input.style.transform = `translateX(${anchorTranslateX})`;
    input.style.transformOrigin = "top left";

    const svgZoomFactor = groupCTM ? Math.hypot(groupCTM.a, groupCTM.b) : 1;
    input.style.width = "auto";
    input.style.height = "auto";

    // Scale font-size by zoom so the textarea matches what the user sees on canvas
    const rawSize = parseFloat(currentFontSize) || 20;
    const scaledFontSize = `${rawSize * svgZoomFactor}px`;

    input.style.minWidth = "150px";
    input.style.minHeight = "1.5em";
    input.style.width = "auto";
    input.style.height = "auto";
    input.style.overflow = "visible";
    input.style.whiteSpace = "pre";
    input.style.wordBreak = "normal";
    input.style.overflowWrap = "normal";
    input.style.fontSize = scaledFontSize;
    input.style.fontFamily = currentFontFamily;
    input.style.color = currentFill;
    input.style.lineHeight = "1.2em";
    input.style.textAlign = currentAnchor === "middle" ? "center" : currentAnchor === "end" ? "right" : "left";
    input.style.backgroundColor = "transparent";
    input.style.border = "none";
    input.style.boxShadow = "none";
    input.style.outline = "none";
    document.body.appendChild(input);

    const adjustHeight = () => {
        input.style.height = 'auto';
        input.style.height = input.scrollHeight + 'px';
        input.style.overflowY = 'hidden';
    };

    const adjustWidth = () => {
        input.style.width = 'auto';
        const contentWidth = Math.max(input.scrollWidth, 150);
        input.style.width = contentWidth + 'px';
        input.style.overflowX = 'hidden';
    };
    adjustHeight();
    adjustWidth();

    setTimeout(() => {
        input.focus();
        input.select();
    }, 50);

    input.addEventListener('input', adjustHeight);
    input.addEventListener('input', adjustWidth);

    input.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            renderText(input, textElement, true);
        } else if (e.key === "Escape") {
            e.preventDefault();
            renderText(input, textElement, true);
        }
    });

    input.originalTextElement = textElement;
    input.textGroup = groupElement;

    const handleClickOutside = (event) => {
        if (!input.contains(event.target)) {
            renderText(input, textElement, true);
            document.removeEventListener('pointerdown', handleClickOutside, true);
        }
    };
    document.addEventListener('pointerdown', handleClickOutside, true);
    input.handleClickOutside = handleClickOutside;

    // Set text cursor on the element during edit mode
    const textEl = groupElement.querySelector('text');
    if (textEl) textEl.setAttribute("cursor", "text");

    groupElement.style.display = "none";
}

/** Render only explicit editor line breaks; text never soft-wraps. */
function paintTextContent(textElement, source) {
    while (textElement.firstChild) textElement.removeChild(textElement.firstChild);
    const x = textElement.getAttribute('x') || 0;
    const NS = 'http://www.w3.org/2000/svg';
    const finalLines = (source || '').split('\n').map((line) => line.replace(/ /g, ' '));

    finalLines.forEach((line, i) => {
        const tspan = document.createElementNS(NS, 'tspan');
        tspan.setAttribute('x', x);
        tspan.setAttribute('dy', i === 0 ? '0' : '1.2em');
        tspan.textContent = line.length ? line : ' ';
        textElement.appendChild(tspan);
    });
}

function renderText(input, textElement, deleteIfEmpty = false) {
    if (!input || !document.body.contains(input)) {
         return;
    }

    const text = input.value || "";
    const gElement = input.textGroup;

    if (input.handleClickOutside) {
        document.removeEventListener('pointerdown', input.handleClickOutside, true);
    }

    document.body.removeChild(input);

    // Reset cursor back to default after edit mode ends
    if (textElement) textElement.setAttribute("cursor", "default");

    if (!gElement || !textElement) {
        return;
    }

    if (!gElement.parentNode) {
        if (selectedElement === gElement) {
             deselectElement();
        }
        return;
    }

    if (deleteIfEmpty && text.trim() === "") {
        // Find the TextShape wrapper
        let textShape = null;
        if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
            textShape = shapes.find(shape => shape.shapeName === 'text' && shape.group === gElement);
            if (textShape) {
                const idx = shapes.indexOf(textShape);
                if (idx !== -1) shapes.splice(idx, 1);
            }
        }

        // Use enhanced delete action for text with arrow attachments
        pushDeleteActionWithAttachments({
            type: 'text',
            element: textShape || gElement,
            shapeName: 'text'
        });

        // Clean up any arrow attachments before deleting
        if (typeof cleanupAttachments === 'function') {
            cleanupAttachments(gElement);
        }

        svg.removeChild(gElement);
        if (selectedElement === gElement) {
            selectedElement = null;
            removeSelectionFeedback();
        }
    } else {
        // Persist and render only the user's explicit Shift+Enter line
        // breaks. Long lines remain long on the infinite canvas.
        const cleanSource = text.replace(/\u00A0/g, ' ');
        textElement.setAttribute('data-wrap-source', cleanSource);
        textElement.removeAttribute('data-wrap-width');
        paintTextContent(textElement, cleanSource);

        gElement.style.display = 'block';

        // Update attached arrows after text content change
        updateAttachedArrows(gElement);

        if (selectedElement === gElement) {
            setTimeout(updateSelectionFeedback, 0);
        }
    }

    // After rendering text, switch to selection tool and auto-select
    if (gElement.parentNode) {
        switchToSelectionTool();
        // Defer selection so the tool switch (async React state) completes first
        requestAnimationFrame(() => selectElement(gElement));
    }
}

function createSelectionFeedback(groupElement) {
    if (!groupElement) return;
    removeSelectionFeedback();

    const textElement = groupElement.querySelector('text');
    if (!textElement) {
         return;
    }

    const bbox = textElement.getBBox();

    const zoom = window.currentZoom || 1;
    const padding = 8 / zoom;
    const handleSize = 10 / zoom;
    const handleOffset = handleSize / 2;
    const anchorStrokeWidth = 2;

    const selX = bbox.x - padding;
    const selY = bbox.y - padding;
    const selWidth = bbox.width + 2 * padding;
    const selHeight = bbox.height + 2 * padding;

    const outlinePoints = [
        [selX, selY],
        [selX + selWidth, selY],
        [selX + selWidth, selY + selHeight],
        [selX, selY + selHeight],
        [selX, selY]
    ];

    const pointsAttr = outlinePoints.map(p => p.join(',')).join(' ');
    selectionBox = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    selectionBox.setAttribute("class", "selection-box");
    selectionBox.setAttribute("points", pointsAttr);
    selectionBox.setAttribute("fill", "none");
    selectionBox.setAttribute("stroke", "#5B57D1");
    selectionBox.setAttribute("stroke-width", "1.5");
    selectionBox.setAttribute("stroke-dasharray", "4 2");
    selectionBox.setAttribute("vector-effect", "non-scaling-stroke");
    selectionBox.setAttribute("pointer-events", "none");
    groupElement.appendChild(selectionBox);

    // Corner anchors scale font size. Width handles are intentionally
    // omitted because text width is content-driven and never soft-wraps.
    const handlesData = [
        { name: 'nw', x: selX, y: selY, cursor: 'nwse-resize' },
        { name: 'ne', x: selX + selWidth, y: selY, cursor: 'nesw-resize' },
        { name: 'sw', x: selX, y: selY + selHeight, cursor: 'nesw-resize' },
        { name: 'se', x: selX + selWidth, y: selY + selHeight, cursor: 'nwse-resize' },
    ];

    resizeHandles = {};
    handlesData.forEach(handle => {
        const handleRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        handleRect.setAttribute("class", `resize-handle resize-handle-${handle.name}`);
        handleRect.setAttribute("x", handle.x - handleOffset);
        handleRect.setAttribute("y", handle.y - handleOffset);
        handleRect.setAttribute("width", handleSize);
        handleRect.setAttribute("height", handleSize);
        handleRect.setAttribute("fill", "#121212");
        handleRect.setAttribute("stroke", "#5B57D1");
        handleRect.setAttribute("stroke-width", anchorStrokeWidth);
        handleRect.setAttribute("vector-effect", "non-scaling-stroke");
        handleRect.style.cursor = handle.cursor;
        handleRect.setAttribute("data-anchor", handle.name);
        groupElement.appendChild(handleRect);
        resizeHandles[handle.name] = handleRect;

        handleRect.addEventListener('pointerdown', (e) => {
            if (window.isSelectionToolActive) {
                e.stopPropagation();
                handleRect.setPointerCapture?.(e.pointerId);
                startResize(e, handle.name);
            }
        });
    });

    const rotationAnchorPos = { x: selX + selWidth / 2, y: selY - 30 };
    const rotationAnchor = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    rotationAnchor.setAttribute('cx', rotationAnchorPos.x);
    rotationAnchor.setAttribute('cy', rotationAnchorPos.y);
    rotationAnchor.setAttribute('r', 8);
    rotationAnchor.setAttribute('class', 'rotate-anchor');
    rotationAnchor.setAttribute('fill', '#121212');
    rotationAnchor.setAttribute('stroke', '#5B57D1');
    rotationAnchor.setAttribute('stroke-width', anchorStrokeWidth);
    rotationAnchor.setAttribute('vector-effect', 'non-scaling-stroke');
    rotationAnchor.style.cursor = 'grab';
    rotationAnchor.setAttribute('pointer-events', 'all');
    groupElement.appendChild(rotationAnchor);
    registerRotationAnchor(rotationAnchor, { radius: 8, edgeY: selY });

    resizeHandles.rotate = rotationAnchor;

    rotationAnchor.addEventListener('pointerdown', (e) => {
        if (window.isSelectionToolActive) {
            e.stopPropagation();
            startRotation(e);
        }
    });

    rotationAnchor.addEventListener('mouseover', function() {
        if (!isResizing && !isDragging) {
            this.style.cursor = 'grab';
        }
    });

    rotationAnchor.addEventListener('mouseout', function() {
        if (!isResizing && !isDragging) {
            this.style.cursor = 'default';
        }
    });
}

function updateSelectionFeedback() {
    if (!selectedElement || !selectionBox) return;

    const textElement = selectedElement.querySelector('text');
    if (!textElement) return;

    const wasHidden = selectedElement.style.display === 'none';
    if (wasHidden) selectedElement.style.display = 'block';

    const bbox = textElement.getBBox();

    if (wasHidden) selectedElement.style.display = 'none';

    if (bbox.width === 0 && bbox.height === 0 && textElement.textContent.trim() !== "") {
    }

    const zoom2 = window.currentZoom || 1;
    const padding = 8 / zoom2;
    const handleSize = 10 / zoom2;
    const handleOffset = handleSize / 2;

    const selX = bbox.x - padding;
    const selY = bbox.y - padding;
    const selWidth = Math.max(bbox.width + 2 * padding, handleSize);
    const selHeight = Math.max(bbox.height + 2 * padding, handleSize);

    const outlinePoints = [
        [selX, selY],
        [selX + selWidth, selY],
        [selX + selWidth, selY + selHeight],
        [selX, selY + selHeight],
        [selX, selY]
    ];

    const pointsAttr = outlinePoints.map(p => p.join(',')).join(' ');
    selectionBox.setAttribute("points", pointsAttr);

    const handlesData = [
        { name: 'nw', x: selX, y: selY },
        { name: 'ne', x: selX + selWidth, y: selY },
        { name: 'sw', x: selX, y: selY + selHeight },
        { name: 'se', x: selX + selWidth, y: selY + selHeight },
    ];

    handlesData.forEach(handle => {
        const handleRect = resizeHandles[handle.name];
        if (handleRect) {
            handleRect.setAttribute("x", handle.x - handleOffset);
            handleRect.setAttribute("y", handle.y - handleOffset);
        }
    });

    const rotationAnchor = resizeHandles.rotate;
    if (rotationAnchor) {
        const rotationAnchorPos = { x: selX + selWidth / 2, y: selY - 30 / zoom2 };
        rotationAnchor.setAttribute('cx', rotationAnchorPos.x);
        rotationAnchor.setAttribute('cy', rotationAnchorPos.y);
    }
}

function startRotation(event) {
    if (!selectedElement || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    isRotating = true;
    isDragging = false;
    isResizing = false;

    const textElement = selectedElement.querySelector('text');
    if (!textElement) return;

    const bbox = textElement.getBBox();
    const centerX = bbox.x + bbox.width / 2;
    const centerY = bbox.y + bbox.height / 2;

    const mousePos = getSVGCoordinates(event);

    let centerPoint = svg.createSVGPoint();
    centerPoint.x = centerX;
    centerPoint.y = centerY;

    const groupTransform = selectedElement.transform.baseVal.consolidate();
    if (groupTransform) {
        centerPoint = centerPoint.matrixTransform(groupTransform.matrix);
    }

    rotationStartAngle = Math.atan2(mousePos.y - centerPoint.y, mousePos.x - centerPoint.x) * 180 / Math.PI;

    const currentTransform = selectedElement.transform.baseVal.consolidate();
    rotationStartTransform = currentTransform ? currentTransform.matrix : svg.createSVGMatrix();

    svg.style.cursor = 'grabbing';

    window.addEventListener('pointermove', handleMouseMove);
    window.addEventListener('pointerup', handleMouseUp);
}

function removeSelectionFeedback(element) {
    const target = element || selectedElement;
    if (target) {
        target.querySelectorAll(".selection-box, .resize-handle, .rotate-anchor").forEach(el => el.remove());
    }
    // Also clean up any orphaned selection elements in all text groups
    svg.querySelectorAll('g[data-type="text-group"] .selection-box, g[data-type="text-group"] .resize-handle, g[data-type="text-group"] .rotate-anchor').forEach(el => el.remove());

    selectionBox = null;
    resizeHandles = {};
}

function selectElement(groupElement) {
    if (!groupElement || !groupElement.parentNode) return;
    if (groupElement === selectedElement) return;

    deselectElement();
    selectedElement = groupElement;
    selectedElement.classList.add("selected");
    createSelectionFeedback(selectedElement);

    updateSelectedElement(selectedElement);
    updateCodeToggleForShape('text');

    // Update global currentShape so EventDispatcher can route to other tools later
    if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
        const wrapper = shapes.find(s => s.element === groupElement || s.group === groupElement);
        if (wrapper) {
            currentShape = wrapper;
        }
    }

    // Show text property panel when text is selected
    if (window.__showSidebarForShape) window.__showSidebarForShape('text');
}

function deselectElement() {
    const activeEditor = document.querySelector("textarea.svg-text-editor");
    if (activeEditor) {
         let textElement = activeEditor.originalTextElement;
         if (textElement) {
            renderText(activeEditor, textElement, true);
         } else if (document.body.contains(activeEditor)) {
             document.body.removeChild(activeEditor);
         }
    }

    if (selectedElement) {
        removeSelectionFeedback();
        selectedElement.classList.remove("selected");
        selectedElement = null;

        updateSelectedElement(null);

        // Clear global currentShape if it was a text shape
        if (currentShape && (currentShape.shapeName === 'text' || currentShape.shapeName === 'code')) {
            currentShape = null;
        }

        // Hide text property panel if we're in selection mode (not text tool)
        if (isSelectionToolActive) {
            textSideBar.classList.add("hidden");
        }
    }

    if (isRotating) {
        isRotating = false;
        rotationStartAngle = 0;
        rotationStartTransform = null;
        svg.style.cursor = 'default';

        window.removeEventListener('pointermove', handleMouseMove);
        window.removeEventListener('pointerup', handleMouseUp);
    }
}

function startDrag(event) {
    if (!selectedElement || event.button !== 0) return;

     if (event.target.closest('.resize-handle')) {
         return;
     }

    isDragging = true;
    isResizing = false;
    event.preventDefault();

    const currentTransform = selectedElement.transform.baseVal.consolidate();
    const initialTranslateX = currentTransform ? currentTransform.matrix.e : 0;
    const initialTranslateY = currentTransform ? currentTransform.matrix.f : 0;

    startPoint = getSVGCoordinates(event);

    dragOffsetX = startPoint.x - initialTranslateX;
    dragOffsetY = startPoint.y - initialTranslateY;

    // Find the TextShape wrapper for frame functionality
    let textShape = null;
    if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
        textShape = shapes.find(shape => shape.shapeName === 'text' && shape.group === selectedElement);
    }

    if (textShape) {
        // Store initial frame state
        draggedShapeInitialFrameText = textShape.parentFrame || null;
        
        // Temporarily remove from frame clipping if dragging
        if (textShape.parentFrame) {
            textShape.parentFrame.temporarilyRemoveFromFrame(textShape);
        }
    }

    svg.style.cursor = 'grabbing';

    svg.addEventListener('pointermove', handleMouseMove);
    svg.addEventListener('pointerup', handleMouseUp);
}

function startResize(event, anchor) {
  if (!selectedElement || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();

  isResizing = true;
  isDragging = false;
  currentResizeHandle = anchor;

  const textElement = selectedElement.querySelector('text');
  if (!textElement) {
       isResizing = false;
       return;
  }

  startBBox = textElement.getBBox();
  startFontSize = parseFloat(textElement.getAttribute("font-size") || 30);
  if (isNaN(startFontSize)) startFontSize = 30;

  startPoint = getSVGCoordinates(event, selectedElement);

  // Freeze the group's screen CTM at resize start so mouse→local mapping stays stable
  const groupScreenCTM = selectedElement.getScreenCTM();
  initialInverseScreenCTM = groupScreenCTM ? groupScreenCTM.inverse() : null;

  const currentTransform = selectedElement.transform.baseVal.consolidate();
  const matrix = currentTransform?.matrix;
  initialGroupMatrix = matrix ? {
    a: matrix.a, b: matrix.b, c: matrix.c,
    d: matrix.d, e: matrix.e, f: matrix.f,
  } : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  initialGroupTx = initialGroupMatrix.e;
  initialGroupTy = initialGroupMatrix.f;

  resizePadding = 8 / (window.currentZoom || 1);
  const startX = startBBox.x - resizePadding;
  const startY = startBBox.y - resizePadding;
  const startWidth = startBBox.width + 2 * resizePadding;
  const startHeight = startBBox.height + 2 * resizePadding;

  let hx = startX;
  let hy = startY;
  if (anchor.includes('e')) { hx = startX + startWidth; }
  if (anchor.includes('s')) { hy = startY + startHeight; }
  initialHandlePosRelGroup = { x: hx, y: hy };

  let fx = startX + startWidth;
  let fy = startY + startHeight;
  if (anchor.includes('e')) { fx = startX; }
  if (anchor.includes('s')) { fy = startY; }
  initialFixedHandlePosRelGroup = { x: fx, y: fy };

  const handlePoint = svg.createSVGPoint();
  handlePoint.x = hx;
  handlePoint.y = hy;
  const handleScreen = groupScreenCTM
    ? handlePoint.matrixTransform(groupScreenCTM)
    : { x: event.clientX, y: event.clientY };
  resizePointerOffsetScreen = {
    x: event.clientX - handleScreen.x,
    y: event.clientY - handleScreen.y,
  };

  svg.style.cursor = resizeHandles[anchor]?.style.cursor || 'default';

  svg.addEventListener('pointermove', handleMouseMove);
  svg.addEventListener('pointerup', handleMouseUp);
}


const handleMouseMove = (event) => {
    if (!selectedElement) return;
    event.preventDefault();

    // Keep lastMousePos in screen coordinates for other functions
    const svgRect = svg.getBoundingClientRect();
    lastMousePos = {
        x: event.clientX - svgRect.left, 
        y: event.clientY - svgRect.top
    };

    if (isDragging) {
        const currentPoint = getSVGCoordinates(event);
        const newTranslateX = currentPoint.x - dragOffsetX;
        const newTranslateY = currentPoint.y - dragOffsetY;

        const currentTransform = selectedElement.transform.baseVal.consolidate();
        if (currentTransform) {
            const matrix = currentTransform.matrix;
            const angle = Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;

            const textElement = selectedElement.querySelector('text');
            if (textElement) {
                const bbox = textElement.getBBox();
                const centerX = bbox.x + bbox.width / 2;
                const centerY = bbox.y + bbox.height / 2;

                selectedElement.setAttribute('transform',
                    `translate(${newTranslateX}, ${newTranslateY}) rotate(${angle}, ${centerX}, ${centerY})`
                );
            } else {
                selectedElement.setAttribute('transform', `translate(${newTranslateX}, ${newTranslateY})`);
            }
        } else {
            selectedElement.setAttribute('transform', `translate(${newTranslateX}, ${newTranslateY})`);
        }

        // Update frame containment for TextShape wrapper
        if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
            const textShape = shapes.find(shape => shape.shapeName === 'text' && shape.group === selectedElement);
            if (textShape) {
                textShape.updateFrameContainment();
            }
        }

        // Update attached arrows during dragging
        updateAttachedArrows(selectedElement);

    } else if (isResizing) {
        const textElement = selectedElement.querySelector('text');
        if (!textElement || !startBBox || startFontSize === null || !startPoint ||
            !initialHandlePosRelGroup || !initialFixedHandlePosRelGroup || !initialGroupMatrix) return;

        // Use the frozen initial CTM so the mapping doesn't shift as we change the group transform
        let currentPoint;
        if (initialInverseScreenCTM) {
            const pt = svg.createSVGPoint();
            pt.x = event.clientX - (resizePointerOffsetScreen?.x || 0);
            pt.y = event.clientY - (resizePointerOffsetScreen?.y || 0);
            currentPoint = pt.matrixTransform(initialInverseScreenCTM);
        } else {
            currentPoint = getSVGCoordinates({
                clientX: event.clientX - (resizePointerOffsetScreen?.x || 0),
                clientY: event.clientY - (resizePointerOffsetScreen?.y || 0),
            }, selectedElement);
        }

        const startWidth = startBBox.width;
        const startHeight = startBBox.height;
        const directionX = currentResizeHandle.includes('e') ? 1 : -1;
        const directionY = currentResizeHandle.includes('s') ? 1 : -1;
        const desiredWidth = directionX * (currentPoint.x - initialFixedHandlePosRelGroup.x) - 2 * resizePadding;
        const desiredHeight = directionY * (currentPoint.y - initialFixedHandlePosRelGroup.y) - 2 * resizePadding;
        const denominator = startWidth * startWidth + startHeight * startHeight;
        const chosenScale = denominator > 0
            ? (startWidth * desiredWidth + startHeight * desiredHeight) / denominator
            : 1;

        const minScale = 0.1;
        const maxScale = 10.0;
        const clampedScale = Math.max(minScale, Math.min(chosenScale, maxScale));

        const newFontSize = startFontSize * clampedScale;
        const minFontSize = 5;
        const finalFontSize = Math.max(newFontSize, minFontSize);

        textElement.setAttribute("font-size", `${finalFontSize}px`);

        const currentBBox = textElement.getBBox();

        let newAnchorX, newAnchorY;

        switch (currentResizeHandle) {
            case 'nw':
                newAnchorX = currentBBox.x + currentBBox.width + resizePadding;
                newAnchorY = currentBBox.y + currentBBox.height + resizePadding;
                break;
            case 'ne':
                newAnchorX = currentBBox.x - resizePadding;
                newAnchorY = currentBBox.y + currentBBox.height + resizePadding;
                break;
            case 'sw':
                newAnchorX = currentBBox.x + currentBBox.width + resizePadding;
                newAnchorY = currentBBox.y - resizePadding;
                break;
            case 'se':
                newAnchorX = currentBBox.x - resizePadding;
                newAnchorY = currentBBox.y - resizePadding;
                break;
        }

        const deltaX = initialFixedHandlePosRelGroup.x - newAnchorX;
        const deltaY = initialFixedHandlePosRelGroup.y - newAnchorY;
        let newGroupTx = initialGroupMatrix.e + initialGroupMatrix.a * deltaX + initialGroupMatrix.c * deltaY;
        let newGroupTy = initialGroupMatrix.f + initialGroupMatrix.b * deltaX + initialGroupMatrix.d * deltaY;
        const matrixTransform = () => `matrix(${initialGroupMatrix.a} ${initialGroupMatrix.b} ${initialGroupMatrix.c} ${initialGroupMatrix.d} ${newGroupTx} ${newGroupTy})`;
        selectedElement.setAttribute('transform', matrixTransform());

        // Uniform font scaling cannot satisfy arbitrary x/y pointer movement
        // while also keeping the opposite corner perfectly fixed. Prefer the
        // user's dragged corner: correct the residual in parent coordinates so
        // the handle stays under the exact grab point at every zoom/rotation.
        const draggedX = currentBBox.x + (currentResizeHandle.includes('e') ? currentBBox.width + resizePadding : -resizePadding);
        const draggedY = currentBBox.y + (currentResizeHandle.includes('s') ? currentBBox.height + resizePadding : -resizePadding);
        const draggedPoint = svg.createSVGPoint();
        draggedPoint.x = draggedX;
        draggedPoint.y = draggedY;
        const resizedScreenCTM = selectedElement.getScreenCTM();
        const parentScreenCTM = selectedElement.parentNode?.getScreenCTM?.();
        if (resizedScreenCTM && parentScreenCTM) {
            const actualScreen = draggedPoint.matrixTransform(resizedScreenCTM);
            const parentInverse = parentScreenCTM.inverse();
            const targetScreenPoint = svg.createSVGPoint();
            targetScreenPoint.x = event.clientX - (resizePointerOffsetScreen?.x || 0);
            targetScreenPoint.y = event.clientY - (resizePointerOffsetScreen?.y || 0);
            const actualScreenPoint = svg.createSVGPoint();
            actualScreenPoint.x = actualScreen.x;
            actualScreenPoint.y = actualScreen.y;
            const targetParent = targetScreenPoint.matrixTransform(parentInverse);
            const actualParent = actualScreenPoint.matrixTransform(parentInverse);
            newGroupTx += targetParent.x - actualParent.x;
            newGroupTy += targetParent.y - actualParent.y;
            selectedElement.setAttribute('transform', matrixTransform());
        }

        // Update attached arrows during resizing
        updateAttachedArrows(selectedElement);

        clearTimeout(selectedElement.updateFeedbackTimeout);
        selectedElement.updateFeedbackTimeout = setTimeout(() => {
            updateSelectionFeedback();
            delete selectedElement.updateFeedbackTimeout;
        }, 0);

    } else if (isRotating) {
        const textElement = selectedElement.querySelector('text');
        if (!textElement) return;

        const bbox = textElement.getBBox();
        const centerX = bbox.x + bbox.width / 2;
        const centerY = bbox.y + bbox.height / 2;

        const mousePos = getSVGCoordinates(event);

        let centerPoint = svg.createSVGPoint();
        centerPoint.x = centerX;
        centerPoint.y = centerY;

        const groupTransform = selectedElement.transform.baseVal.consolidate();
        if (groupTransform) {
            centerPoint = centerPoint.matrixTransform(groupTransform.matrix);
        }

        const currentAngle = Math.atan2(mousePos.y - centerPoint.y, mousePos.x - centerPoint.x) * 180 / Math.PI;

        const rotationDiff = currentAngle - rotationStartAngle;

        const newTransform = `translate(${rotationStartTransform.e}, ${rotationStartTransform.f}) rotate(${rotationDiff}, ${centerX}, ${centerY})`;
        selectedElement.setAttribute('transform', newTransform);

        // Update attached arrows during rotation
        updateAttachedArrows(selectedElement);

        updateSelectionFeedback();
    }
};



const handleMouseUp = (event) => {
    if (event.button !== 0) return;

    if (isDragging && selectedElement) {
        const currentTransform = selectedElement.transform.baseVal.consolidate();
        if (currentTransform) {
            const finalTranslateX = currentTransform.matrix.e;
            const finalTranslateY = currentTransform.matrix.f;

            const initialX = parseFloat(selectedElement.getAttribute("data-x")) || 0;
            const initialY = parseFloat(selectedElement.getAttribute("data-y")) || 0;

            // Find the TextShape wrapper for frame tracking
            let textShape = null;
            if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
                textShape = shapes.find(shape => shape.shapeName === 'text' && shape.group === selectedElement);
            }

            // Add frame information for undo tracking
            const oldPosWithFrame = {
                x: initialX,
                y: initialY,
                rotation: extractRotationFromTransform(selectedElement) || 0,
                parentFrame: draggedShapeInitialFrameText
            };
            // Issue #34 bug #2: hoveredFrameText is the actual destination
            // tracked during drag — textShape.parentFrame is still the OLD
            // frame at this point.
            const newPosWithFrame = {
                x: finalTranslateX,
                y: finalTranslateY,
                rotation: extractRotationFromTransform(selectedElement) || 0,
                parentFrame: hoveredFrameText || null,
            };

            const stateChanged = initialX !== finalTranslateX || initialY !== finalTranslateY;
            const frameChanged = oldPosWithFrame.parentFrame !== newPosWithFrame.parentFrame;

            if (stateChanged || frameChanged) {
                pushTransformAction(
                    {
                        type: 'text',
                        element: selectedElement,
                        shapeName: 'text'
                    },
                    oldPosWithFrame,
                    newPosWithFrame
                );
            }

            // Handle frame containment changes after drag
            if (textShape) {
                const finalFrame = hoveredFrameText;
                
                // If shape moved to a different frame
                if (draggedShapeInitialFrameText !== finalFrame) {
                    // Remove from initial frame
                    if (draggedShapeInitialFrameText) {
                        draggedShapeInitialFrameText.removeShapeFromFrame(textShape);
                    }
                    
                    // Add to new frame
                    if (finalFrame) {
                        finalFrame.addShapeToFrame(textShape);
                    }
                    
                    // Track the frame change for undo
                    if (frameChanged) {
                        pushFrameAttachmentAction(finalFrame || draggedShapeInitialFrameText, textShape, 
                            finalFrame ? 'attach' : 'detach', draggedShapeInitialFrameText);
                    }
                } else if (draggedShapeInitialFrameText) {
                    // Shape stayed in same frame, restore clipping
                    draggedShapeInitialFrameText.restoreToFrame(textShape);
                }
            }

            selectedElement.setAttribute("data-x", finalTranslateX);
            selectedElement.setAttribute("data-y", finalTranslateY);
        }

        draggedShapeInitialFrameText = null;

    } else if (isResizing && selectedElement) {
        const textElement = selectedElement.querySelector('text');
        if (textElement) {
            const finalFontSize = textElement.getAttribute("font-size");
            const initialFontSize = startFontSize;

            const currentTransform = selectedElement.transform.baseVal.consolidate();
            if (currentTransform && initialFontSize !== parseFloat(finalFontSize)) {
                const finalTranslateX = currentTransform.matrix.e;
                const finalTranslateY = currentTransform.matrix.f;

                pushTransformAction(
                    {
                        type: 'text',
                        element: selectedElement,
                        shapeName: 'text'
                    },
                    {
                        x: initialGroupTx,
                        y: initialGroupTy,
                        fontSize: initialFontSize,
                        rotation: extractRotationFromTransform(selectedElement) || 0
                    },
                    {
                        x: finalTranslateX,
                        y: finalTranslateY,
                        fontSize: parseFloat(finalFontSize),
                        rotation: extractRotationFromTransform(selectedElement) || 0
                    }
                );

                selectedElement.setAttribute("data-x", finalTranslateX);
                selectedElement.setAttribute("data-y", finalTranslateY);
            }

            clearTimeout(selectedElement.updateFeedbackTimeout);
            updateSelectionFeedback();
        }
    } else if (isRotating && selectedElement) {
        const currentTransform = selectedElement.transform.baseVal.consolidate();
        if (currentTransform && rotationStartTransform) {
            const initialRotation = Math.atan2(rotationStartTransform.b, rotationStartTransform.a) * 180 / Math.PI;
            const finalRotation = extractRotationFromTransform(selectedElement) || 0;

            if (Math.abs(initialRotation - finalRotation) > 1) {
                pushTransformAction(
                    {
                        type: 'text',
                        element: selectedElement,
                        shapeName: 'text'
                    },
                    {
                        x: rotationStartTransform.e,
                        y: rotationStartTransform.f,
                        rotation: initialRotation
                    },
                    {
                        x: currentTransform.matrix.e,
                        y: currentTransform.matrix.f,
                        rotation: finalRotation
                    }
                );
            }

        }
        updateSelectionFeedback();
    }

    // Clear frame highlighting
    if (hoveredFrameText) {
        hoveredFrameText.removeHighlight();
        hoveredFrameText = null;
    }

    isDragging = false;
    isResizing = false;
    isRotating = false;
    currentResizeHandle = null;
    startPoint = null;
    startBBox = null;
    startFontSize = null;
    dragOffsetX = undefined;
    dragOffsetY = undefined;
    initialHandlePosRelGroup = null;
    initialFixedHandlePosRelGroup = null;
    resizePointerOffsetScreen = null;
    resizePadding = 0;
    initialGroupMatrix = null;
    initialGroupTx = 0;
    initialGroupTy = 0;
    rotationStartAngle = 0;
    rotationStartTransform = null;

    // Restore cursor based on context - keep pointer if over selected text
    svg.style.cursor = isSelectionToolActive ? 'default' : (isTextToolActive ? 'text' : 'default');

    // Ensure selection feedback is refreshed after transforms
    if (selectedElement) {
        setTimeout(updateSelectionFeedback, 0);
    }

    svg.removeEventListener('pointermove', handleMouseMove);
    svg.removeEventListener('pointerup', handleMouseUp);
    window.removeEventListener('pointermove', handleMouseMove);
    window.removeEventListener('pointerup', handleMouseUp);
};

function extractRotationFromTransform(element) {
    const currentTransform = element.transform.baseVal.consolidate();
    if (currentTransform) {
        const matrix = currentTransform.matrix;
        return Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
    }
    return 0;
}

// EXPORTED EVENT HANDLERS
const handleTextMouseDown = function (e) {
    if (!e.target) return;
    const activeEditor = document.querySelector("textarea.svg-text-editor");
    if (activeEditor && activeEditor.contains(e.target)) {
         return;
    }
    if (activeEditor && !activeEditor.contains(e.target)) {
         let textElement = activeEditor.originalTextElement;
         if (textElement) {
            // renderText switches to selection tool and auto-selects the text as a side effect.
            // Return early so we don't continue with stale tool state.
            renderText(activeEditor, textElement, true);
            return;
         } else if (document.body.contains(activeEditor)){
             document.body.removeChild(activeEditor);
         }
    }

    const targetGroup = e.target.closest('g[data-type="text-group"]');

    if (isSelectionToolActive && e.button === 0) {
        if (targetGroup) {
             if (e.target.closest('.resize-handle')) {
                 return;
             }

            // Double-click on selected text: enter edit mode
            if (e.detail >= 2 && targetGroup === selectedElement) {
                enterEditMode(targetGroup);
                e.stopPropagation();
                return;
            }

            if (targetGroup === selectedElement) {
                startDrag(e);
            } else {
                selectElement(targetGroup);
                startDrag(e);
            }
        } else {
            deselectElement();
        }

    } else if (isTextToolActive && e.button === 0) {
        if (targetGroup) {
            // Double-click: enter edit mode
            if (e.detail >= 2) {
                let textEl = targetGroup.querySelector('text');
                if (textEl) {
                    makeTextEditable(textEl, targetGroup);
                    e.stopPropagation();
                    return;
                }
            }
            // Single-click: select and drag (same as selection tool behavior)
            if (targetGroup === selectedElement) {
                startDrag(e);
            } else {
                selectElement(targetGroup);
                startDrag(e);
            }
        } else {
             deselectElement();
             addText(e);
        }
    }
};

function enterEditMode(groupElement) {
    const textEl = groupElement.querySelector('text');
    if (!textEl) return;

    // Switch to text tool with property panel (go through store to clear other flags)
    if (window.__sketchStoreApi) {
        window.__sketchStoreApi.setActiveTool('text');
    } else {
        window.isTextToolActive = true;
        window.isSelectionToolActive = false;
    }
    toolExtraPopup();

    // Deselect (removes selection feedback) then open editor
    deselectElement();
    makeTextEditable(textEl, groupElement);
}

const handleTextMouseMove = function (e) {
    // Keep lastMousePos in screen coordinates for other functions
    const svgRect = svg.getBoundingClientRect();
    lastMousePos = {
        x: e.clientX - svgRect.left, 
        y: e.clientY - svgRect.top
    };

    // Handle cursor changes for text tool
    if (isTextToolActive) {
        const targetGroup = e.target?.closest?.('g[data-type="text-group"]');
        if (targetGroup) {
            svg.style.cursor = 'pointer';
        } else {
            svg.style.cursor = 'crosshair';
        }
    } else if (isSelectionToolActive) {
        const targetGroup = e.target?.closest?.('g[data-type="text-group"]');
        if (targetGroup) {
            svg.style.cursor = 'default';
        }
    }

    // Check for frame containment while creating text
    if (isTextToolActive && !isDragging && !isResizing && !isRotating) {
        // Get current mouse position for frame highlighting preview
        const { x, y } = getSVGCoordinates(e);
        
        // Create temporary text bounds for frame checking
        const tempTextBounds = {
            x: x - 50,
            y: y - 20,
            width: 100,
            height: 40
        };
        
        if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
            shapes.forEach(frame => {
                if (frame.shapeName === 'frame') {
                    if (frame.isShapeInFrame(tempTextBounds)) {
                        frame.highlightFrame();
                        hoveredFrameText = frame;
                    } else if (hoveredFrameText === frame) {
                        frame.removeHighlight();
                        hoveredFrameText = null;
                    }
                }
            });
        }
    }
};

const handleTextMouseUp = function (e) {
    // Clear frame highlighting when done with text tool operations
    if (hoveredFrameText) {
        hoveredFrameText.removeHighlight();
        hoveredFrameText = null;
    }
};

// updateAttachedArrows is imported from drawArrow.js


textColorOptions.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation();
        textColorOptions.forEach((el) => el.classList.remove("selected"));
        span.classList.add("selected");

        const newColor = span.getAttribute("data-id");
        const oldColor = textColor;
        textColor = newColor;

        if (selectedElement) {
            const textElement = selectedElement.querySelector('text');
            if (textElement) {
                const currentColor = textElement.getAttribute('fill');

                if (currentColor !== newColor) {
                    pushOptionsChangeAction(
                        {
                            type: 'text',
                            element: selectedElement,
                            shapeName: 'text'
                        },
                        {
                            color: currentColor,
                            font: textElement.getAttribute('font-family'),
                            size: textElement.getAttribute('font-size'),
                            align: textElement.getAttribute('text-anchor')
                        },
                        {
                            color: newColor,
                            font: textElement.getAttribute('font-family'),
                            size: textElement.getAttribute('font-size'),
                            align: textElement.getAttribute('text-anchor')
                        }
                    );
                }

                textElement.setAttribute('fill', newColor);
            }
        }
    });
});

textFontOptions.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation();
        textFontOptions.forEach((el) => el.classList.remove("selected"));
        span.classList.add("selected");

        const newFont = span.getAttribute("data-id");
        const oldFont = textFont;
        textFont = newFont;

        if (selectedElement) {
            const textElement = selectedElement.querySelector('text');
            if (textElement) {
                const currentFont = textElement.getAttribute('font-family');

                if (currentFont !== newFont) {
                    pushOptionsChangeAction(
                        {
                            type: 'text',
                            element: selectedElement,
                            shapeName: 'text'
                        },
                        {
                            color: textElement.getAttribute('fill'),
                            font: currentFont,
                            size: textElement.getAttribute('font-size'),
                            align: textElement.getAttribute('text-anchor')
                        },
                        {
                            color: textElement.getAttribute('fill'),
                            font: newFont,
                            size: textElement.getAttribute('font-size'),
                            align: textElement.getAttribute('text-anchor')
                        }
                    );
                }

                textElement.setAttribute('font-family', newFont);
                setTimeout(updateSelectionFeedback, 0);
            }
        }
    });
});

textSizeOptions.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation();
        textSizeOptions.forEach((el) => el.classList.remove("selected"));
        span.classList.add("selected");

        const newSize = span.getAttribute("data-id") + "px";
        const oldSize = textSize;
        textSize = newSize;

        if (selectedElement) {
            const textElement = selectedElement.querySelector('text');
            if (textElement) {
                const currentSize = textElement.getAttribute('font-size');

                if (currentSize !== newSize) {
                    pushOptionsChangeAction(
                        {
                            type: 'text',
                            element: selectedElement,
                            shapeName: 'text'
                        },
                        {
                            color: textElement.getAttribute('fill'),
                            font: textElement.getAttribute('font-family'),
                            size: currentSize,
                            align: textElement.getAttribute('text-anchor')
                        },
                        {
                            color: textElement.getAttribute('fill'),
                            font: textElement.getAttribute('font-family'),
                            size: newSize,
                            align: textElement.getAttribute('text-anchor')
                        }
                    );
                }

                textElement.setAttribute('font-size', newSize);
                setTimeout(updateSelectionFeedback, 0);
            }
        }
    });
});

textAlignOptions.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation();
        textAlignOptions.forEach((el) => el.classList.remove("selected"));
        span.classList.add("selected");

        const newAlign = span.getAttribute("data-id");
        const oldAlign = textAlign;
        textAlign = newAlign;

        if (selectedElement) {
            const textElement = selectedElement.querySelector('text');
            if (textElement) {
                const currentAnchor = textElement.getAttribute('text-anchor');
                let newAnchor = 'start';
                if (newAlign === 'center') newAnchor = 'middle';
                else if (newAlign === 'right') newAnchor = 'end';

                if (currentAnchor !== newAnchor) {
                    pushOptionsChangeAction(
                        {
                            type: 'text',
                            element: selectedElement,
                            shapeName: 'text'
                        },
                        {
                            color: textElement.getAttribute('fill'),
                            font: textElement.getAttribute('font-family'),
                            size: textElement.getAttribute('font-size'),
                            align: currentAnchor
                        },
                        {
                            color: textElement.getAttribute('fill'),
                            font: textElement.getAttribute('font-family'),
                            size: textElement.getAttribute('font-size'),
                            align: newAnchor
                        }
                    );
                }

                textElement.setAttribute('text-anchor', newAnchor);
                setTimeout(updateSelectionFeedback, 0);
            }
        }
    });
});


// --- Code/Text Toggle Handler ---
const textCodeOptions = document.querySelectorAll(".textCodeSpan");
const languageSelector = document.getElementById("textLanguageSelector");
const codeLanguageSelect = document.getElementById("codeLanguageSelect");

textCodeOptions.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation();
        textCodeOptions.forEach((el) => el.classList.remove("selected"));
        span.classList.add("selected");

        const isCodeMode = span.getAttribute("data-id") === "true";
        isTextInCodeMode = isCodeMode;

        // Show/hide language selector
        if (languageSelector) {
            languageSelector.classList.toggle("hidden", !isCodeMode);
        }

        // Update tool flags
        if (isTextToolActive) {
            isCodeToolActive = isCodeMode;
        }

        // If a shape is selected, convert it
        if (isCodeMode && selectedElement) {
            // Convert text → code
            convertTextToCode(selectedElement);
        } else if (!isCodeMode && getSelectedCodeBlock()) {
            // Convert code → text
            convertCodeToText(getSelectedCodeBlock());
        }
    });
});

// Language selector handler
if (codeLanguageSelect) {
    codeLanguageSelect.addEventListener("change", (event) => {
        const lang = event.target.value;
        setCodeLanguage(lang);

        // If a code block is selected, re-highlight it with the new language
        const selectedCode = getSelectedCodeBlock();
        if (selectedCode) {
            const codeElement = selectedCode.querySelector('text');
            if (codeElement) {
                codeElement.setAttribute("data-language", lang);
                // Re-render with new language highlighting
                const content = extractTextFromCodeElement(codeElement);
                while (codeElement.firstChild) {
                    codeElement.removeChild(codeElement.firstChild);
                }
                const highlighted = applySyntaxHighlightingToSVG(content, lang);
                createHighlightedSVGText(highlighted, codeElement);
                updateCodeBackground(selectedCode, codeElement);
            }
        }
    });
}

function convertTextToCode(textGroupElement) {
    const textElement = textGroupElement.querySelector('text');
    if (!textElement) return;

    // Get text content
    let textContent = "";
    const tspans = textElement.querySelectorAll('tspan');
    if (tspans.length > 0) {
        tspans.forEach((tspan, index) => {
            textContent += tspan.textContent;
            if (index < tspans.length - 1) textContent += "\n";
        });
    } else {
        textContent = textElement.textContent || "";
    }

    // Get position from transform
    const currentTransform = textGroupElement.transform.baseVal.consolidate();
    const tx = currentTransform ? currentTransform.matrix.e : 0;
    const ty = currentTransform ? currentTransform.matrix.f : 0;
    const fontSize = textElement.getAttribute('font-size') || "25px";
    const color = textElement.getAttribute('fill') || "#fff";

    // Find and remove old TextShape from shapes array
    let oldTextShape = null;
    if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
        oldTextShape = shapes.find(s => s.shapeName === 'text' && s.group === textGroupElement);
        if (oldTextShape) {
            const idx = shapes.indexOf(oldTextShape);
            if (idx !== -1) shapes.splice(idx, 1);
        }
    }

    // Deselect current text
    deselectElement();

    // Remove old text group from SVG
    if (textGroupElement.parentNode) {
        textGroupElement.parentNode.removeChild(textGroupElement);
    }

    // Create new code block
    const gElement = document.createElementNS("http://www.w3.org/2000/svg", "g");
    gElement.setAttribute("data-type", "code-group");
    gElement.setAttribute("transform", `translate(${tx}, ${ty})`);

    const backgroundRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    backgroundRect.setAttribute("class", "code-background");
    backgroundRect.setAttribute("x", -10);
    backgroundRect.setAttribute("y", -10);
    backgroundRect.setAttribute("width", 300);
    backgroundRect.setAttribute("height", 60);
    backgroundRect.setAttribute("fill", "#161b22");
    backgroundRect.setAttribute("stroke", "#30363d");
    backgroundRect.setAttribute("stroke-width", "1");
    backgroundRect.setAttribute("rx", "6");
    backgroundRect.setAttribute("ry", "6");
    gElement.appendChild(backgroundRect);

    const codeElement = document.createElementNS("http://www.w3.org/2000/svg", "text");
    codeElement.setAttribute("x", 0);
    codeElement.setAttribute("y", 0);
    codeElement.setAttribute("fill", color);
    codeElement.setAttribute("font-size", fontSize);
    codeElement.setAttribute("font-family", "lixCode");
    codeElement.setAttribute("text-anchor", "start");
    codeElement.setAttribute("cursor", "default");
    codeElement.setAttribute("white-space", "pre");
    codeElement.setAttribute("dominant-baseline", "hanging");
    codeElement.setAttribute("data-language", getCodeLanguage());
    codeElement.setAttribute("data-type", "code");

    const shapeID = `code-${String(Date.now()).slice(0, 8)}-${Math.floor(Math.random() * 10000)}`;
    gElement.setAttribute("id", shapeID);
    gElement.setAttribute("data-x", tx);
    gElement.setAttribute("data-y", ty);
    codeElement.setAttribute("id", `${shapeID}-code`);
    gElement.appendChild(codeElement);
    svg.appendChild(gElement);

    // Apply syntax highlighting and add content
    if (textContent.trim()) {
        const lang = getCodeLanguage();
        const highlighted = applySyntaxHighlightingToSVG(textContent, lang);
        createHighlightedSVGText(highlighted, codeElement);
        updateCodeBackground(gElement, codeElement);
    }

    // Create CodeShape wrapper
    const codeShape = wrapCodeElement(gElement);
    if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
        shapes.push(codeShape);
    }

    // Push undo action for mode conversion
    pushModeConvertAction(oldTextShape, textGroupElement, 'text', codeShape, gElement, 'code');

    // Select the new code block
    selectCodeBlock(gElement);
}

function convertCodeToText(codeGroupElement) {
    const codeElement = codeGroupElement.querySelector('text');
    if (!codeElement) return;

    // Get text content
    const textContent = extractTextFromCodeElement(codeElement);

    // Get position from transform
    const currentTransform = codeGroupElement.transform.baseVal.consolidate();
    const tx = currentTransform ? currentTransform.matrix.e : 0;
    const ty = currentTransform ? currentTransform.matrix.f : 0;
    const fontSize = codeElement.getAttribute('font-size') || "30px";
    const color = codeElement.getAttribute('fill') || "#fff";

    // Find and remove old CodeShape from shapes array
    let oldCodeShape = null;
    if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
        oldCodeShape = shapes.find(s => s.shapeName === 'code' && s.group === codeGroupElement);
        if (oldCodeShape) {
            const idx = shapes.indexOf(oldCodeShape);
            if (idx !== -1) shapes.splice(idx, 1);
        }
    }

    // Deselect current code block
    deselectCodeBlock();

    // Remove old code group from SVG
    if (codeGroupElement.parentNode) {
        codeGroupElement.parentNode.removeChild(codeGroupElement);
    }

    // Create new text shape
    const gElement = document.createElementNS("http://www.w3.org/2000/svg", "g");
    gElement.setAttribute("data-type", "text-group");
    gElement.setAttribute("transform", `translate(${tx}, ${ty})`);

    const textElement = document.createElementNS("http://www.w3.org/2000/svg", "text");
    textElement.setAttribute("x", 0);
    textElement.setAttribute("y", 0);
    textElement.setAttribute("fill", color);
    textElement.setAttribute("font-size", fontSize);
    textElement.setAttribute("font-family", textFont);
    textElement.setAttribute("text-anchor", "start");
    textElement.setAttribute("cursor", "default");
    textElement.setAttribute("white-space", "pre");
    textElement.setAttribute("dominant-baseline", "hanging");
    textElement.setAttribute("data-type", "text");

    const shapeID = `text-${String(Date.now()).slice(0, 8)}-${Math.floor(Math.random() * 10000)}`;
    gElement.setAttribute("id", shapeID);
    gElement.setAttribute("data-x", tx);
    gElement.setAttribute("data-y", ty);
    textElement.setAttribute("id", `${shapeID}-text`);
    gElement.appendChild(textElement);
    svg.appendChild(gElement);

    // Add text content as tspans
    if (textContent.trim()) {
        const lines = textContent.split("\n");
        const x = textElement.getAttribute("x") || 0;
        lines.forEach((line, index) => {
            const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
            tspan.setAttribute("x", x);
            tspan.setAttribute("dy", index === 0 ? "0" : "1.2em");
            tspan.textContent = line || " ";
            textElement.appendChild(tspan);
        });
    }

    // Create TextShape wrapper
    const textShape = wrapTextElement(gElement);
    if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
        shapes.push(textShape);
    }

    // Push undo action for mode conversion
    pushModeConvertAction(oldCodeShape, codeGroupElement, 'code', textShape, gElement, 'text');

    // Select the new text shape
    selectElement(gElement);
}

function pushModeConvertAction(oldShape, oldElement, oldType, newShape, newElement, newType) {
    pushCreateAction({
        type: 'modeConvert',
        oldShape: oldShape,
        oldElement: oldElement,
        oldType: oldType,
        newShape: newShape,
        newElement: newElement,
        newType: newType,
        element: newShape,
        shapeName: newType
    });
}

// Update toggle state when a shape is selected
function updateCodeToggleForShape(shapeName) {
    const isCode = shapeName === 'code';
    textCodeOptions.forEach(el => el.classList.remove("selected"));
    textCodeOptions.forEach(el => {
        if ((el.getAttribute("data-id") === "true") === isCode) {
            el.classList.add("selected");
        }
    });
    if (languageSelector) {
        languageSelector.classList.toggle("hidden", !isCode);
    }
    // Update the language dropdown to match the selected code block
    if (isCode && codeLanguageSelect) {
        const selectedCode = getSelectedCodeBlock();
        if (selectedCode) {
            const codeEl = selectedCode.querySelector('text');
            const lang = codeEl?.getAttribute("data-language") || "auto";
            codeLanguageSelect.value = lang;
        }
    }
}

// React sidebar bridge — update currently selected text/code shape
window.updateSelectedTextStyle = function(changes) {
    const el = selectedElement || (window.currentShape && window.currentShape.shapeName === 'text' ? window.currentShape.group : null);
    if (!el) return;
    const textElement = el.querySelector('text');
    if (!textElement) return;

    if (changes.color) {
        textElement.setAttribute('fill', changes.color);
        textColor = changes.color;
    }
    if (changes.font) {
        textElement.setAttribute('font-family', changes.font);
        textFont = changes.font;
    }
    if (changes.fontSize) {
        textElement.setAttribute('font-size', changes.fontSize);
        textSize = changes.fontSize;
    }
};

// Expose select/deselect for external callers (Selection.js, TextShape.selectShape)
window.__deselectTextElement = deselectElement;
window.__selectTextElement = selectElement;

// React sidebar bridge — text ↔ code conversion
window.__convertTextToCode = function() {
    if (selectedElement && selectedElement.getAttribute('data-type') === 'text-group') {
        convertTextToCode(selectedElement);
    }
};
window.__convertCodeToText = function() {
    // Try codeTool's selectedCodeBlock first, then check textTool's selectedElement
    let codeBlock = getSelectedCodeBlock();
    if (!codeBlock && selectedElement && selectedElement.getAttribute('data-type') === 'code-group') {
        codeBlock = selectedElement;
    }
    if (codeBlock) {
        convertCodeToText(codeBlock);
    }
};
window.__setCodeLanguage = function(lang) {
    setCodeLanguage(lang);
    // Re-highlight selected code block with new language
    const selectedCode = getSelectedCodeBlock();
    if (selectedCode) {
        const codeElement = selectedCode.querySelector('text');
        if (codeElement) {
            codeElement.setAttribute('data-language', lang);
            const textContent = extractTextFromCodeElement(codeElement);
            // Clear and re-highlight
            while (codeElement.firstChild) codeElement.removeChild(codeElement.firstChild);
            const highlighted = applySyntaxHighlightingToSVG(textContent, lang);
            createHighlightedSVGText(highlighted, codeElement);
            updateCodeBackground(selectedCode, codeElement);
        }
    }
};

export { handleTextMouseDown, handleTextMouseMove, handleTextMouseUp, updateCodeToggleForShape, deselectElement as deselectTextElement, enterEditMode };
