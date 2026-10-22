/* eslint-disable */
// Code tool event handlers - extracted from writeCode.js
import {
    pushCreateAction,
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

let codeTextSize = "25px";
let codeTextFont = "lixCode";
let codeTextColor = null;
let codeTextAlign = "left";
let codeLanguage = "auto";

let codeTextColorOptions = document.querySelectorAll(".textColorSpan");
let codeTextFontOptions = document.querySelectorAll(".textFontSpan");
let codeTextSizeOptions = document.querySelectorAll(".textSizeSpan");
let codeTextAlignOptions = document.querySelectorAll(".textAlignSpan"); 

let selectedCodeBlock = null;
let codeSelectionBox = null;
let codeResizeHandles = {};
let codeDragOffsetX, codeDragOffsetY;
let isCodeDragging = false;
let isCodeResizing = false;
let currentCodeResizeHandle = null;
let startCodeBBox = null;
let startCodeFontSize = null;
let startCodePoint = null;
let isCodeRotating = false;
let codeRotationStartAngle = 0;
let codeRotationStartTransform = null;
let initialCodeHandlePosRelGroup = null;
let initialCodeGroupTx = 0;
let initialCodeGroupTy = 0;


// Frame attachment variables for code blocks
let draggedCodeInitialFrame = null;
let hoveredCodeFrame = null;


setTextReferences(selectedCodeBlock, updateCodeSelectionFeedback, svg);


// Convert group element to our CodeShape class
function wrapCodeElement(groupElement) {
    const codeShape = new CodeShape(groupElement);
    // Double-click to edit code block (works with any tool)
    groupElement.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const codeElement = groupElement.querySelector('text');
        if (codeElement) {
            makeCodeEditable(codeElement, groupElement, e);
        }
    });
    return codeShape;
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


function addCodeBlock(event) {
    let { x, y } = getSVGCoordinates(event);

    let gElement = document.createElementNS("http://www.w3.org/2000/svg", "g");
    gElement.setAttribute("data-type", "code-group");
    gElement.setAttribute("transform", `translate(${x}, ${y})`);

    // Create background rectangle for code block
    let backgroundRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    backgroundRect.setAttribute("class", "code-background");
    backgroundRect.setAttribute("x", -10); // Padding
    backgroundRect.setAttribute("y", -10); // Padding
    backgroundRect.setAttribute("width", 300); // Initial width
    backgroundRect.setAttribute("height", 60); // Initial height
    backgroundRect.setAttribute("fill", "#161b22"); // GitHub dark background
    backgroundRect.setAttribute("stroke", "#30363d");
    backgroundRect.setAttribute("stroke-width", "1");
    backgroundRect.setAttribute("rx", "6"); // Rounded corners
    backgroundRect.setAttribute("ry", "6");
    gElement.appendChild(backgroundRect);

    // Create SVG text element
    let codeElement = document.createElementNS("http://www.w3.org/2000/svg", "text");
    let textAlignElement = "start";
    if (codeTextAlign === "center") textAlignElement = "middle";
    else if (codeTextAlign === "right") textAlignElement = "end";

    codeElement.setAttribute("x", 0);
    codeElement.setAttribute("y", 0);
    codeElement.setAttribute("fill", codeTextColor ?? getThemeStroke());
    codeElement.setAttribute("font-size", codeTextSize);
    codeElement.setAttribute("font-family", codeTextFont);
    codeElement.setAttribute("text-anchor", textAlignElement);
    codeElement.setAttribute("cursor", "text");
    codeElement.setAttribute("white-space", "pre");
    codeElement.setAttribute("dominant-baseline", "hanging");
    codeElement.textContent = "";

    gElement.setAttribute("data-x", x);
    gElement.setAttribute("data-y", y);
    codeElement.setAttribute("data-initial-size", codeTextSize);
    codeElement.setAttribute("data-initial-font", codeTextFont);
    codeElement.setAttribute("data-initial-color", codeTextColor ?? getThemeStroke());
    codeElement.setAttribute("data-initial-align", codeTextAlign);
    codeElement.setAttribute("data-language", codeLanguage);
    codeElement.setAttribute("data-type", "code");
    gElement.appendChild(codeElement);
    svg.appendChild(gElement);
    
    // Attach ID to both group and code element
    const shapeID = `code-${String(Date.now()).slice(0, 8)}-${Math.floor(Math.random() * 10000)}`;
    gElement.setAttribute('id', shapeID);
    codeElement.setAttribute('id', `${shapeID}-code`);
    
    // Create CodeShape wrapper for frame functionality
    const codeShape = wrapCodeElement(gElement);
    
    // Add to shapes array for arrow attachment and frame functionality
    if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
        shapes.push(codeShape);
    }
    
    pushCreateAction({
        type: 'code',
        element: codeShape,
        shapeName: 'code'
    });

    makeCodeEditable(codeElement, gElement);
}

// Function to update highlight.js on content change
function updateSyntaxHighlighting(editor) {
    if (window.hljs) {
        window.hljs.highlightElement(editor);
    }
}

function adjustCodeEditorSize(editor) {
    const foreignObject = editor.closest('foreignObject');
    const codeContainer = editor.closest('.svg-code-container');
    if (!foreignObject || !codeContainer) return;

    const svgRect = svg.getBoundingClientRect();

    // Allow textarea to expand freely
    editor.style.overflow = 'visible';
    editor.style.height = 'auto';
    editor.style.width = 'auto';
    editor.style.whiteSpace = 'pre'; // No wrapping

    // Calculate content size
    let minContentWidth = editor.scrollWidth + (parseFloat(codeContainer.style.paddingLeft) || 0) + (parseFloat(codeContainer.style.paddingRight) || 0);
    let minContentHeight = editor.scrollHeight + (parseFloat(codeContainer.style.paddingTop) || 0) + (parseFloat(codeContainer.style.paddingBottom) || 0);

    // Clamp to SVG bounds
    const editorRect = editor.getBoundingClientRect();
    const maxWidth = svgRect.width - (editorRect.left - svgRect.left);
    const maxHeight = svgRect.height - (editorRect.top - svgRect.top);

    let newWidth = Math.min(Math.max(minContentWidth, 50), maxWidth);
    let newHeight = Math.min(Math.max(minContentHeight, 30), maxHeight);

    foreignObject.setAttribute('width', newWidth);
    foreignObject.setAttribute('height', newHeight);

    editor.style.width = `${newWidth - (parseFloat(codeContainer.style.paddingLeft) || 0) - (parseFloat(codeContainer.style.paddingRight) || 0)}px`;
    editor.style.height = `${newHeight - (parseFloat(codeContainer.style.paddingTop) || 0) - (parseFloat(codeContainer.style.paddingBottom) || 0)}px`;

    // Overflow only if content exceeds container
    if (editor.scrollHeight > editor.clientHeight || editor.scrollWidth > editor.clientWidth) {
        editor.style.overflow = 'auto';
    } else {
        editor.style.overflow = 'hidden';
    }

    if (selectedCodeBlock && selectedCodeBlock.contains(foreignObject)) {
        updateCodeSelectionFeedback();
    }
}


function makeCodeEditable(codeElement, groupElement, clickEvent = null) {

    if (document.querySelector(".svg-code-editor")) {
        return;
    }

    if (selectedCodeBlock) {
        deselectCodeBlock();
    }

    // Hide the selection feedback for the element being edited
    removeCodeSelectionFeedback();

    // Create a container div for the code editor
    let editorContainer = document.createElement("div");
    editorContainer.className = "svg-code-container";
    editorContainer.style.position = "absolute";
    editorContainer.style.zIndex = "10000";
    editorContainer.style.backgroundColor = "#161b22";
    editorContainer.style.border = "1px solid #30363d";
    editorContainer.style.borderRadius = "6px";
    editorContainer.style.padding = "12px";
    editorContainer.style.fontFamily = "monospace";
    editorContainer.style.overflow = "hidden";
    editorContainer.style.minWidth = "200px";
    editorContainer.style.minHeight = "40px";

    // Create the actual code editor
    let input = document.createElement("div");
    input.className = "svg-code-editor";
    input.contentEditable = true;
    input.style.outline = "none";
    input.style.minHeight = "30px";
    input.style.maxHeight = "400px";
    input.style.overflowY = "auto";
    input.style.whiteSpace = "pre";
    input.style.fontFamily = "lixCode, Consolas, 'Courier New', monospace";
    input.style.fontSize = codeElement.getAttribute("font-size") || codeTextSize;
    input.style.color = "#c9d1d9";
    input.style.lineHeight = "1.4";
    input.style.tabSize = "4";
    input.style.background = "transparent";

    // FIXED: Use the improved text extraction
    let codeContent = extractTextFromCodeElement(codeElement);

    // Set initial content with plain text (no highlighting initially)
    input.textContent = codeContent;

    editorContainer.appendChild(input);

    // Position the editor
    const svgRect = svg.getBoundingClientRect();
    let left = svgRect.left, top = svgRect.top;
    if (clickEvent) {
        left += clickEvent.clientX - svgRect.left;
        top += clickEvent.clientY - svgRect.top;
    } else {
        // fallback to code block position if no click event
        let groupTransformMatrix = svg.createSVGMatrix();
        if (groupElement && groupElement.transform && groupElement.transform.baseVal) {
            const transformList = groupElement.transform.baseVal;
            if (transformList.numberOfItems > 0) {
                const consolidatedTransform = transformList.consolidate();
                if (consolidatedTransform) {
                    groupTransformMatrix = consolidatedTransform.matrix;
                }
            }
        }
        const codeBBox = codeElement.getBBox();
        let pt = svg.createSVGPoint();
        pt.x = codeBBox.x - 8;
        pt.y = codeBBox.y - 8;
        let screenPt = pt.matrixTransform(groupTransformMatrix.multiply(svg.getScreenCTM()));
        left = screenPt.x + svgRect.left;
        top = screenPt.y + svgRect.top;
    }
    editorContainer.style.left = `${left}px`;
    editorContainer.style.top = `${top}px`;

    document.body.appendChild(editorContainer);

    // Auto-resize function
    const adjustSize = () => {
        const maxWidth = svgRect.width - (left - svgRect.left);
        const maxHeight = svgRect.height - (top - svgRect.top);

        let newWidth = Math.max(300, Math.min(input.scrollWidth + 20, maxWidth));
        let newHeight = Math.max(40, Math.min(input.scrollHeight + 20, maxHeight));

        editorContainer.style.width = newWidth + 'px';
        editorContainer.style.height = newHeight + 'px';

        if (input.scrollHeight > input.clientHeight) {
            input.style.overflowY = 'auto';
        } else {
            input.style.overflowY = 'hidden';
        }
    };

    adjustSize();

    setTimeout(() => {
        input.focus();
        // Select all content
        const range = document.createRange();
        range.selectNodeContents(input);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);

        // Apply initial syntax highlighting after focus
        applySyntaxHighlightingImproved(input);
    }, 50);

    // Input handling with duplicate prevention
    let highlightingTimeout = null;
    let isHighlighting = false;
    let lastContent = input.textContent;

    input.addEventListener('input', function(e) {
        if (isHighlighting) return;

        if (highlightingTimeout) {
            clearTimeout(highlightingTimeout);
            highlightingTimeout = null;
        }

        const currentContent = input.textContent || input.innerText || '';
        
        if (currentContent === lastContent) return;

        highlightingTimeout = setTimeout(() => {
            const contentAtTimeout = input.textContent || input.innerText || '';
            if (contentAtTimeout !== lastContent && !isHighlighting) {
                applySyntaxHighlightingImproved(input);
                lastContent = contentAtTimeout;
                adjustSize();
            }
            highlightingTimeout = null;
        }, 300);
    });

    // Handle special keys
    input.addEventListener("keydown", function (e) {
        if (e.key === "Tab") {
            e.preventDefault();
            document.execCommand('insertText', false, '\t');
        } else if (e.key === "Enter" && e.ctrlKey) {
            e.preventDefault();
            renderCodeFromEditor(input, codeElement, true);
        } else if (e.key === "Escape") {
            e.preventDefault();
            renderCodeFromEditor(input, codeElement, true);
        }
    });

    // Store references
    input.originalCodeElement = codeElement;
    input.codeGroup = groupElement;
    input.isHighlighting = () => isHighlighting;
    input.setHighlighting = (state) => { isHighlighting = state; };
    input.clearHighlightTimeout = () => {
        if (highlightingTimeout) {
            clearTimeout(highlightingTimeout);
            highlightingTimeout = null;
        }
    };

    const handleClickOutside = (event) => {
        if (!editorContainer.contains(event.target)) {
            input.clearHighlightTimeout();
            renderCodeFromEditor(input, codeElement, true);
            document.removeEventListener('pointerdown', handleClickOutside, true);
        }
    };
    document.addEventListener('pointerdown', handleClickOutside, true);
    input.handleClickOutside = handleClickOutside;

    groupElement.style.display = "none";
}


function applySyntaxHighlightingImproved(editor) {
    if (!window.hljs) {
        return;
    }

    // Prevent multiple highlighting processes
    if (editor.isHighlighting && editor.isHighlighting()) {
        return;
    }

    // Set highlighting flag
    if (editor.setHighlighting) {
        editor.setHighlighting(true);
    }

    try {
        // Get current cursor position more reliably
        const selection = window.getSelection();
        let cursorOffset = 0;
        let cursorNode = null;
        let cursorNodeOffset = 0;
        
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            cursorNode = range.startContainer;
            cursorNodeOffset = range.startOffset;
            
            // Calculate absolute cursor position
            cursorOffset = getCursorOffset(editor, cursorNode, cursorNodeOffset);
        }

        // Get the plain text content
        const code = editor.textContent || editor.innerText || '';
        
        // Only apply highlighting if content is not empty
        if (!code.trim()) {
            return;
        }
        
        // Auto-detect language and highlight
        const result = window.hljs.highlightAuto(code);
        
        // Only update if the content is actually different
        const newHTML = result.value;
        if (editor.innerHTML !== newHTML) {
            // Apply highlighted HTML
            editor.innerHTML = newHTML;

            // Restore cursor position more accurately
            restoreCursorPositionImproved(editor, cursorOffset);
        }

        // Add detected language info (optional)
        if (result.language) {
            editor.setAttribute('data-language', result.language);
        }
    } catch (error) {
    } finally {
        // Always clear the highlighting flag
        if (editor.setHighlighting) {
            editor.setHighlighting(false);
        }
    }
}


function restoreCursorPositionImproved(editor, targetOffset) {
    if (targetOffset < 0) return;
    
    try {
        const selection = window.getSelection();
        const range = document.createRange();
        
        let currentOffset = 0;
        let targetNode = null;
        let targetNodeOffset = 0;
        
        const walker = document.createTreeWalker(
            editor,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        let node;
        while (node = walker.nextNode()) {
            const nodeLength = node.textContent.length;
            
            if (currentOffset + nodeLength >= targetOffset) {
                targetNode = node;
                targetNodeOffset = Math.max(0, Math.min(targetOffset - currentOffset, nodeLength));
                break;
            }
            
            currentOffset += nodeLength;
        }
        
        if (targetNode) {
            range.setStart(targetNode, targetNodeOffset);
            range.collapse(true);
            
            selection.removeAllRanges();
            selection.addRange(range);
        } else {
            // Fallback: place cursor at end
            range.selectNodeContents(editor);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    } catch (error) {
        // Final fallback: just focus the editor
        try {
            editor.focus();
        } catch (focusError) {
        }
    }
}

// FIXED: More accurate cursor offset calculation
function getCursorOffset(container, node, offset) {
    let cursorOffset = 0;
    
    if (!node || !container.contains(node)) {
        return 0;
    }
    
    const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );
    
    let currentNode;
    while (currentNode = walker.nextNode()) {
        if (currentNode === node) {
            return cursorOffset + Math.max(0, Math.min(offset, currentNode.textContent.length));
        }
        cursorOffset += currentNode.textContent.length;
    }
    
    return cursorOffset;
}


function extractTextFromCodeElement(codeElement) {
    if (!codeElement) return "";
    
    let codeContent = "";
    const childNodes = codeElement.childNodes;
    
    // If there are no child nodes, return empty
    if (childNodes.length === 0) {
        return codeElement.textContent || "";
    }
    
    for (let i = 0; i < childNodes.length; i++) {
        const node = childNodes[i];
        
        if (node.nodeType === Node.TEXT_NODE) {
            // Direct text content
            codeContent += node.textContent;
        } else if (node.tagName === 'tspan') {
            // Handle tspan elements - get all text content from this tspan
            const tspanText = node.textContent || "";
            codeContent += tspanText;
            
            // Add newline after each tspan except the last one
            // This assumes each tspan represents a line
            if (i < childNodes.length - 1) {
                const nextNode = childNodes[i + 1];
                if (nextNode && nextNode.tagName === 'tspan') {
                    codeContent += "\n";
                }
            }
        }
    }
    
    // Clean up the content - replace non-breaking spaces and normalize
    return codeContent.replace(/\u00A0/g, ' ').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// FIXED: Improved renderCodeFromEditor function
function renderCodeFromEditor(input, codeElement, deleteIfEmpty = false) {
    const editorContainer = input.closest('.svg-code-container');
    if (!editorContainer || !document.body.contains(editorContainer)) {
        return;
    }

    // Get plain text content from the contenteditable div
    // FIXED: Use textContent instead of innerHTML to avoid HTML artifacts
    const code = input.textContent || input.innerText || "";
    const gElement = input.codeGroup;

    // Clean up event listeners
    if (input.handleClickOutside) {
        document.removeEventListener('pointerdown', input.handleClickOutside, true);
    }

    // Clear any pending highlighting timeouts
    if (input.clearHighlightTimeout) {
        input.clearHighlightTimeout();
    }

    document.body.removeChild(editorContainer);

    if (!gElement || !codeElement) {
        return;
    }

    if (!gElement.parentNode) {
        if (selectedCodeBlock === gElement) {
            deselectCodeBlock();
        }
        return;
    }

    if (deleteIfEmpty && code.trim() === "") {
        // Find the CodeShape wrapper
        let codeShape = null;
        if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
            codeShape = shapes.find(shape => shape.shapeName === 'code' && shape.group === gElement);
            if (codeShape) {
                const idx = shapes.indexOf(codeShape);
                if (idx !== -1) shapes.splice(idx, 1);
            }
        }

        pushDeleteActionWithAttachments({
            type: 'code',
            element: codeShape || gElement,
            shapeName: 'code'
        });

        if (typeof cleanupAttachments === 'function') {
            cleanupAttachments(gElement);
        }

        svg.removeChild(gElement);
        if (selectedCodeBlock === gElement) {
            selectedCodeBlock = null;
            removeCodeSelectionFeedback();
        }
    } else {
        // FIXED: Clear existing content completely before adding new content
        while (codeElement.firstChild) {
            codeElement.removeChild(codeElement.firstChild);
        }

        // Reset text content to empty to ensure clean slate
        codeElement.textContent = "";

        // Apply syntax highlighting and create SVG tspans
        const storedLang = codeElement.getAttribute("data-language") || "auto";
        const highlightedCode = applySyntaxHighlightingToSVG(code, storedLang);
        createHighlightedSVGText(highlightedCode, codeElement);

        // Update background rectangle to fit content
        updateCodeBackground(gElement, codeElement);

        gElement.style.display = 'block';

        // Update attached arrows after code content change
        if (typeof updateAttachedArrows === 'function') {
            updateAttachedArrows(gElement);
        }

        if (selectedCodeBlock === gElement) {
            setTimeout(updateCodeSelectionFeedback, 0);
        }
    }

    // After rendering code, switch to selection tool and auto-select
    if (gElement.parentNode) {
        if (window.__sketchStoreApi) {
            window.__sketchStoreApi.setActiveTool('select', { afterDraw: true });
        } else {
            window.isSelectionToolActive = true;
        }
        selectCodeBlock(gElement);
    }
}

// FIXED: Improved createHighlightedSVGText function
function createHighlightedSVGText(highlightResult, parentElement) {
    if (!highlightResult || !highlightResult.value) {
        return;
    }

    const lines = highlightResult.value.split('\n');
    const x = parentElement.getAttribute("x") || 0;

    lines.forEach((line, index) => {
        const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
        tspan.setAttribute("x", x);
        tspan.setAttribute("dy", index === 0 ? "0" : "1.2em");
        
        if (line.trim()) {
            // Create highlighted tspans for non-empty lines
            createHighlightedTspans(line, tspan, x);
            
            // If no child tspans were created (plain text), set the text content
            if (tspan.childNodes.length === 0) {
                tspan.textContent = line;
            }
        } else {
            // Empty line - add a space to maintain line height
            tspan.textContent = " ";
        }
        
        parentElement.appendChild(tspan);
    });
}






function applySyntaxHighlightingToSVG(code, language) {
    if (!window.hljs) {
        return { value: code, language: null };
    }

    const lang = language || codeLanguage;
    if (lang && lang !== "auto") {
        try {
            return window.hljs.highlight(code, { language: lang });
        } catch (e) {
            // fallback to auto-detect
        }
    }
    return window.hljs.highlightAuto(code);
}


function applySyntaxHighlighting(editor) {
    if (!window.hljs) {
        return;
    }

    // Get the plain text content
    const code = editor.textContent || editor.innerText;
    
    // Auto-detect language and highlight
    const result = window.hljs.highlightAuto(code);
    
    // Store cursor position
    const selection = window.getSelection();
    let cursorPos = 0;
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        cursorPos = range.startOffset;
    }

    // Apply highlighted HTML
    editor.innerHTML = result.value;

    // Restore cursor position
    restoreCursorPosition(editor, cursorPos);

    // Add detected language info (optional)
    if (result.language) {
        editor.setAttribute('data-language', result.language);
    }
}

function restoreCursorPosition(editor, position) {
    try {
        const range = document.createRange();
        const sel = window.getSelection();
        
        let textNode = null;
        let currentPos = 0;
        
        // Find the text node at the desired position
        const walker = document.createTreeWalker(
            editor,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        while (walker.nextNode()) {
            const node = walker.currentNode;
            const textLength = node.textContent.length;
            
            if (currentPos + textLength >= position) {
                textNode = node;
                break;
            }
            currentPos += textLength;
        }
        
        if (textNode) {
            range.setStart(textNode, Math.min(position - currentPos, textNode.textContent.length));
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    } catch (error) {
    }
}


function renderCode(input, codeElement, deleteIfEmpty = false) {
    if (!input || !document.body.contains(input)) {
         return;
    }

    const code = input.value || "";
    const gElement = input.codeGroup;

    if (input.handleClickOutside) {
        document.removeEventListener('pointerdown', input.handleClickOutside, true);
    }

    document.body.removeChild(input);

    if (!gElement || !codeElement) {
        return;
    }

    if (!gElement.parentNode) {
        if (selectedCodeBlock === gElement) {
             deselectCodeBlock();
        }
        return;
    }

    if (deleteIfEmpty && code.trim() === "") {
        // Find the CodeShape wrapper
        let codeShape = null;
        if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
            codeShape = shapes.find(shape => shape.shapeName === 'code' && shape.group === gElement);
            if (codeShape) {
                const idx = shapes.indexOf(codeShape);
                if (idx !== -1) shapes.splice(idx, 1);
            }
        }

        pushDeleteActionWithAttachments({
            type: 'code',
            element: codeShape || gElement,
            shapeName: 'code'
        });

        if (typeof cleanupAttachments === 'function') {
            cleanupAttachments(gElement);
        }

        svg.removeChild(gElement);
        if (selectedCodeBlock === gElement) {
            selectedCodeBlock = null;
            removeCodeSelectionFeedback();
        }
    } else {
        // Clear existing content
        while (codeElement.firstChild) {
            codeElement.removeChild(codeElement.firstChild);
        }

        // Split into lines and create tspans with syntax highlighting
        const lines = code.split("\n");
        const x = codeElement.getAttribute("x") || 0;

        lines.forEach((line, index) => {
            if (window.hljs && line.trim()) {
                // Get syntax highlighting for the line
                const result = window.hljs.highlightAuto(line);
                createHighlightedTspans(result.value, codeElement, x, index === 0 ? "0" : "1.2em");
            } else {
                // Create plain tspan for empty lines or when hljs is not available
                let tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                tspan.setAttribute("x", x);
                tspan.setAttribute("dy", index === 0 ? "0" : "1.2em");
                tspan.textContent = line.replace(/\u00A0/g, ' ') || " ";
                codeElement.appendChild(tspan);
            }
        });

        // Update background rectangle to fit content
        updateCodeBackground(gElement, codeElement);

        gElement.style.display = 'block';

        // Update attached arrows after code content change
        updateAttachedArrows(gElement);

        if (selectedCodeBlock === gElement) {
            setTimeout(updateCodeSelectionFeedback, 0);
        }
    }

    // After rendering code, switch to selection tool and auto-select
    if (gElement.parentNode) {
        if (window.__sketchStoreApi) {
            window.__sketchStoreApi.setActiveTool('select', { afterDraw: true });
        } else {
            window.isSelectionToolActive = true;
        }
        selectCodeBlock(gElement);
    }
}


function createHighlightedTspans(highlightedHtml, parentTspan, x) {
    if (!highlightedHtml || !parentTspan) return;
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = highlightedHtml;
    
    // Process all nodes in the highlighted HTML
    processHighlightedNodes(tempDiv, parentTspan);
}



function processHighlightedNodes(node, parentTspan) {
    if (!node || !parentTspan) return;
    
    for (let child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
            // Direct text content - add to parent tspan
            if (child.textContent) {
                if (parentTspan.textContent) {
                    parentTspan.textContent += child.textContent;
                } else {
                    parentTspan.textContent = child.textContent;
                }
            }
        } else if (child.nodeType === Node.ELEMENT_NODE) {
            // Create a new nested tspan for styled content
            let styledTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
            styledTspan.textContent = child.textContent || "";
            
            // Apply comprehensive syntax highlighting colors
            const className = child.className || '';
            applyHighlightColor(styledTspan, className);
            
            parentTspan.appendChild(styledTspan);
        }
    }
}



function applyHighlightColor(tspan, className) {
    // GitHub Dark Dimmed theme colors
    if (className.includes('hljs-keyword') || className.includes('hljs-built_in')) {
        tspan.setAttribute("fill", "#ff7b72"); // Red (keywords)
    } else if (className.includes('hljs-string') || className.includes('hljs-template-string')) {
        tspan.setAttribute("fill", "#a5d6ff"); // Light blue (strings)
    } else if (className.includes('hljs-comment')) {
        tspan.setAttribute("fill", "#8b949e"); // Gray (comments)
        tspan.setAttribute("font-style", "italic");
    } else if (className.includes('hljs-number') || className.includes('hljs-literal')) {
        tspan.setAttribute("fill", "#79c0ff"); // Blue (numbers/literals)
    } else if (className.includes('hljs-function') || className.includes('hljs-title')) {
        tspan.setAttribute("fill", "#d2a8ff"); // Purple (functions)
    } else if (className.includes('hljs-variable') || className.includes('hljs-name')) {
        tspan.setAttribute("fill", "#ffa657"); // Orange (variables)
    } else if (className.includes('hljs-type') || className.includes('hljs-class')) {
        tspan.setAttribute("fill", "#f0883e"); // Orange (types)
    } else if (className.includes('hljs-operator') || className.includes('hljs-punctuation')) {
        tspan.setAttribute("fill", "#c9d1d9"); // Light gray (operators)
    } else if (className.includes('hljs-property') || className.includes('hljs-attribute')) {
        tspan.setAttribute("fill", "#79c0ff"); // Blue (properties)
    } else if (className.includes('hljs-tag')) {
        tspan.setAttribute("fill", "#7ee787"); // Green (HTML tags)
    } else if (className.includes('hljs-meta') || className.includes('hljs-doctag')) {
        tspan.setAttribute("fill", "#8b949e"); // Gray (meta)
    } else if (className.includes('hljs-regexp')) {
        tspan.setAttribute("fill", "#a5d6ff"); // Light blue (regex)
    } else {
        tspan.setAttribute("fill", "#c9d1d9"); // GitHub default text color
    }
}


function createCodeSelectionFeedback(groupElement) {
    if (!groupElement) return;
    removeCodeSelectionFeedback();

    const backgroundRect = groupElement.querySelector('.code-background');
    if (!backgroundRect) {
         return;
    }

    // Use background rect dimensions for selection feedback
    const x = parseFloat(backgroundRect.getAttribute('x'));
    const y = parseFloat(backgroundRect.getAttribute('y'));
    const width = parseFloat(backgroundRect.getAttribute('width'));
    const height = parseFloat(backgroundRect.getAttribute('height'));

    const zoom = window.currentZoom || 1;
    const padding = 8 / zoom;
    const handleSize = 10 / zoom;
    const handleOffset = handleSize / 2;

    const selX = x - padding;
    const selY = y - padding;
    const selWidth = width + 2 * padding;
    const selHeight = height + 2 * padding;

    // Draw selection outline (polyline)
    const outlinePoints = [
        [selX, selY],
        [selX + selWidth, selY],
        [selX + selWidth, selY + selHeight],
        [selX, selY + selHeight],
        [selX, selY]
    ];
    const pointsAttr = outlinePoints.map(p => p.join(',')).join(' ');
    codeSelectionBox = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    codeSelectionBox.setAttribute("class", "selection-box");
    codeSelectionBox.setAttribute("points", pointsAttr);
    codeSelectionBox.setAttribute("fill", "none");
    codeSelectionBox.setAttribute("stroke", "#5B57D1");
    codeSelectionBox.setAttribute("stroke-width", "1.5");
    codeSelectionBox.setAttribute("stroke-dasharray", "4 2");
    codeSelectionBox.setAttribute("vector-effect", "non-scaling-stroke");
    codeSelectionBox.setAttribute("pointer-events", "none");
    groupElement.appendChild(codeSelectionBox);

    // Add resize handles and rotation anchor (rest of the function remains the same)
    const handlesData = [
        { name: 'nw', x: selX, y: selY, cursor: 'nwse-resize' },
        { name: 'ne', x: selX + selWidth, y: selY, cursor: 'nesw-resize' },
        { name: 'sw', x: selX, y: selY + selHeight, cursor: 'nesw-resize' },
        { name: 'se', x: selX + selWidth, y: selY + selHeight, cursor: 'nwse-resize' }
    ];
    codeResizeHandles = {};
    handlesData.forEach(handle => {
        const handleRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        handleRect.setAttribute("class", `resize-handle resize-handle-${handle.name}`);
        handleRect.setAttribute("x", handle.x - handleOffset);
        handleRect.setAttribute("y", handle.y - handleOffset);
        handleRect.setAttribute("width", handleSize);
        handleRect.setAttribute("height", handleSize);
        handleRect.setAttribute("fill", "#121212");
        handleRect.setAttribute("stroke", "#5B57D1");
        handleRect.setAttribute("stroke-width", 2);
        handleRect.setAttribute("vector-effect", "non-scaling-stroke");
        handleRect.style.cursor = handle.cursor;
        handleRect.setAttribute("data-anchor", handle.name);
        groupElement.appendChild(handleRect);
        codeResizeHandles[handle.name] = handleRect;

        handleRect.addEventListener('pointerdown', (e) => {
            if (window.isSelectionToolActive) {
                e.stopPropagation();
                startCodeResize(e, handle.name);
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
    rotationAnchor.setAttribute('stroke-width', 2);
    rotationAnchor.setAttribute('vector-effect', 'non-scaling-stroke');
    rotationAnchor.style.cursor = 'grab';
    rotationAnchor.setAttribute('pointer-events', 'all');
    groupElement.appendChild(rotationAnchor);
    registerRotationAnchor(rotationAnchor, { radius: 8, edgeY: selY });

    codeResizeHandles.rotate = rotationAnchor;

    rotationAnchor.addEventListener('pointerdown', (e) => {
        if (window.isSelectionToolActive) {
            e.stopPropagation();
            startCodeRotation(e);
        }
    });
}


function updateCodeBackground(groupElement, codeElement) {
    const backgroundRect = groupElement.querySelector('.code-background');
    if (!backgroundRect || !codeElement) return;

    const textBBox = codeElement.getBBox();
    const padding = 10;

    // Update background dimensions to fit text content
    backgroundRect.setAttribute("x", textBBox.x - padding);
    backgroundRect.setAttribute("y", textBBox.y - padding);
    backgroundRect.setAttribute("width", textBBox.width + (padding * 2));
    backgroundRect.setAttribute("height", textBBox.height + (padding * 2));
}


function updateCodeSelectionFeedback() {
    if (!selectedCodeBlock || !codeSelectionBox) return;

    const codeElement = selectedCodeBlock.querySelector('text');
    if (!codeElement) return;

    // Temporarily set display to 'block' if it was hidden to get correct bbox
    const wasHidden = selectedCodeBlock.style.display === 'none';
    if (wasHidden) selectedCodeBlock.style.display = 'block';

    const bbox = codeElement.getBBox(); // Fix: use codeElement, not undefined foreignObject

    if (wasHidden) selectedCodeBlock.style.display = 'none';

    if (bbox.width === 0 && bbox.height === 0 && codeElement.textContent.trim() !== "") {
    }

    const zoom = window.currentZoom || 1;
    const padding = 8 / zoom;
    const handleSize = 10 / zoom;
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
    codeSelectionBox.setAttribute("points", pointsAttr);

    const handlesData = [
        { name: 'nw', x: selX, y: selY },
        { name: 'ne', x: selX + selWidth, y: selY },
        { name: 'sw', x: selX, y: selY + selHeight },
        { name: 'se', x: selX + selWidth, y: selY + selHeight }
    ];

    handlesData.forEach(handle => {
        const handleRect = codeResizeHandles[handle.name];
        if (handleRect) {
            handleRect.setAttribute("x", handle.x - handleOffset);
            handleRect.setAttribute("y", handle.y - handleOffset);
        }
    });

    const rotationAnchor = codeResizeHandles.rotate;
    if (rotationAnchor) {
        const rotationAnchorPos = { x: selX + selWidth / 2, y: selY - 30 / zoom };
        rotationAnchor.setAttribute('cx', rotationAnchorPos.x);
        rotationAnchor.setAttribute('cy', rotationAnchorPos.y);
    }
}



function startCodeRotation(event) {
    if (!selectedCodeBlock || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    isCodeRotating = true;
    isCodeDragging = false;
    isCodeResizing = false;

    const codeElement = selectedCodeBlock.querySelector('text'); // Fix: use text element instead of foreignObject
    if (!codeElement) return;

    const bbox = codeElement.getBBox();
    const centerX = bbox.x + bbox.width / 2;
    const centerY = bbox.y + bbox.height / 2;

    const mousePos = getSVGCoordinates(event);

    let centerPoint = svg.createSVGPoint();
    centerPoint.x = centerX;
    centerPoint.y = centerY;

    const groupTransform = selectedCodeBlock.transform.baseVal.consolidate();
    if (groupTransform) {
        centerPoint = centerPoint.matrixTransform(groupTransform.matrix);
    }

    codeRotationStartAngle = Math.atan2(mousePos.y - centerPoint.y, mousePos.x - centerPoint.x) * 180 / Math.PI;

    const currentTransform = selectedCodeBlock.transform.baseVal.consolidate();
    codeRotationStartTransform = currentTransform ? currentTransform.matrix : svg.createSVGMatrix();

    svg.style.cursor = 'grabbing';

    window.addEventListener('pointermove', handleCodeMouseMove); // Fix: use window instead of svg
    window.addEventListener('pointerup', handleCodeMouseUp);
}


function removeCodeSelectionFeedback() {
    if (selectedCodeBlock) {
        selectedCodeBlock.querySelectorAll(".selection-box, .resize-handle, .rotate-anchor").forEach(el => el.remove());
    }
    codeSelectionBox = null;
    codeResizeHandles = {};
}

function selectCodeBlock(groupElement) {
    if (!groupElement || !groupElement.parentNode) return;
    if (groupElement === selectedCodeBlock) return;

    deselectCodeBlock();
    selectedCodeBlock = groupElement;
    selectedCodeBlock.classList.add("selected");
    createCodeSelectionFeedback(selectedCodeBlock);
    updateSelectedElement(selectedCodeBlock);

    // Update code toggle to reflect code mode
    const toggleSpans = document.querySelectorAll(".textCodeSpan");
    toggleSpans.forEach(el => el.classList.remove("selected"));
    toggleSpans.forEach(el => {
        if (el.getAttribute("data-id") === "true") el.classList.add("selected");
    });
    // Show the text/code property panel via React bridge (pass 'code' to set code mode)
    if (window.__showSidebarForShape) window.__showSidebarForShape('code');
}

function deselectCodeBlock() {
    const activeEditor = document.querySelector(".svg-code-editor[contenteditable='true']");
    if (activeEditor) {
        let groupElement = activeEditor.originalGroup;
        if (groupElement) {
            renderCode(activeEditor, true);
        } else if (document.body.contains(activeEditor)){
            activeEditor.remove();
        }
    }
    if (selectedCodeBlock) {
        removeCodeSelectionFeedback();
        selectedCodeBlock.classList.remove("selected");
        selectedCodeBlock = null;
        updateSelectedElement(null);
    }
    if (isCodeRotating) {
        isCodeRotating = false;
        codeRotationStartAngle = 0;
        codeRotationStartTransform = null;
        svg.style.cursor = 'default';
        window.removeEventListener('pointermove', handleCodeMouseMove);
        window.removeEventListener('pointerup', handleCodeMouseUp);
    }
}


function startCodeDrag(event) {
    if (!selectedCodeBlock || event.button !== 0) return;

    if (event.target.closest('.resize-handle')) {
        return;
    }

    isCodeDragging = true;
    isCodeResizing = false;
    event.preventDefault();

    const currentTransform = selectedCodeBlock.transform.baseVal.consolidate();
    const initialTranslateX = currentTransform ? currentTransform.matrix.e : 0;
    const initialTranslateY = currentTransform ? currentTransform.matrix.f : 0;

    startCodePoint = getSVGCoordinates(event);

    codeDragOffsetX = startCodePoint.x - initialTranslateX;
    codeDragOffsetY = startCodePoint.y - initialTranslateY;

    // Find the CodeShape wrapper for frame functionality
    let codeShape = null;
    if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
        codeShape = shapes.find(shape => shape.shapeName === 'code' && shape.group === selectedCodeBlock);
    }

    if (codeShape) {
        // Store initial frame state
        draggedCodeInitialFrame = codeShape.parentFrame || null;
        
        // Temporarily remove from frame clipping if dragging
        if (codeShape.parentFrame) {
            codeShape.parentFrame.temporarilyRemoveFromFrame(codeShape);
        }
    }

    svg.style.cursor = 'grabbing';

    window.addEventListener('pointermove', handleCodeMouseMove); // Fix: use window
    window.addEventListener('pointerup', handleCodeMouseUp);   // Fix: use window
}

function startCodeResize(event, anchor) {
    if (!selectedCodeBlock || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    isCodeResizing = true;
    isCodeDragging = false;
    currentCodeResizeHandle = anchor;

    
    const codeElement = selectedCodeBlock.querySelector('text');
    if (!codeElement) {
        isCodeResizing = false;
        return;
    }

    startCodeBBox = codeElement.getBBox();
    startCodeFontSize = parseFloat(codeElement.getAttribute("font-size") || 25);
    if (isNaN(startCodeFontSize)) startCodeFontSize = 25;

    startCodePoint = getSVGCoordinates(event, selectedCodeBlock);

    const currentTransform = selectedCodeBlock.transform.baseVal.consolidate();
    initialCodeGroupTx = currentTransform ? currentTransform.matrix.e : 0;
    initialCodeGroupTy = currentTransform ? currentTransform.matrix.f : 0;

    const padding = 3;
    const startX = startCodeBBox.x - padding;
    const startY = startCodeBBox.y - padding;
    const startWidth = startCodeBBox.width + 2 * padding;
    const startHeight = startCodeBBox.height + 2 * padding;

    let hx = startX;
    let hy = startY;
    if (anchor.includes('e')) { hx = startX + startWidth; }
    if (anchor.includes('s')) { hy = startY + startHeight; }
    initialCodeHandlePosRelGroup = { x: hx, y: hy };

    svg.style.cursor = codeResizeHandles[anchor]?.style.cursor || 'default';

    window.addEventListener('pointermove', handleCodeMouseMove); 
    window.addEventListener('pointerup', handleCodeMouseUp);   
}




const handleCodeMouseMove = (event) => {
    if (!selectedCodeBlock) return;
    event.preventDefault();

    // Keep lastMousePos in screen coordinates for other functions
    const svgRect = svg.getBoundingClientRect();
    lastMousePos = {
        x: event.clientX - svgRect.left, 
        y: event.clientY - svgRect.top
    };

    if (isCodeDragging) {
        const currentPoint = getSVGCoordinates(event);
        const newTranslateX = currentPoint.x - codeDragOffsetX;
        const newTranslateY = currentPoint.y - codeDragOffsetY;

        const currentTransform = selectedCodeBlock.transform.baseVal.consolidate();
        if (currentTransform) {
            const matrix = currentTransform.matrix;
            const angle = Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;

            const codeElement = selectedCodeBlock.querySelector('text');
            if (codeElement) {
                const bbox = codeElement.getBBox();
                const centerX = bbox.x + bbox.width / 2;
                const centerY = bbox.y + bbox.height / 2;

                selectedCodeBlock.setAttribute('transform',
                    `translate(${newTranslateX}, ${newTranslateY}) rotate(${angle}, ${centerX}, ${centerY})`
                );
            } else {
                selectedCodeBlock.setAttribute('transform', `translate(${newTranslateX}, ${newTranslateY})`);
            }
        } else {
            selectedCodeBlock.setAttribute('transform', `translate(${newTranslateX}, ${newTranslateY})`);
        }

        // Update frame containment for CodeShape wrapper
        if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
            const codeShape = shapes.find(shape => shape.shapeName === 'code' && shape.group === selectedCodeBlock);
            if (codeShape) {
                codeShape.updateFrameContainment();
            }
        }

        // Update attached arrows during dragging
        updateAttachedArrows(selectedCodeBlock);

    } else if (isCodeResizing) {
        const codeElement = selectedCodeBlock.querySelector('text');
        if (!codeElement || !startCodeBBox || startCodeFontSize === null || !startCodePoint || !initialCodeHandlePosRelGroup) return;

        const currentPoint = getSVGCoordinates(event, selectedCodeBlock);

        const startX = startCodeBBox.x;
        const startY = startCodeBBox.y;
        const startWidth = startCodeBBox.width;
        const startHeight = startCodeBBox.height;

        let anchorX, anchorY;

        switch (currentCodeResizeHandle) {
            case 'nw':
                anchorX = startX + startWidth;
                anchorY = startY + startHeight;
                break;
            case 'ne':
                anchorX = startX;
                anchorY = startY + startHeight;
                break;
            case 'sw':
                anchorX = startX + startWidth;
                anchorY = startY;
                break;
            case 'se':
                anchorX = startX;
                anchorY = startY;
                break;
        }

        const newWidth = Math.abs(currentPoint.x - anchorX);
        const newHeight = Math.abs(currentPoint.y - anchorY);

        const chosenScale = newHeight / startHeight;

        const minScale = 0.1;
        const maxScale = 10.0;
        const clampedScale = Math.max(minScale, Math.min(chosenScale, maxScale));

        const newFontSize = startCodeFontSize * clampedScale;
        const minFontSize = 5;
        const finalFontSize = Math.max(newFontSize, minFontSize);

        codeElement.setAttribute("font-size", `${finalFontSize}px`);

        const currentBBox = codeElement.getBBox();

        let newAnchorX, newAnchorY;

        switch (currentCodeResizeHandle) {
            case 'nw':
                newAnchorX = currentBBox.x + currentBBox.width;
                newAnchorY = currentBBox.y + currentBBox.height;
                break;
            case 'ne':
                newAnchorX = currentBBox.x;
                newAnchorY = currentBBox.y + currentBBox.height;
                break;
            case 'sw':
                newAnchorX = currentBBox.x + currentBBox.width;
                newAnchorY = currentBBox.y;
                break;
            case 'se':
                newAnchorX = currentBBox.x;
                newAnchorY = currentBBox.y;
                break;
        }

        const deltaX = anchorX - newAnchorX;
        const deltaY = anchorY - newAnchorY;

        const currentTransform = selectedCodeBlock.transform.baseVal.consolidate();
        if (currentTransform) {
            const matrix = currentTransform.matrix;
            const angle = Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;

            const newGroupTx = initialCodeGroupTx + deltaX;
            const newGroupTy = initialCodeGroupTy + deltaY;

            const centerX = currentBBox.x + currentBBox.width / 2;
            const centerY = currentBBox.y + currentBBox.height / 2;

            selectedCodeBlock.setAttribute('transform',
                `translate(${newGroupTx}, ${newGroupTy}) rotate(${angle}, ${centerX}, ${centerY})`
            );
        } else {
            const newGroupTx = initialCodeGroupTx + deltaX;
            const newGroupTy = initialCodeGroupTy + deltaY;
            selectedCodeBlock.setAttribute('transform', `translate(${newGroupTx}, ${newGroupTy})`);
        }

        // Update background to fit new text size
        updateCodeBackground(selectedCodeBlock, codeElement);

        // Update attached arrows during resizing
        updateAttachedArrows(selectedCodeBlock);

        clearTimeout(selectedCodeBlock.updateFeedbackTimeout);
        selectedCodeBlock.updateFeedbackTimeout = setTimeout(() => {
            updateCodeSelectionFeedback();
            delete selectedCodeBlock.updateFeedbackTimeout;
        }, 0);

    } else if (isCodeRotating) {
        const codeElement = selectedCodeBlock.querySelector('text');
        if (!codeElement) return;

        const bbox = codeElement.getBBox();
        const centerX = bbox.x + bbox.width / 2;
        const centerY = bbox.y + bbox.height / 2;

        const mousePos = getSVGCoordinates(event);

        let centerPoint = svg.createSVGPoint();
        centerPoint.x = centerX;
        centerPoint.y = centerY;

        const groupTransform = selectedCodeBlock.transform.baseVal.consolidate();
        if (groupTransform) {
            centerPoint = centerPoint.matrixTransform(groupTransform.matrix);
        }

        const currentAngle = Math.atan2(mousePos.y - centerPoint.y, mousePos.x - centerPoint.x) * 180 / Math.PI;

        const rotationDiff = currentAngle - codeRotationStartAngle;

        const newTransform = `translate(${codeRotationStartTransform.e}, ${codeRotationStartTransform.f}) rotate(${rotationDiff}, ${centerX}, ${centerY})`;
        selectedCodeBlock.setAttribute('transform', newTransform);

        // Update attached arrows during rotation
        updateAttachedArrows(selectedCodeBlock);

        updateCodeSelectionFeedback();
    }

    // Handle cursor changes for code tool
    if ((isCodeToolActive || (isTextToolActive && isTextInCodeMode)) && !isCodeDragging && !isCodeResizing && !isCodeRotating) {
        svg.style.cursor = 'text';
        
        // Frame highlighting logic for code tool
        const { x, y } = getSVGCoordinates(event);
        
        const tempCodeBounds = {
            x: x - 275, 
            y: y - 30, 
            width: 550,
            height: 60
        };
        
        if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
            shapes.forEach(frame => {
                if (frame.shapeName === 'frame') {
                    if (frame.isShapeInFrame(tempCodeBounds)) {
                        frame.highlightFrame();
                        hoveredCodeFrame = frame;
                    } else if (hoveredCodeFrame === frame) {
                        frame.removeHighlight();
                        hoveredCodeFrame = null;
                    }
                }
            });
        }
    } else if (isSelectionToolActive && !isCodeDragging && !isCodeResizing && !isCodeRotating) {
        const targetGroup = event.target.closest('g[data-type="code-group"]');
        if (targetGroup) {
            svg.style.cursor = 'move';
        } else {
            svg.style.cursor = 'default';
        }
    }
};

// Add this complete mouse up handler
const handleCodeMouseUp = (event) => {
    if (event.button !== 0) return;

    if (isCodeDragging && selectedCodeBlock) {
        const currentTransform = selectedCodeBlock.transform.baseVal.consolidate();
        if (currentTransform) {
            const finalTranslateX = currentTransform.matrix.e;
            const finalTranslateY = currentTransform.matrix.f;

            const initialX = parseFloat(selectedCodeBlock.getAttribute("data-x")) || 0;
            const initialY = parseFloat(selectedCodeBlock.getAttribute("data-y")) || 0;

            // Find the CodeShape wrapper for frame tracking
            let codeShape = null;
            if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
                codeShape = shapes.find(shape => shape.shapeName === 'code' && shape.group === selectedCodeBlock);
            }

            // Add frame information for undo tracking
            const oldPosWithFrame = {
                x: initialX,
                y: initialY,
                rotation: extractRotationFromTransform(selectedCodeBlock) || 0,
                parentFrame: draggedCodeInitialFrame
            };
            const newPosWithFrame = {
                x: finalTranslateX,
                y: finalTranslateY,
                rotation: extractRotationFromTransform(selectedCodeBlock) || 0,
                parentFrame: codeShape ? codeShape.parentFrame : null
            };

            const stateChanged = initialX !== finalTranslateX || initialY !== finalTranslateY;
            const frameChanged = oldPosWithFrame.parentFrame !== newPosWithFrame.parentFrame;

            if (stateChanged || frameChanged) {
                pushTransformAction(
                    {
                        type: 'code',
                        element: selectedCodeBlock,
                        shapeName: 'code'
                    },
                    oldPosWithFrame,
                    newPosWithFrame
                );
            }

            // Handle frame containment changes after drag
            if (codeShape) {
                const finalFrame = hoveredCodeFrame;
                
                // If shape moved to a different frame
                if (draggedCodeInitialFrame !== finalFrame) {
                    // Remove from initial frame
                    if (draggedCodeInitialFrame) {
                        draggedCodeInitialFrame.removeShapeFromFrame(codeShape);
                    }
                    
                    // Add to new frame
                    if (finalFrame) {
                        finalFrame.addShapeToFrame(codeShape);
                    }
                    
                    // Track the frame change for undo
                    if (frameChanged) {
                        pushFrameAttachmentAction(finalFrame || draggedCodeInitialFrame, codeShape, 
                            finalFrame ? 'attach' : 'detach', draggedCodeInitialFrame);
                    }
                } else if (draggedCodeInitialFrame) {
                    // Shape stayed in same frame, restore clipping
                    draggedCodeInitialFrame.restoreToFrame(codeShape);
                }
            }

            selectedCodeBlock.setAttribute("data-x", finalTranslateX);
            selectedCodeBlock.setAttribute("data-y", finalTranslateY);
        }

        draggedCodeInitialFrame = null;

    } else if (isCodeResizing && selectedCodeBlock) {
        const codeElement = selectedCodeBlock.querySelector('text');
        if (codeElement) {
            const finalFontSize = codeElement.getAttribute("font-size");
            const initialFontSize = startCodeFontSize;

            const currentTransform = selectedCodeBlock.transform.baseVal.consolidate();
            if (currentTransform && initialFontSize !== parseFloat(finalFontSize)) {
                const finalTranslateX = currentTransform.matrix.e;
                const finalTranslateY = currentTransform.matrix.f;

                pushTransformAction(
                    {
                        type: 'code',
                        element: selectedCodeBlock,
                        shapeName: 'code'
                    },
                    {
                        x: initialCodeGroupTx,
                        y: initialCodeGroupTy,
                        fontSize: initialFontSize,
                        rotation: extractRotationFromTransform(selectedCodeBlock) || 0
                    },
                    {
                        x: finalTranslateX,
                        y: finalTranslateY,
                        fontSize: parseFloat(finalFontSize),
                        rotation: extractRotationFromTransform(selectedCodeBlock) || 0
                    }
                );

                selectedCodeBlock.setAttribute("data-x", finalTranslateX);
                selectedCodeBlock.setAttribute("data-y", finalTranslateY);
            }

            clearTimeout(selectedCodeBlock.updateFeedbackTimeout);
            updateCodeSelectionFeedback();
        }
    } else if (isCodeRotating && selectedCodeBlock) {
        const currentTransform = selectedCodeBlock.transform.baseVal.consolidate();
        if (currentTransform && codeRotationStartTransform) {
            const initialRotation = Math.atan2(codeRotationStartTransform.b, codeRotationStartTransform.a) * 180 / Math.PI;
            const finalRotation = extractRotationFromTransform(selectedCodeBlock) || 0;

            if (Math.abs(initialRotation - finalRotation) > 1) {
                pushTransformAction(
                    {
                        type: 'code',
                        element: selectedCodeBlock,
                        shapeName: 'code'
                    },
                    {
                        x: codeRotationStartTransform.e,
                        y: codeRotationStartTransform.f,
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
        updateCodeSelectionFeedback();
    }

    // Clear frame highlighting
    if (hoveredCodeFrame) {
        hoveredCodeFrame.removeHighlight();
        hoveredCodeFrame = null;
    }

    // Handle code deselection when clicking outside
    if (isSelectionToolActive) {
        const targetGroup = event.target.closest('g[data-type="code-group"]');
        const isResizeHandle = event.target.closest('.resize-handle');
        const isRotateAnchor = event.target.closest('.rotate-anchor');
        
        // If we didn't click on code block or its controls, deselect
        if (!targetGroup && !isResizeHandle && !isRotateAnchor && selectedCodeBlock) {
            deselectCodeBlock();
        }
    }

    isCodeDragging = false;
    isCodeResizing = false;
    isCodeRotating = false;
    currentCodeResizeHandle = null;
    startCodePoint = null;
    startCodeBBox = null;
    startCodeFontSize = null;
    codeDragOffsetX = undefined;
    codeDragOffsetY = undefined;
    initialCodeHandlePosRelGroup = null;
    initialCodeGroupTx = 0;
    initialCodeGroupTy = 0;
    codeRotationStartAngle = 0;
    codeRotationStartTransform = null;

    svg.style.cursor = 'default';

    svg.removeEventListener('pointermove', handleCodeMouseMove);
    svg.removeEventListener('pointerup', handleCodeMouseUp);
};


function extractRotationFromTransform(element) {
    const currentTransform = element.transform.baseVal.consolidate();
    if (currentTransform) {
        const matrix = currentTransform.matrix;
        return Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
    }
    return 0;
}

const handleCodeMouseDown = function (e) {
    if (!e.target) return;
    // Check for contenteditable code editor (new style)
    const activeContentEditor = document.querySelector(".svg-code-editor[contenteditable='true']");
    if (activeContentEditor) {
        const editorContainer = activeContentEditor.closest('.svg-code-container');
        if (editorContainer && editorContainer.contains(e.target)) {
            return;
        }
        let codeElement = activeContentEditor.originalCodeElement;
        if (codeElement) {
            renderCodeFromEditor(activeContentEditor, codeElement, true);
        } else if (editorContainer && document.body.contains(editorContainer)) {
            document.body.removeChild(editorContainer);
        }
    }
    // Check for textarea code editor (legacy style)
    const activeEditor = document.querySelector("textarea.svg-code-editor");
    if (activeEditor && activeEditor.contains(e.target)) {
         return;
    }
    if (activeEditor && !activeEditor.contains(e.target)) {
         let codeElement = activeEditor.originalCodeElement;
         if (codeElement) {
            renderCode(activeEditor, codeElement, true);
         } else if (document.body.contains(activeEditor)){
             document.body.removeChild(activeEditor);
         }
    }

    const targetGroup = e.target.closest('g[data-type="code-group"]');

    if (isSelectionToolActive && e.button === 0) {
        if (targetGroup) {
             if (e.target.closest('.resize-handle') || e.target.closest('.rotate-anchor')) {
                 return; // Let resize/rotate handlers manage
             }
            
            // If clicking on the code block itself, select it and start drag
            if (targetGroup === selectedCodeBlock) {
                startCodeDrag(e);
            } else {
                selectCodeBlock(targetGroup);
                startCodeDrag(e);
            }
        } else {
            deselectCodeBlock();
        }

    } else if ((isCodeToolActive || isTextToolActive)  && e.button === 0) {
        if (targetGroup) {
            const codeElement = targetGroup.querySelector('text');

            if (codeElement && (e.target.tagName === "text" || e.target.tagName === "tspan")) {
                makeCodeEditable(codeElement, targetGroup, e); // Pass click event for position
                e.stopPropagation();
            } else {
                 deselectCodeBlock();
                 addCodeBlock(e);
            }
        } else {
             deselectCodeBlock();
             addCodeBlock(e);
        }
    }
};


// updateAttachedArrows is imported from drawArrow.js

codeTextColorOptions.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation();
        codeTextColorOptions.forEach((el) => el.classList.remove("selected"));
        span.classList.add("selected");

        const newColor = span.getAttribute("data-id");
        const oldColor = codeTextColor;
        codeTextColor = newColor;

        if (selectedCodeBlock) {
            const codeEditor = selectedCodeBlock.querySelector('.svg-code-editor');
            if (codeEditor) {
                const currentColor = codeEditor.style.color;

                if (currentColor !== newColor) {
                    pushOptionsChangeAction(
                        {
                            type: 'code',
                            element: selectedCodeBlock,
                            shapeName: 'code'
                        },
                        {
                            color: currentColor,
                            font: codeEditor.style.fontFamily,
                            size: codeEditor.style.fontSize,
                            align: codeEditor.style.textAlign // Although mostly 'left'
                        },
                        {
                            color: newColor,
                            font: codeEditor.style.fontFamily,
                            size: codeEditor.style.fontSize,
                            align: codeEditor.style.textAlign
                        }
                    );
                }

                codeEditor.style.color = newColor;
                updateSyntaxHighlighting(codeEditor); // Re-highlight with new color
            }
        }
    });
});

codeTextFontOptions.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation();
        codeTextFontOptions.forEach((el) => el.classList.remove("selected"));
        span.classList.add("selected");

        const newFont = span.getAttribute("data-id");
        const oldFont = codeTextFont;
        codeTextFont = newFont;

        if (selectedCodeBlock) {
            const codeEditor = selectedCodeBlock.querySelector('.svg-code-editor');
            if (codeEditor) {
                const currentFont = codeEditor.style.fontFamily;

                if (currentFont !== newFont) {
                    pushOptionsChangeAction(
                        {
                            type: 'code',
                            element: selectedCodeBlock,
                            shapeName: 'code'
                        },
                        {
                            color: codeEditor.style.color,
                            font: currentFont,
                            size: codeEditor.style.fontSize,
                            align: codeEditor.style.textAlign
                        },
                        {
                            color: codeEditor.style.color,
                            font: newFont,
                            size: codeEditor.style.fontSize,
                            align: codeEditor.style.textAlign
                        }
                    );
                }

                codeEditor.style.fontFamily = newFont;
                updateSyntaxHighlighting(codeEditor); // Re-highlight with new font
                setTimeout(updateCodeSelectionFeedback, 0);
            }
        }
    });
});

codeTextSizeOptions.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation();
        codeTextSizeOptions.forEach((el) => el.classList.remove("selected"));
        span.classList.add("selected");

        const newSize = span.getAttribute("data-id") + "px";
        const oldSize = codeTextSize;
        codeTextSize = newSize;

        if (selectedCodeBlock) {
            const codeEditor = selectedCodeBlock.querySelector('.svg-code-editor');
            if (codeEditor) {
                const currentSize = codeEditor.style.fontSize;

                if (currentSize !== newSize) {
                    pushOptionsChangeAction(
                        {
                            type: 'code',
                            element: selectedCodeBlock,
                            shapeName: 'code'
                        },
                        {
                            color: codeEditor.style.color,
                            font: codeEditor.style.fontFamily,
                            size: currentSize,
                            align: codeEditor.style.textAlign
                        },
                        {
                            color: codeEditor.style.color,
                            font: codeEditor.style.fontFamily,
                            size: newSize,
                            align: codeEditor.style.textAlign
                        }
                    );
                }

                codeEditor.style.fontSize = newSize;
                adjustCodeEditorSize(codeEditor); // Adjust container size as font size changes
                updateSyntaxHighlighting(codeEditor); // Re-highlight with new size
                setTimeout(updateCodeSelectionFeedback, 0);
            }
        }
    });
});

codeTextAlignOptions.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation();
        codeTextAlignOptions.forEach((el) => el.classList.remove("selected"));
        span.classList.add("selected");

        const newAlign = span.getAttribute("data-id");
        const oldAlign = codeTextAlign;
        codeTextAlign = newAlign;

        if (selectedCodeBlock) {
            const codeEditor = selectedCodeBlock.querySelector('.svg-code-editor');
            if (codeEditor) {
                const currentAlign = codeEditor.style.textAlign;

                if (currentAlign !== newAlign) {
                    pushOptionsChangeAction(
                        {
                            type: 'code',
                            element: selectedCodeBlock,
                            shapeName: 'code'
                        },
                        {
                            color: codeEditor.style.color,
                            font: codeEditor.style.fontFamily,
                            size: codeEditor.style.fontSize,
                            align: currentAlign
                        },
                        {
                            color: codeEditor.style.color,
                            font: codeEditor.style.fontFamily,
                            size: codeEditor.style.fontSize,
                            align: newAlign
                        }
                    );
                }
                // Code is typically left-aligned, but if user forces, apply it.
                // Note: Highlight.js might override some text-alignment styles on its own.
                codeEditor.style.textAlign = newAlign; 
                setTimeout(updateCodeSelectionFeedback, 0);
            }
        }
    });
});



const editorStyles = `
.svg-code-container {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    border-radius: 6px;
}

.svg-code-editor {
    scrollbar-width: thin;
    scrollbar-color: #484f58 #161b22;
}

.svg-code-editor::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

.svg-code-editor::-webkit-scrollbar-track {
    background: #161b22;
    border-radius: 6px;
}

.svg-code-editor::-webkit-scrollbar-thumb {
    background: #484f58;
    border-radius: 6px;
}

.svg-code-editor::-webkit-scrollbar-thumb:hover {
    background: #6e7681;
}

/* Language detection indicator */
.svg-code-container::after {
    content: attr(data-language);
    position: absolute;
    top: -20px;
    right: 0;
    background: #007acc;
    color: white;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 10px;
    font-family: monospace;
    opacity: 0.8;
}
`;


if (!document.getElementById('code-editor-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'code-editor-styles';
    styleSheet.textContent = editorStyles;
    document.head.appendChild(styleSheet);
}

function setCodeLanguage(lang) {
    codeLanguage = lang;
    // Update selected code block's language if one is selected
    if (selectedCodeBlock) {
        const codeElement = selectedCodeBlock.querySelector('text');
        if (codeElement) {
            codeElement.setAttribute("data-language", lang);
        }
    }
}

function getCodeLanguage() {
    return codeLanguage;
}

function getSelectedCodeBlock() {
    return selectedCodeBlock;
}

export {
    handleCodeMouseDown,
    handleCodeMouseMove,
    handleCodeMouseUp,
    addCodeBlock,
    wrapCodeElement,
    selectCodeBlock,
    deselectCodeBlock,
    makeCodeEditable,
    applySyntaxHighlightingToSVG,
    createHighlightedSVGText,
    updateCodeBackground,
    extractTextFromCodeElement,
    setCodeLanguage,
    getCodeLanguage,
    getSelectedCodeBlock
};
