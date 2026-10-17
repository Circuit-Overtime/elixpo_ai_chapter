/* eslint-disable */
// Icon tool event handlers - extracted from icons.js
import { pushCreateAction, pushDeleteAction, pushTransformAction, pushFrameAttachmentAction } from '../core/UndoRedo.js';
import { updateAttachedArrows as updateArrowsForShape, cleanupAttachments } from './arrowTool.js';
import { registerRotationAnchor } from '../core/ScreenSpaceControls.js';


let isDraggingIcon = false;
let iconToPlace = null;
let iconX = 0;
let iconY = 0;
let scaleFactor = 0.2;
let currentIconElement = null;

let selectedIcon = null;
let originalX, originalY, originalWidth, originalHeight;
let currentAnchor = null;
let isDragging = false;
let isRotatingIcon = false;
let dragOffsetX, dragOffsetY;
let startRotationMouseAngle = null;
let startIconRotation = null;
let iconRotation = 0;
let aspect_ratio_lock = true;
const minIconSize = 25;
const miniatureSize = 40;
const placedIconSize = 40;
let draggedShapeInitialFrameIcon = null;
let hoveredFrameIcon = null;
let _pendingDragChecker = null; // module-level ref so cancelDragPrep can remove it

const iconSearchInput = document.getElementById('iconSearchInput') || document.createElement('input');
let searchTimeout = null;


function getSVGElement() {
    return document.getElementById('freehand-canvas');
}


function removeSelection() {
    const svg = getSVGElement();
    if (!svg) return;

    // Remove ALL selection outlines (prevents orphaned ghost elements)
    svg.querySelectorAll(".selection-outline").forEach(el => el.remove());

    removeResizeAnchors();
    removeRotationAnchor();

    if (selectedIcon) {
        selectedIcon.removeEventListener('pointerdown', startDrag);
        selectedIcon.removeEventListener('pointerup', stopDrag);
        selectedIcon.removeEventListener('pointerleave', stopDrag);
    }
}

function wrapIconElement(element) {
    const iconShape = new IconShape(element);
    return iconShape;
}

document.getElementById("importIcon")?.addEventListener('click', () => {
    

    const iconContainer = document.getElementById('iconsToolBar');
    if (iconContainer) {
        if(iconContainer.classList.contains('hidden')) {
            iconContainer.classList.remove('hidden');
            iconSearchInput.focus();
        }
        else 
        {
            iconContainer.classList.add('hidden');
        }
        
    }
});

function getSVGCoordsFromMouse(e) {
    const svg = getSVGElement();
    const viewBox = svg.viewBox.baseVal;
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const svgX = viewBox.x + (mouseX / rect.width) * viewBox.width;
    const svgY = viewBox.y + (mouseY / rect.height) * viewBox.height;
    return { x: svgX, y: svgY };
}

const handleMouseMoveIcon = (e) => {
    if (!isDraggingIcon || !iconToPlace || !isIconToolActive) return;

    const { x, y } = getSVGCoordsFromMouse(e);
    iconX = x;
    iconY = y;

    drawMiniatureIcon();

    if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
        shapes.forEach(frame => {
            if (frame.shapeName === 'frame') {
                const tempIconBounds = {
                    x: iconX - 50,
                    y: iconY - 50,
                    width: 100,
                    height: 100
                };

                if (frame.isShapeInFrame(tempIconBounds)) {
                    frame.highlightFrame();
                    hoveredFrameIcon = frame;
                    if (window.__iconShapeState) window.__iconShapeState.hoveredFrameIcon = frame;
                } else if (hoveredFrameIcon === frame) {
                    frame.removeHighlight();
                    hoveredFrameIcon = null;
                    if (window.__iconShapeState) window.__iconShapeState.hoveredFrameIcon = null;
                }
            }
        });
    }
};

const drawMiniatureIcon = () => {
    if (!isDraggingIcon || !iconToPlace || !isIconToolActive) return;

    const svg = getSVGElement();
    if (!svg) {
        console.error('SVG element not found for miniature icon');
        return;
    }

    if (currentIconElement) {
        svg.removeChild(currentIconElement);
        currentIconElement = null;
    }

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = iconToPlace;
    const svgElement = tempDiv.querySelector('svg');

    if (svgElement) {
        const iconGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");

        const viewBox = svgElement.getAttribute('viewBox');
        let vbWidth = 24, vbHeight = 24;

        if (viewBox) {
            const [, , widthStr, heightStr] = viewBox.split(/\s+/);
            vbWidth = parseFloat(widthStr) || 24;
            vbHeight = parseFloat(heightStr) || 24;
        } else {
            const width = svgElement.getAttribute('width');
            const height = svgElement.getAttribute('height');
            if (width && height) {
                vbWidth = parseFloat(width) || 24;
                vbHeight = parseFloat(height) || 24;
            }
        }

        const scale = miniatureSize / Math.max(vbWidth, vbHeight);
        iconGroup.setAttribute("transform", `translate(${iconX - miniatureSize / 2}, ${iconY - miniatureSize / 2}) scale(${scale})`);

        const allChildren = svgElement.children;
        for (let i = 0; i < allChildren.length; i++) {
            const clonedChild = allChildren[i].cloneNode(true);
            
            const applyGrayStyle = (element) => {
                if (element.nodeType === 1) {
                    element.setAttribute('fill', '#666');
                    element.setAttribute('stroke', '#666');
                    
                    for (let j = 0; j < element.children.length; j++) {
                        applyGrayStyle(element.children[j]);
                    }
                }
            };
            
            applyGrayStyle(clonedChild);
            iconGroup.appendChild(clonedChild);
        }

        iconGroup.setAttribute("style", "pointer-events: none; opacity: 0.7;");
        iconGroup.setAttribute("class", "miniature-icon");

        currentIconElement = iconGroup;
        svg.appendChild(currentIconElement);
    }
};

const handleMouseDownIcon = async (e) => {
    if (!e.target) return;
    if (isSelectionToolActive) {
        const clickedIcon = e.target.closest('[type="icon"]');
        if (clickedIcon) {
            e.preventDefault();
            e.stopPropagation();

            if (selectedIcon === clickedIcon) {
                originalX = parseFloat(selectedIcon.getAttribute('x')) || 0;
                originalY = parseFloat(selectedIcon.getAttribute('y')) || 0;
                originalWidth = parseFloat(selectedIcon.getAttribute('width')) || placedIconSize;
                originalHeight = parseFloat(selectedIcon.getAttribute('height')) || placedIconSize;

                const { x, y } = getSVGCoordsFromMouse(e);
                dragOffsetX = x - originalX;
                dragOffsetY = y - originalY;

                const initialMouseX = x;
                const initialMouseY = y;

                // Threshold in screen pixels converted to SVG units, so zoom doesn't affect sensitivity
                const svgEl = getSVGElement();
                const svgRect2 = svgEl ? svgEl.getBoundingClientRect() : { width: 1536 };
                const svgViewW = svgEl ? svgEl.viewBox.baseVal.width : 1536;
                const dragThreshold = 12 * (svgViewW / svgRect2.width); // ~12 screen pixels

                function checkDragStartWithThreshold(moveEvent) {
                    const { x: currentX, y: currentY } = getSVGCoordsFromMouse(moveEvent);
                    const deltaX = Math.abs(currentX - initialMouseX);
                    const deltaY = Math.abs(currentY - initialMouseY);

                    if (deltaX > dragThreshold || deltaY > dragThreshold) {
                        document.removeEventListener('pointermove', checkDragStartWithThreshold);
                        document.removeEventListener('pointerup', cancelDragPrep);
                        window.removeEventListener('pointerup', cancelDragPrep);

                        const svg = getSVGElement();
                        if (svg) svg.removeEventListener('pointerup', cancelDragPrep);

                        startDrag(moveEvent);
                    }
                }

                _pendingDragChecker = checkDragStartWithThreshold;
                document.addEventListener('pointermove', checkDragStartWithThreshold);
                document.addEventListener('pointerup', cancelDragPrep);
                window.addEventListener('pointerup', cancelDragPrep);

                const svg = getSVGElement();
                if (svg) svg.addEventListener('pointerup', cancelDragPrep);

                return;
            } else {
                selectIcon(e);
                return;
            }
        }

        // Clicked on empty canvas while an icon is selected — deselect it
        if (selectedIcon) {
            removeSelection();
            selectedIcon = null;
            if (currentShape && currentShape.shapeName === 'icon') {
                currentShape = null;
            }
        }
        return;
    }

// Helper to get inherited attribute from the SVG sub-tree
function getInheritedAttr(element, attrName) {
    let curr = element;
    while (curr && curr.nodeType === 1) {
        if (curr.getAttribute(attrName)) {
            return curr.getAttribute(attrName);
        }
        curr = curr.parentElement;
    }
    return null;
}

    if (!isDraggingIcon || !iconToPlace || !isIconToolActive) {
        return;
    }

    let placedIconShape = null;

    try {
        const svg = getSVGElement();
        if (!svg) {
            throw new Error('SVG element not found');
        }

        if (currentIconElement) {
            svg.removeChild(currentIconElement);
            currentIconElement = null;
        }

        const { x: placedX, y: placedY } = getSVGCoordsFromMouse(e);

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = iconToPlace;
        const originalSvgElement = tempDiv.querySelector('svg');

        if (!originalSvgElement) {
            throw new Error('Invalid SVG content');
        }

        const finalIconGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        const finalX = placedX - placedIconSize / 2;
        const finalY = placedY - placedIconSize / 2;

        const viewBox = originalSvgElement.getAttribute('viewBox');
        let vbWidth = 24, vbHeight = 24;

        if (viewBox) {
            const [, , widthStr, heightStr] = viewBox.split(/\s+/);
            vbWidth = parseFloat(widthStr) || 24;
            vbHeight = parseFloat(heightStr) || 24;
        } else {
            const width = originalSvgElement.getAttribute('width');
            const height = originalSvgElement.getAttribute('height');
            if (width && height) {
                vbWidth = parseFloat(width) || 24;
                vbHeight = parseFloat(height) || 24;
            }
        }

        const scale = placedIconSize / Math.max(vbWidth, vbHeight);
        const localCenterX = placedIconSize / 2 / scale;
        const localCenterY = placedIconSize / 2 / scale;
        finalIconGroup.setAttribute('transform', `translate(${finalX}, ${finalY}) scale(${scale}) rotate(0, ${localCenterX}, ${localCenterY})`);
        finalIconGroup.setAttribute('data-viewbox-width', vbWidth);
        finalIconGroup.setAttribute('data-viewbox-height', vbHeight);

        const backgroundRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        backgroundRect.setAttribute('x', 0);
        backgroundRect.setAttribute('y', 0);
        backgroundRect.setAttribute('width', vbWidth);
        backgroundRect.setAttribute('height', vbHeight);
        backgroundRect.setAttribute('fill', 'transparent');
        backgroundRect.setAttribute('stroke', 'none');
        backgroundRect.setAttribute('style', 'pointer-events: all; cursor: pointer;');
        finalIconGroup.appendChild(backgroundRect);

        const isDark = document.body && document.body.classList.contains('theme-dark');
        const targetDarkColor = '#1a1a2e';
        const bgDarkColor = '#15111f';

        const applyThemeStyle = (element) => {
            if (element.nodeType === 1) {
                const fill = getInheritedAttr(element, 'fill');
                const stroke = getInheritedAttr(element, 'stroke');

                const normFill = fill ? fill.toLowerCase().trim() : null;
                const normStroke = stroke ? stroke.toLowerCase().trim() : null;

                // Handle fill
                if (normFill === 'none' || normFill === 'transparent') {
                    element.setAttribute('fill', 'none');
                } else if (!normFill || ['#000', '#000000', 'black', 'currentcolor', '#1a1a2e'].includes(normFill)) {
                    element.setAttribute('fill', isDark ? '#ffffff' : targetDarkColor);
                } else if (['#fff', '#ffffff', 'white', '#15111f'].includes(normFill)) {
                    element.setAttribute('fill', isDark ? bgDarkColor : '#ffffff');
                }

                // Handle stroke
                if (normStroke === 'none' || normStroke === 'transparent') {
                    element.setAttribute('stroke', 'none');
                } else if (normStroke && ['#000', '#000000', 'black', 'currentcolor', '#1a1a2e'].includes(normStroke)) {
                    element.setAttribute('stroke', isDark ? '#ffffff' : targetDarkColor);
                } else if (normStroke && ['#fff', '#ffffff', 'white', '#15111f'].includes(normStroke)) {
                    element.setAttribute('stroke', isDark ? bgDarkColor : '#ffffff');
                }

                for (let j = 0; j < element.children.length; j++) {
                    applyThemeStyle(element.children[j]);
                }
            }
        };

        // Apply theme styles to original elements while they are still in context
        for (let i = 0; i < originalSvgElement.children.length; i++) {
            applyThemeStyle(originalSvgElement.children[i]);
        }

        const allChildren = originalSvgElement.children;
        for (let i = 0; i < allChildren.length; i++) {
            const clonedChild = allChildren[i].cloneNode(true);
            finalIconGroup.appendChild(clonedChild);
        }

        finalIconGroup.setAttribute('x', finalX);
        finalIconGroup.setAttribute('y', finalY);
        finalIconGroup.setAttribute('width', placedIconSize);
        finalIconGroup.setAttribute('height', placedIconSize);
        finalIconGroup.setAttribute('type', 'icon');
        finalIconGroup.setAttribute('data-shape-x', finalX);
        finalIconGroup.setAttribute('data-shape-y', finalY);
        finalIconGroup.setAttribute('data-shape-width', placedIconSize);
        finalIconGroup.setAttribute('data-shape-height', placedIconSize);
        finalIconGroup.setAttribute('data-shape-rotation', 0);
        finalIconGroup.shapeID = `icon-${String(Date.now()).slice(0, 8)}-${Math.floor(Math.random() * 10000)}`;
        finalIconGroup.setAttribute('id', finalIconGroup.shapeID);
        finalIconGroup.setAttribute('style', 'cursor: pointer; pointer-events: all;');

        svg.appendChild(finalIconGroup);

        const iconShape = wrapIconElement(finalIconGroup);
        placedIconShape = iconShape;

        if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
            // Prevent duplicates — check if this element is already tracked
            const alreadyExists = shapes.some(s => s.shapeName === 'icon' && s.element === finalIconGroup);
            if (!alreadyExists) {
                shapes.push(iconShape);
            }
        }

        const finalFrame = hoveredFrameIcon;
        if (finalFrame) {
            finalFrame.addShapeToFrame(iconShape);
            pushFrameAttachmentAction(finalFrame, iconShape, 'attach', null);
        }

        pushCreateAction(iconShape);

        // mousedown handles selection; click listener removed to avoid double-selection conflicts

        if (hoveredFrameIcon) {
            hoveredFrameIcon.removeHighlight();
            hoveredFrameIcon = null;
            if (window.__iconShapeState) window.__iconShapeState.hoveredFrameIcon = null;
        }

        console.log('Icon placed successfully:', finalIconGroup);

    } catch (error) {
        console.error("Error placing icon:", error);
        isDraggingIcon = false;
        iconToPlace = null;
    } finally {
        isDraggingIcon = false;
        iconToPlace = null;
        document.body.style.cursor = 'default';
    }

    // Select the placed icon but stay in icon tool so the sidebar remains open
    if (placedIconShape) {
        currentShape = placedIconShape;
        currentShape.isSelected = true;
        requestAnimationFrame(() => {
            placedIconShape.selectShape();
        });
    }
};

const handleMouseUpIcon = (e) => {
    if (!e.target) return;
    // Deselection on empty-canvas click is handled by handleMouseDownIcon.
    // We intentionally do NOT deselect on mouseup — after a drag the cursor
    // often ends up on the background, and that shouldn't kill the selection.

    if (hoveredFrameIcon) {
        hoveredFrameIcon.removeHighlight();
        hoveredFrameIcon = null;
    }
};

function addSelectionOutline() {
    if (!selectedIcon) return;

    const svg = getSVGElement();
    if (!svg) return;

    // Use stored SVG-space data attributes — reliable even immediately after DOM insertion
    const x = parseFloat(selectedIcon.getAttribute('data-shape-x')) || 0;
    const y = parseFloat(selectedIcon.getAttribute('data-shape-y')) || 0;
    const width = parseFloat(selectedIcon.getAttribute('data-shape-width')) || 40;
    const height = parseFloat(selectedIcon.getAttribute('data-shape-height')) || 40;
    const rotation = parseFloat(selectedIcon.getAttribute('data-shape-rotation')) || 0;

    const centerX = x + width / 2;
    const centerY = y + height / 2;

    const zoom = window.currentZoom || 1;
    const selectionPadding = 8 / zoom;
    const expandedX = x - selectionPadding;
    const expandedY = y - selectionPadding;
    const expandedWidth = width + 2 * selectionPadding;
    const expandedHeight = height + 2 * selectionPadding;

    removeSelection();

    const outline = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    outline.setAttribute("x", expandedX);
    outline.setAttribute("y", expandedY);
    outline.setAttribute("width", expandedWidth);
    outline.setAttribute("height", expandedHeight);
    outline.setAttribute("fill", "none");
    outline.setAttribute("stroke", "#5B57D1");
    outline.setAttribute("stroke-width", 1.5);
    outline.setAttribute("stroke-dasharray", "4 2");
    outline.setAttribute("vector-effect", "non-scaling-stroke");
    outline.setAttribute("style", "pointer-events: none;");
    outline.setAttribute("class", "selection-outline");
    if (rotation !== 0) {
        outline.setAttribute("transform", `rotate(${rotation}, ${centerX}, ${centerY})`);
    }

    svg.appendChild(outline);

    addResizeAnchors(expandedX, expandedY, expandedWidth, expandedHeight, centerX, centerY, width, rotation);
    addRotationAnchor(expandedX, expandedY, expandedWidth, expandedHeight, centerX, centerY, width, rotation);
}

function checkDragStart(event) {
    document.removeEventListener('pointermove', checkDragStart);
    document.removeEventListener('pointerup', cancelDragPrep);
    startDrag(event);
}
function cancelDragPrep(event) {
    if (_pendingDragChecker) {
        document.removeEventListener('pointermove', _pendingDragChecker);
        _pendingDragChecker = null;
    }
    document.removeEventListener('pointerup', cancelDragPrep);
    window.removeEventListener('pointerup', cancelDragPrep);

    const svg = getSVGElement();
    if (svg) {
        svg.removeEventListener('pointerup', cancelDragPrep);
    }
}

function startDrag(event) {
    console.log("start dragging icon");
    if (!isSelectionToolActive || !selectedIcon) return;
    
    isDragging = true;
    if (window.__iconShapeState) window.__iconShapeState.isDragging = true;

    let iconShape = null;
    if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
        iconShape = shapes.find(shape => shape.shapeName === 'icon' && shape.element === selectedIcon);
    }

    if (iconShape) {
        draggedShapeInitialFrameIcon = iconShape.parentFrame || null;

        if (iconShape.parentFrame) {
            iconShape.parentFrame.temporarilyRemoveFromFrame(iconShape);
        }
    }

    document.addEventListener('pointermove', dragIcon);
    document.addEventListener('pointerup', stopDrag);
    
    window.addEventListener('pointerup', stopDrag);
    
    const svg = getSVGElement();
    if (svg) {
        svg.addEventListener('pointerup', stopDrag);
    }
    
    document.addEventListener('dragstart', preventDefaultDrag);
    document.addEventListener('selectstart', preventDefaultDrag);
}

function preventDefaultDrag(e) {
    e.preventDefault();
    return false;
}

function selectIcon(event) {
    if (!isSelectionToolActive) return;

    event.stopPropagation();

    let targetIcon = event.target.closest ? event.target.closest('[type="icon"]') : null;
    if (!targetIcon) {
        let current = event.target;
        while (current && current !== document) {
            if (current.getAttribute && current.getAttribute('type') === 'icon') {
                targetIcon = current;
                break;
            }
            current = current.parentElement;
        }
    }

    // Always clean up previous selection before applying new one
    if (selectedIcon) {
        removeSelection();
    }

    selectedIcon = targetIcon;

    if (!selectedIcon) {
        console.warn('Could not find icon to select');
        return;
    }

    const transform = selectedIcon.getAttribute('transform');
    if (transform) {
        const rotateMatch = transform.match(/rotate\(([^,\s]+)/);
        if (rotateMatch) {
            iconRotation = parseFloat(rotateMatch[1]);
        }
    } else {
        iconRotation = 0;
    }

    addSelectionOutline();

    originalX = parseFloat(selectedIcon.getAttribute('x')) || 0;
    originalY = parseFloat(selectedIcon.getAttribute('y')) || 0;
    originalWidth = parseFloat(selectedIcon.getAttribute('width')) || placedIconSize;
    originalHeight = parseFloat(selectedIcon.getAttribute('height')) || placedIconSize;

    // Set currentShape so EventDispatcher routes subsequent events to icon handler
    const iconShape = (typeof shapes !== 'undefined' && Array.isArray(shapes))
        ? shapes.find(s => s.shapeName === 'icon' && s.element === selectedIcon)
        : null;
    if (iconShape) {
        currentShape = iconShape;
        currentShape.isSelected = true;
        if (window.__showSidebarForShape) window.__showSidebarForShape('icon');
    }
}

function addResizeAnchors(x, y, width, height, centerX, centerY, iconWidth, rotation) {
    const svg = getSVGElement();
    if (!svg) return;

    const zoom = window.currentZoom || 1;
    const anchorSize = 10 / zoom;
    const anchorStrokeWidth = 2;

    const positions = [
        { x: x, y: y, cursor: "nw-resize" },
        { x: x + width, y: y, cursor: "ne-resize" },
        { x: x, y: y + height, cursor: "sw-resize" },
        { x: x + width, y: y + height, cursor: "se-resize" }
    ];

    positions.forEach((pos) => {
        const anchor = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        anchor.setAttribute("x", pos.x - anchorSize / 2);
        anchor.setAttribute("y", pos.y - anchorSize / 2);
        anchor.setAttribute("width", anchorSize);
        anchor.setAttribute("height", anchorSize);
        anchor.setAttribute("fill", "#121212");
        anchor.setAttribute("stroke", "#5B57D1");
        anchor.setAttribute("stroke-width", anchorStrokeWidth);
        anchor.setAttribute("vector-effect", "non-scaling-stroke");
        anchor.setAttribute("class", "resize-anchor");
        anchor.setAttribute("transform", `rotate(${rotation}, ${centerX}, ${centerY})`);
        anchor.style.cursor = pos.cursor;

        svg.appendChild(anchor);

        anchor.addEventListener('pointerdown', startResize);
        anchor.addEventListener('pointerup', stopResize);
    });
}

function addRotationAnchor(x, y, width, height, centerX, centerY, iconWidth, rotation) {
    const svg = getSVGElement();
    if (!svg) return;

    const zoom = window.currentZoom || 1;
    const anchorRadius = 5 / zoom;
    const anchorStrokeWidth = 2;
    const rotationDistance = 30 / zoom;

    const rotationAnchorX = x + width / 2;
    const rotationAnchorY = y - rotationDistance;

    const rotationAnchor = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    rotationAnchor.setAttribute('cx', rotationAnchorX);
    rotationAnchor.setAttribute('cy', rotationAnchorY);
    rotationAnchor.setAttribute('r', anchorRadius);
    rotationAnchor.setAttribute('class', 'rotation-anchor');
    rotationAnchor.setAttribute('fill', '#121212');
    rotationAnchor.setAttribute('stroke', '#5B57D1');
    rotationAnchor.setAttribute('stroke-width', anchorStrokeWidth);
    rotationAnchor.setAttribute('vector-effect', 'non-scaling-stroke');
    rotationAnchor.setAttribute('style', 'pointer-events: all; cursor: grab;');
    rotationAnchor.setAttribute('transform', `rotate(${rotation}, ${centerX}, ${centerY})`);

    svg.appendChild(rotationAnchor);
    registerRotationAnchor(rotationAnchor, { radius: 5, edgeY: y });

    rotationAnchor.addEventListener('pointerdown', startRotation);
    rotationAnchor.addEventListener('pointerup', stopRotation);

    rotationAnchor.addEventListener('mouseover', function() {
        if (!isRotatingIcon && !isDragging) {
            rotationAnchor.style.cursor = 'grab';
        }
    });

    rotationAnchor.addEventListener('mouseout', function() {
        if (!isRotatingIcon && !isDragging) {
            rotationAnchor.style.cursor = 'default';
        }
    });
}

function removeRotationAnchor() {
    const svg = getSVGElement();
    if (!svg) return;

    svg.querySelectorAll(".rotation-anchor").forEach(el => el.remove());
}

function removeResizeAnchors() {
    const svg = getSVGElement();
    if (!svg) return;

    const anchors = svg.querySelectorAll(".resize-anchor");
    anchors.forEach(anchor => svg.removeChild(anchor));
}

function startResize(event) {
    event.preventDefault();
    event.stopPropagation();

    currentAnchor = event.target;

    originalX = parseFloat(selectedIcon.getAttribute('x')) || 0;
    originalY = parseFloat(selectedIcon.getAttribute('y')) || 0;
    originalWidth = parseFloat(selectedIcon.getAttribute('width')) || 100;
    originalHeight = parseFloat(selectedIcon.getAttribute('height')) || 100;

    const { x: mouseX, y: mouseY } = getSVGCoordsFromMouse(event);
    currentAnchor.startMouseX = mouseX;
    currentAnchor.startMouseY = mouseY;

    currentAnchor.iconRotation = iconRotation;

    const svg = getSVGElement();
    if (svg) {
        svg.addEventListener('pointermove', resizeIcon);
    }
    document.addEventListener('pointerup', stopResize);
}

function stopResize(event) {
    stopInteracting();
    document.removeEventListener('pointerup', stopResize);
}

function resizeIcon(event) {
    if (!selectedIcon || !currentAnchor) return;

    const { x: currentMouseX, y: currentMouseY } = getSVGCoordsFromMouse(event);

    const rotation = currentAnchor.iconRotation || 0;
    const rotationRad = (rotation * Math.PI) / 180;

    const rawDeltaX = currentMouseX - currentAnchor.startMouseX;
    const rawDeltaY = currentMouseY - currentAnchor.startMouseY;

    // Rotate delta to local (unrotated) space
    const deltaX = rawDeltaX * Math.cos(-rotationRad) - rawDeltaY * Math.sin(-rotationRad);
    const deltaY = rawDeltaX * Math.sin(-rotationRad) + rawDeltaY * Math.cos(-rotationRad);

    let newWidth = originalWidth;
    let newHeight = originalHeight;
    let newX = originalX;
    let newY = originalY;

    // Track which corner is fixed (relative to original rect)
    let fixedRelX, fixedRelY;

    switch (currentAnchor.style.cursor) {
        case "nw-resize":
            newWidth = Math.max(minIconSize, originalWidth - deltaX);
            newHeight = Math.max(minIconSize, originalHeight - deltaY);
            if (aspect_ratio_lock) {
                const scale = Math.min(newWidth / originalWidth, newHeight / originalHeight);
                newWidth = originalWidth * scale;
                newHeight = originalHeight * scale;
            }
            newX = originalX + (originalWidth - newWidth);
            newY = originalY + (originalHeight - newHeight);
            fixedRelX = originalWidth; fixedRelY = originalHeight;
            break;
        case "ne-resize":
            newWidth = Math.max(minIconSize, originalWidth + deltaX);
            newHeight = Math.max(minIconSize, originalHeight - deltaY);
            if (aspect_ratio_lock) {
                const scale = Math.max(newWidth / originalWidth, newHeight / originalHeight);
                newWidth = originalWidth * scale;
                newHeight = originalHeight * scale;
            }
            newX = originalX;
            newY = originalY + (originalHeight - newHeight);
            fixedRelX = 0; fixedRelY = originalHeight;
            break;
        case "sw-resize":
            newWidth = Math.max(minIconSize, originalWidth - deltaX);
            newHeight = Math.max(minIconSize, originalHeight + deltaY);
            if (aspect_ratio_lock) {
                const scale = Math.max(newWidth / originalWidth, newHeight / originalHeight);
                newWidth = originalWidth * scale;
                newHeight = originalHeight * scale;
            }
            newX = originalX + (originalWidth - newWidth);
            newY = originalY;
            fixedRelX = originalWidth; fixedRelY = 0;
            break;
        case "se-resize":
            newWidth = Math.max(minIconSize, originalWidth + deltaX);
            newHeight = Math.max(minIconSize, originalHeight + deltaY);
            if (aspect_ratio_lock) {
                const scale = Math.max(newWidth / originalWidth, newHeight / originalHeight);
                newWidth = originalWidth * scale;
                newHeight = originalHeight * scale;
            }
            newX = originalX;
            newY = originalY;
            fixedRelX = 0; fixedRelY = 0;
            break;
    }

    // Compensate for rotation center shift when rotated
    if (rotation !== 0) {
        const cosR = Math.cos(rotationRad);
        const sinR = Math.sin(rotationRad);

        // Compute rotated world position of the fixed corner in the original rect
        const oldCX = originalX + originalWidth / 2;
        const oldCY = originalY + originalHeight / 2;
        const odx = (originalX + fixedRelX) - oldCX;
        const ody = (originalY + fixedRelY) - oldCY;
        const fixedWorldX = oldCX + odx * cosR - ody * sinR;
        const fixedWorldY = oldCY + odx * sinR + ody * cosR;

        // Determine where the fixed corner sits in the new rect
        const fixedNewRelX = fixedRelX === 0 ? 0 : newWidth;
        const fixedNewRelY = fixedRelY === 0 ? 0 : newHeight;

        // Solve for new origin so the fixed corner stays in place
        const ncx = newWidth / 2;
        const ncy = newHeight / 2;
        const ndx = fixedNewRelX - ncx;
        const ndy = fixedNewRelY - ncy;
        const rotX = ncx + ndx * cosR - ndy * sinR;
        const rotY = ncy + ndx * sinR + ndy * cosR;

        newX = fixedWorldX - rotX;
        newY = fixedWorldY - rotY;
    }

    selectedIcon.setAttribute('width', newWidth);
    selectedIcon.setAttribute('height', newHeight);
    selectedIcon.setAttribute('x', newX);
    selectedIcon.setAttribute('y', newY);

    selectedIcon.setAttribute('data-shape-x', newX);
    selectedIcon.setAttribute('data-shape-y', newY);
    selectedIcon.setAttribute('data-shape-width', newWidth);
    selectedIcon.setAttribute('data-shape-height', newHeight);

    const vbWidth = parseFloat(selectedIcon.getAttribute('data-viewbox-width')) || 24;
    const vbHeight = parseFloat(selectedIcon.getAttribute('data-viewbox-height')) || 24;
    const iconScale = newWidth / Math.max(vbWidth, vbHeight);
    const localCenterX = newWidth / 2 / iconScale;
    const localCenterY = newHeight / 2 / iconScale;
    selectedIcon.setAttribute('transform', `translate(${newX}, ${newY}) scale(${iconScale}) rotate(${iconRotation}, ${localCenterX}, ${localCenterY})`);

    updateArrowsForShape(selectedIcon);

    addSelectionOutline();
}

function dragIcon(event) {
    if (!isDragging || !selectedIcon) return;

    const { x, y } = getSVGCoordsFromMouse(event);
    let newX = x - dragOffsetX;
    let newY = y - dragOffsetY;

    selectedIcon.setAttribute('x', newX);
    selectedIcon.setAttribute('y', newY);

    selectedIcon.setAttribute('data-shape-x', newX);
    selectedIcon.setAttribute('data-shape-y', newY);

    const width = parseFloat(selectedIcon.getAttribute('width')) || 100;
    const height = parseFloat(selectedIcon.getAttribute('height')) || 100;
    const vbWidth = parseFloat(selectedIcon.getAttribute('data-viewbox-width')) || 24;
    const vbHeight = parseFloat(selectedIcon.getAttribute('data-viewbox-height')) || 24;
    const scale = width / Math.max(vbWidth, vbHeight);
    const localCenterX = width / 2 / scale;
    const localCenterY = height / 2 / scale;
    
    selectedIcon.setAttribute('transform', `translate(${newX}, ${newY}) scale(${scale}) rotate(${iconRotation}, ${localCenterX}, ${localCenterY})`);

    if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
        const iconShape = shapes.find(shape => shape.shapeName === 'icon' && shape.element === selectedIcon);
        if (iconShape) {
            iconShape.x = newX;
            iconShape.y = newY;
            iconShape.updateFrameContainment();
        }
    }

    updateArrowsForShape(selectedIcon);

    removeSelection();
    addSelectionOutline();
}

function stopDrag(event) {
    if (!isDragging) return;
    
    console.log("stop dragging icon");
    isDragging = false;
    if (window.__iconShapeState) window.__iconShapeState.isDragging = false;

    document.removeEventListener('pointermove', dragIcon);
    document.removeEventListener('pointerup', stopDrag);
    window.removeEventListener('pointerup', stopDrag);
    
    const svg = getSVGElement();
    if (svg) {
        svg.removeEventListener('pointerup', stopDrag);
    }
    
    document.removeEventListener('dragstart', preventDefaultDrag);
    document.removeEventListener('selectstart', preventDefaultDrag);
    
    stopInteracting();
}

function startRotation(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!selectedIcon) return;

    isRotatingIcon = true;
    console.log(selectedIcon)
    const iconX = parseFloat(selectedIcon.getAttribute('x'));
    const iconY = parseFloat(selectedIcon.getAttribute('y'));
    const iconWidth = parseFloat(selectedIcon.getAttribute('width'));
    const iconHeight = parseFloat(selectedIcon.getAttribute('height'));

    const centerX = iconX + iconWidth / 2;
    const centerY = iconY + iconHeight / 2;

    const { x: mouseX, y: mouseY } = getSVGCoordsFromMouse(event);

    startRotationMouseAngle = Math.atan2(mouseY - centerY, mouseX - centerX) * 180 / Math.PI;
    console.log('Start rotation mouse angle:', startRotationMouseAngle);
    startIconRotation = iconRotation;

    const svg = getSVGElement();
    if (svg) {
        svg.addEventListener('pointermove', rotateIcon);
        svg.style.cursor = 'grabbing';
    }
    document.addEventListener('pointerup', stopRotation);
}

function rotateIcon(event) {
    if (!isRotatingIcon || !selectedIcon) return;

    const iconX = parseFloat(selectedIcon.getAttribute('x')) || 0;
    const iconY = parseFloat(selectedIcon.getAttribute('y')) || 0;
    const iconWidth = parseFloat(selectedIcon.getAttribute('width')) || 100;
    const iconHeight = parseFloat(selectedIcon.getAttribute('height')) || 100;

    const centerX = iconX + iconWidth / 2;
    const centerY = iconY + iconHeight / 2;

    const { x: mouseX, y: mouseY } = getSVGCoordsFromMouse(event);

    const currentMouseAngle = Math.atan2(mouseY - centerY, mouseX - centerX) * 180 / Math.PI;
    const angleDiff = currentMouseAngle - startRotationMouseAngle;

    iconRotation = startIconRotation + angleDiff;
    iconRotation = iconRotation % 360;
    if (iconRotation < 0) iconRotation += 360;

    const vbWidth = parseFloat(selectedIcon.getAttribute('data-viewbox-width')) || 24;
    const vbHeight = parseFloat(selectedIcon.getAttribute('data-viewbox-height')) || 24;
    const scale = iconWidth / Math.max(vbWidth, vbHeight);
    const localCenterX = iconWidth / 2 / scale;
    const localCenterY = iconHeight / 2 / scale;

    selectedIcon.setAttribute('transform', `translate(${iconX}, ${iconY}) scale(${scale}) rotate(${iconRotation}, ${localCenterX}, ${localCenterY})`);

    selectedIcon.setAttribute('data-shape-rotation', iconRotation);

    updateArrowsForShape(selectedIcon);

    removeSelection();
    addSelectionOutline();
}

function stopRotation(event) {
    if (!isRotatingIcon) return;
    stopInteracting();
    isRotatingIcon = false;
    startRotationMouseAngle = null;
    startIconRotation = null;

    const svg = getSVGElement();
    if (svg) {
        svg.removeEventListener('pointermove', rotateIcon);
        svg.style.cursor = 'default';
    }
    document.removeEventListener('pointerup', stopRotation);
}

function stopInteracting() {
    if (selectedIcon && (isDragging || isRotatingIcon || currentAnchor)) {
        const newPos = {
            x: parseFloat(selectedIcon.getAttribute('x')) || 0,
            y: parseFloat(selectedIcon.getAttribute('y')) || 0,
            width: parseFloat(selectedIcon.getAttribute('width')) || 100,
            height: parseFloat(selectedIcon.getAttribute('height')) || 100,
            rotation: iconRotation
        };

        let originalRotation = iconRotation;
        if (isRotatingIcon && startIconRotation !== null) {
            originalRotation = startIconRotation;
        }

        const oldPos = {
            x: originalX,
            y: originalY,
            width: originalWidth,
            height: originalHeight,
            rotation: originalRotation
        };

        let iconShape = null;
        if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
            iconShape = shapes.find(shape => shape.shapeName === 'icon' && shape.element === selectedIcon);
            if (iconShape) {
                iconShape.x = newPos.x;
                iconShape.y = newPos.y;
                iconShape.width = newPos.width;
                iconShape.height = newPos.height;
                iconShape.rotation = newPos.rotation;
            }
        }

        const oldPosWithFrame = {
            ...oldPos,
            parentFrame: draggedShapeInitialFrameIcon
        };
        // Issue #34 bug #2: for drag, hoveredFrameIcon tracks the actual
        // destination — currentShape.parentFrame is still the OLD frame.
        // Resize / rotate don't track hover, so fall back to whatever the
        // shape itself reports (parent doesn't change for those gestures).
        const newPosWithFrame = {
            ...newPos,
            parentFrame: isDragging
                ? (hoveredFrameIcon || null)
                : (iconShape ? iconShape.parentFrame : null),
        };

        const stateChanged = newPos.x !== oldPos.x || newPos.y !== oldPos.y ||
            newPos.width !== oldPos.width || newPos.height !== oldPos.height ||
            newPos.rotation !== oldPos.rotation;
        const frameChanged = oldPosWithFrame.parentFrame !== newPosWithFrame.parentFrame;

        if ((stateChanged || frameChanged) && iconShape) {
            pushTransformAction(iconShape, oldPosWithFrame, newPosWithFrame);
        }

        if (isDragging && iconShape) {
            const finalFrame = hoveredFrameIcon;

            if (draggedShapeInitialFrameIcon !== finalFrame) {
                if (draggedShapeInitialFrameIcon) {
                    draggedShapeInitialFrameIcon.removeShapeFromFrame(iconShape);
                }

                if (finalFrame) {
                    finalFrame.addShapeToFrame(iconShape);
                }

                if (frameChanged) {
                    pushFrameAttachmentAction(finalFrame || draggedShapeInitialFrameIcon, iconShape,
                        finalFrame ? 'attach' : 'detach', draggedShapeInitialFrameIcon);
                }
            } else if (draggedShapeInitialFrameIcon) {
                draggedShapeInitialFrameIcon.restoreToFrame(iconShape);
            }
        }

        draggedShapeInitialFrameIcon = null;
    }

    if (hoveredFrameIcon) {
        hoveredFrameIcon.removeHighlight();
        hoveredFrameIcon = null;
        if (window.__iconShapeState) window.__iconShapeState.hoveredFrameIcon = null;
    }

    isDragging = false;
    if (window.__iconShapeState) window.__iconShapeState.isDragging = false;
    isRotatingIcon = false;

    const svg = getSVGElement();
    if (svg) {
        svg.removeEventListener('pointermove', dragIcon);
        svg.removeEventListener('pointermove', resizeIcon);
        svg.removeEventListener('pointermove', rotateIcon);
    }
    
    document.removeEventListener('pointermove', dragIcon);
    document.removeEventListener('pointermove', resizeIcon);
    document.removeEventListener('pointermove', rotateIcon);
    
    currentAnchor = null;
    startRotationMouseAngle = null;
    startIconRotation = null;

    if (selectedIcon) {
        originalX = parseFloat(selectedIcon.getAttribute('x')) || 0;
        originalY = parseFloat(selectedIcon.getAttribute('y')) || 0;
        originalWidth = parseFloat(selectedIcon.getAttribute('width')) || 100;
        originalHeight = parseFloat(selectedIcon.getAttribute('height')) || 100;

        selectedIcon.setAttribute('data-shape-x', originalX);
        selectedIcon.setAttribute('data-shape-y', originalY);
        selectedIcon.setAttribute('data-shape-width', originalWidth);
        selectedIcon.setAttribute('data-shape-height', originalHeight);
        selectedIcon.setAttribute('data-shape-rotation', iconRotation);

        updateArrowsForShape(selectedIcon);
    }
}

function deleteCurrentIcon() {
    if (selectedIcon) {
        let iconShape = null;
        if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
            iconShape = shapes.find(shape => shape.shapeName === 'icon' && shape.element === selectedIcon);
            if (iconShape) {
                const idx = shapes.indexOf(iconShape);
                if (idx !== -1) shapes.splice(idx, 1);

                if (iconShape.group && iconShape.group.parentNode) {
                    iconShape.group.parentNode.removeChild(iconShape.group);
                }
            }
        }

        if (!iconShape && selectedIcon.parentNode) {
            selectedIcon.parentNode.removeChild(selectedIcon);
        }

        if (typeof cleanupAttachments === 'function') {
            cleanupAttachments(selectedIcon);
        }

        if (iconShape) {
            pushDeleteAction(iconShape);
        }

        removeSelection();
        selectedIcon = null;
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' && selectedIcon) {
        deleteCurrentIcon();
    }
});

async function fetchIconsFromServer() {
    try {
        const apiUrl = "/api/icons/feed?offset=0&limit=20";
        
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data.results;
    } catch (error) {
        console.error('Failed to fetch icons from server:', error);
        return null;
    }
}

async function renderIconsFromServer() {
    const icons = await fetchIconsFromServer();
    if (icons) {
        document.getElementById("iconsContainer").innerHTML = '';

        for (const icon of icons) {
            try {
                const response = await fetch(`/api/icons/serve?name=${encodeURIComponent(icon.filename)}`);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const svgContent = await response.text();

                const normalizedSVG = normalizeSVGSize(svgContent);

                // Use normalizedSVG for display, not original svgContent
                let svgIcon = `<div class="icons" data-url="${icon.filename}" data-svg="${encodeURIComponent(normalizedSVG)}">
                   ${normalizedSVG}
                </div>`;
                document.getElementById("iconsContainer").innerHTML += svgIcon;
            } catch (error) {
                console.error('Failed to render icon:', icon.filename, error);
            }
        }

        addIconClickListeners();
    }
}

async function searchAndRenderIcons(query) {
    try {
        const apiUrl = `/api/icons/search?q=${encodeURIComponent(query)}`;
        
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const searchResults = await response.json();

        document.getElementById("iconsContainer").innerHTML = '';

        for (const icon of searchResults) {
            try {
                const svgResponse = await fetch(`/api/icons/serve?name=${encodeURIComponent(icon.filename)}`);
                if (!svgResponse.ok) {
                    throw new Error(`HTTP error! status: ${svgResponse.status}`);
                }
                const svgContent = await svgResponse.text();

                const normalizedSVG = normalizeSVGSize(svgContent);

                // Use normalizedSVG for display, not original svgContent
                let svgIcon = `<div class="icons" data-url="${icon.filename}">
                   ${normalizedSVG}
                </div>`;
                document.getElementById("iconsContainer").innerHTML += svgIcon;
            } catch (error) {
                console.error('Failed to render search result:', icon.filename, error);
            }
        }

        addIconClickListeners();

    } catch (error) {
        console.error('Failed to search icons:', error);
    }
}

function normalizeSVGSize(svgContent, fillColor = '#fff', strokeColor = null) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = svgContent;
    const svgElement = tempDiv.querySelector('svg');
    
    if (svgElement) {
        const originalViewBox = svgElement.getAttribute('viewBox');
        
        svgElement.setAttribute('width', '35');
        svgElement.setAttribute('height', '35');
        
        if (!originalViewBox) {
            const width = svgElement.getAttribute('width') || '24';
            const height = svgElement.getAttribute('height') || '24';
            const numWidth = parseFloat(width);
            const numHeight = parseFloat(height);
            
            if (!isNaN(numWidth) && !isNaN(numHeight)) {
                svgElement.setAttribute('viewBox', `0 0 ${numWidth} ${numHeight}`);
            }
        }
        
        // Apply custom styling with more selective logic
        const applyCustomStyling = (element) => {
            if (element.nodeType === 1) {
                const tagName = element.tagName.toLowerCase();
                
                // Only apply to shape elements, not container elements like 'g'
                if (['path', 'circle', 'rect', 'polygon', 'ellipse', 'polyline', 'line'].includes(tagName)) {
                    const currentFill = getInheritedAttr(element, 'fill');
                    const currentStroke = getInheritedAttr(element, 'stroke');
                    
                    // Check if parent <g> has explicit colors - if so, don't override
                    let parentG = element.parentElement;
                    let hasParentColor = false;
                    
                    while (parentG && parentG.tagName.toLowerCase() === 'g') {
                        if (parentG.getAttribute('fill') || parentG.getAttribute('stroke')) {
                            hasParentColor = true;
                            break;
                        }
                        parentG = parentG.parentElement;
                    }
                    
                    // Only apply white fill if:
                    // 1. Element doesn't have explicit/inherited 'none'/'transparent' fill
                    // 2. Element doesn't already have a specific color (other than black/default)
                    // 3. Parent <g> doesn't have explicit colors
                    if (!hasParentColor && currentFill !== 'none' && currentFill !== 'transparent') {
                        // Only override if it's black, default, or unset
                        if (!currentFill || currentFill === '#000' || currentFill === '#000000' || currentFill === 'black' || currentFill === 'currentColor') {
                            element.setAttribute('fill', fillColor);
                        }
                    } else if (currentFill === 'none' || currentFill === 'transparent') {
                        element.setAttribute('fill', 'none');
                    }
                    
                    // Handle stroke similarly
                    if (strokeColor && !hasParentColor) {
                        if (currentStroke && currentStroke !== 'none' && currentStroke !== 'transparent') {
                            if (!currentStroke || currentStroke === '#000' || currentStroke === '#000000' || currentStroke === 'black' || currentStroke === 'currentColor') {
                                element.setAttribute('stroke', strokeColor);
                            }
                        }
                    }
                }
                
                // Recursively process children
                for (let i = 0; i < element.children.length; i++) {
                    applyCustomStyling(element.children[i]);
                }
            }
        };
        
        applyCustomStyling(svgElement);
        
        return svgElement.outerHTML;
    }

    return svgContent;
}

function addIconClickListeners() {
    const iconElements = document.querySelectorAll('#iconsContainer .icons');
    iconElements.forEach(iconElement => {
        iconElement.addEventListener('click', (e) => {
            const filename = iconElement.getAttribute('data-url') || 'unknown';
            handleIconClick(e, filename);
        });
    });
}

// Legacy category/search listeners disabled — React IconSidebar handles all icon UI

function handleIconClick(event, filename) {
    event.stopPropagation();

    const iconElement = event.currentTarget;
    const svgElement = iconElement.querySelector('svg');

    if (svgElement) {
        iconToPlace = svgElement.outerHTML;
        isDraggingIcon = true;
        isIconToolActive = true;

        console.log('Icon selected and ready to place:', filename);

        const iconContainer = document.getElementById('iconsToolBar');
        if (iconContainer) {
            iconContainer.classList.add('hidden');
        }

        document.body.style.cursor = 'crosshair';
    }
}



// Clean up any lingering miniature icon or drag state (called on tool switch)
function cleanupIconTool() {
    if (currentIconElement) {
        const svg = getSVGElement();
        if (svg && currentIconElement.parentNode === svg) {
            svg.removeChild(currentIconElement);
        }
        currentIconElement = null;
    }
    isDraggingIcon = false;
    iconToPlace = null;
    document.body.style.cursor = 'default';
}
window.__cleanupIconTool = cleanupIconTool;

// Bridge for React sidebar to trigger icon placement
window.prepareIconPlacement = function(svgContent) {
    iconToPlace = svgContent;
    isDraggingIcon = true;
    window.isIconToolActive = true;
    document.body.style.cursor = 'crosshair';
};

// Bridge for IconShape to call selectIcon and removeSelection
window.__iconToolSelectIcon = selectIcon;
window.__iconToolRemoveSelection = removeSelection;

// Legacy icon rendering disabled — React IconSidebar handles icon UI

export { handleMouseDownIcon, handleMouseMoveIcon, handleMouseUpIcon, startDrag, stopDrag}
