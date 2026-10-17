/* eslint-disable */
/**
 * SketchEngine - Main engine entry point
 *
 * Initializes the SVG canvas, sets up global state (including RoughJS from npm),
 * then dynamically imports all tool and shape modules.
 *
 * IMPORTANT: All globals must be set BEFORE importing modules, because many
 * modules run code at the top level (e.g. `const rc = rough.svg(svg)`) that
 * depends on these globals existing.
 */

import rough from 'roughjs';

class SketchEngine {
    constructor(svgElement, options = {}) {
        if (!svgElement || svgElement.tagName !== 'svg') {
            throw new Error('SketchEngine requires an SVG element');
        }

        this.svg = svgElement;
        // Prevent default touch scrolling/gestures on the canvas to allow for custom pointer events
        this.svg.style.touchAction = 'none';

        this.options = {
            initialZoom: 1,
            minZoom: 0.4,
            maxZoom: 30,
            ...options
        };

        // Event callback for framework consumers (React, Vue, vanilla, VS Code, etc.)
        this.onEvent = options.onEvent || (() => {});

        // Public API surfaces (populated after init)
        this.scene = null;
        this.shapes = null;

        this._modules = {};
        this._initialized = false;
    }

    /**
     * Emit an event to the consumer callback.
     * @param {string} type - Event type (e.g. 'sidebar:select', 'zoom:change')
     * @param {*} data - Event payload
     */
    emit(type, data) {
        try { this.onEvent(type, data); } catch (e) { console.warn('[SketchEngine] onEvent error:', e); }
    }

    /**
     * Set up all the global variables that the tool/shape modules depend on.
     * Must be called BEFORE any module imports.
     */
    _initGlobals() {
        // Core SVG reference
        window.svg = this.svg;
        window.freehandCanvas = this.svg;
        window.__sketchInteractionReady = false;

        // RoughJS from npm
        window.rough = rough;
        window.roughCanvas = rough.svg(this.svg);
        window.roughGenerator = window.roughCanvas.generator;

        // Shape storage
        window.shapes = window.shapes || [];
        window.currentShape = window.currentShape || null;
        window.lastMousePos = window.lastMousePos || null;

        // Zoom state
        window.currentZoom = this.options.initialZoom;
        window.minScale = this.options.minZoom;
        window.maxScale = this.options.maxZoom;
        window.minZoom = this.options.minZoom;
        window.maxZoom = this.options.maxZoom;

        // ViewBox state
        window.currentViewBox = window.currentViewBox || {
            x: 0, y: 0,
            width: window.innerWidth,
            height: window.innerHeight
        };

        // Tool activation flags
        window.isPaintToolActive = false;
        window.isTextToolActive = false;
        window.isCircleToolActive = false;
        window.isSquareToolActive = false;
        window.isLaserToolActive = false;
        window.isEraserToolActive = false;
        window.isImageToolActive = false;
        window.isArrowToolActive = false;
        window.isLineToolActive = false;
        window.isSelectionToolActive = true;
        window.isPanningToolActive = false;
        window.isFrameToolActive = false;
        window.isIconToolActive = false;
        window.isCodeToolActive = false;
        window.isShapeRecognitionToolActive = false;
        window.isPaintBucketToolActive = false;
        window.isLassoToolActive = false;
        window.isWebEmbedToolActive = false;
        window.isTextInCodeMode = false;

        // Pan state
        window.isPanning = false;
        window.panStart = null;
        window.startCanvasX = 0;
        window.startCanvasY = 0;

        // Transform state
        window.currentMatrix = new DOMMatrix();
        window.currentTranslation = { x: 0, y: 0 };

        // Action type constants
        window.ACTION_CREATE = 'create';
        window.ACTION_DELETE = 'delete';
        window.ACTION_MODIFY = 'modify';
        window.ACTION_PASTE = 'paste';

        // History stacks
        window.historyStack = window.historyStack || [];
        window.redoStack = window.redoStack || [];

        // Sidebar element stubs — React sidebars handle UI, but legacy code
        // queries these at top level. Provide dummy elements so it doesn't crash.
        const dummyEl = document.createElement('div');
        dummyEl.classList.add('hidden');
        window.paintBrushSideBar = document.getElementById('paintBrushToolBar') || dummyEl;
        window.lineSideBar = document.getElementById('lineSideBar') || dummyEl;
        window.squareSideBar = document.getElementById('squareSideBar') || dummyEl;
        window.circleSideBar = document.getElementById('circleSideBar') || dummyEl;
        window.arrowSideBar = document.getElementById('arrowSideBar') || dummyEl;
        window.textSideBar = document.getElementById('textToolBar') || dummyEl;
        window.frameSideBar = document.getElementById('frameSideBar') || dummyEl;

        // Zoom control element refs
        window.zoomInBtn = document.getElementById('zoomIn') || dummyEl;
        window.zoomOutBtn = document.getElementById('zoomOut') || dummyEl;
        window.zoomPercentSpan = document.getElementById('zoomPercent') || dummyEl;

        // Container
        window.container = document.querySelector('.container') || document.body;

        // Sidebar control — bridge legacy code to consumer UI
        const engine = this;
        window.disableAllSideBars = function() {
            // Hide all legacy sidebar elements
            [window.paintBrushSideBar, window.lineSideBar, window.squareSideBar,
             window.circleSideBar, window.arrowSideBar, window.textSideBar, window.frameSideBar
            ].forEach(el => { if (el) el.classList.add('hidden'); });
            // Notify consumer via onEvent + legacy bridge
            engine.emit('sidebar:clear');
            if (window.__sketchStoreApi) {
                window.__sketchStoreApi.clearSelectedShapeSidebar();
            }
        };

        // toolExtraPopup — legacy UI function, no-op in React
        window.toolExtraPopup = window.toolExtraPopup || function() {};

        // updateUndoRedoButtons — legacy UI function, no-op in React
        window.updateUndoRedoButtons = window.updateUndoRedoButtons || function() {};

        // Bridge for shape selection -> consumer UI
        // Maps shape.shapeName to the sidebar key
        window.__showSidebarForShape = function(shapeName) {
            const sidebarMap = {
                'rectangle': 'rectangle',
                'circle': 'circle',
                'arrow': 'arrow',
                'line': 'line',
                'freehandStroke': 'paintbrush',
                'text': 'text',
                'code': 'text',
                'frame': 'frame',
                'image': 'image',
            };
            const sidebar = sidebarMap[shapeName];
            // Emit to consumer callback
            engine.emit('sidebar:select', { sidebar, shapeName });
            // Legacy bridge for React
            if (sidebar && window.__sketchStoreApi) {
                window.__sketchStoreApi.setSelectedShapeSidebar(sidebar);
            }
            window.__selectedShapeIsCode = (shapeName === 'code');
            if (window.__onCodeModeChanged) window.__onCodeModeChanged(shapeName === 'code');
        };
    }

    /**
     * Initialize engine: set globals first, then import modules.
     */
    async init() {
        if (this._initialized) return;

        // CRITICAL: Set up ALL globals BEFORE importing modules
        this._initGlobals();

        try {
            // Import shape classes first
            const [
                { Rectangle },
                { Circle },
                { Arrow },
                { Line },
                { TextShape },
                { CodeShape },
                { ImageShape },
                { IconShape },
                { Frame },
                { FreehandStroke }
            ] = await Promise.all([
                import('./shapes/Rectangle.js'),
                import('./shapes/Circle.js'),
                import('./shapes/Arrow.js'),
                import('./shapes/Line.js'),
                import('./shapes/TextShape.js'),
                import('./shapes/CodeShape.js'),
                import('./shapes/ImageShape.js'),
                import('./shapes/IconShape.js'),
                import('./shapes/Frame.js'),
                import('./shapes/FreehandStroke.js')
            ]);

            // Expose shape classes globally
            window.Rectangle = Rectangle;
            window.Circle = Circle;
            window.Arrow = Arrow;
            window.Line = Line;
            window.TextShape = TextShape;
            window.CodeShape = CodeShape;
            window.ImageShape = ImageShape;
            window.IconShape = IconShape;
            window.Frame = Frame;
            window.FreehandStroke = FreehandStroke;

            this._modules.shapes = {
                Rectangle, Circle, Arrow, Line,
                TextShape, CodeShape, ImageShape, IconShape,
                Frame, FreehandStroke
            };

            // Import tool handlers (they run top-level code that reads globals)
            const [
                rectangleTool, circleTool, arrowTool, lineTool,
                textTool, codeTool, imageTool, iconTool,
                frameTool, freehandTool
            ] = await Promise.all([
                import('./tools/rectangleTool.js'),
                import('./tools/circleTool.js'),
                import('./tools/arrowTool.js'),
                import('./tools/lineTool.js'),
                import('./tools/textTool.js'),
                import('./tools/codeTool.js'),
                import('./tools/imageTool.js'),
                import('./tools/iconTool.js'),
                import('./tools/frameTool.js'),
                import('./tools/freehandTool.js')
            ]);

            this._modules.tools = {
                rectangleTool, circleTool, arrowTool, lineTool,
                textTool, codeTool, imageTool, iconTool,
                frameTool, freehandTool
            };

            // Import core modules (EventDispatcher attaches SVG listeners at top level)
            const [
                eventDispatcher, undoRedo, selection,
                zoomPan, copyPaste, eraserTrail,
                resizeShapes, resizeCode
            ] = await Promise.all([
                import('./core/EventDispatcher.js'),
                import('./core/UndoRedo.js'),
                import('./core/Selection.js'),
                import('./core/ZoomPan.js'),
                import('./core/CopyPaste.js'),
                import('./core/EraserTrail.js'),
                import('./core/ResizeShapes.js'),
                import('./core/ResizeCode.js')
            ]);

            this._modules.core = {
                eventDispatcher, undoRedo, selection,
                zoomPan, copyPaste, eraserTrail,
                resizeShapes, resizeCode
            };

            // Re-bind event listeners to the current SVG element
            if (eventDispatcher.initEventDispatcher) {
                eventDispatcher.initEventDispatcher(this.svg);
            }
            window.__sketchInteractionReady = true;

            // Restore only after pointer handlers are bound. This still keeps
            // first canvas paint ahead of optional AI/graph/LixScript chunks,
            // while guaranteeing every visible restored shape is immediately
            // selectable and draggable.
            const sceneSerializer = await import('./core/SceneSerializer.js');
            if (sceneSerializer.initSceneSerializer) sceneSerializer.initSceneSerializer();

            // Import standalone tools
            await Promise.all([
                import('./tools/eraserTool.js'),
                import('./tools/laserTool.js')
            ]);

            // Expose key functions globally
            if (undoRedo.undo) window.undo = undoRedo.undo;
            if (undoRedo.redo) window.redo = undoRedo.redo;
            if (undoRedo.pushCreateAction) window.pushCreateAction = undoRedo.pushCreateAction;
            if (undoRedo.pushDeleteAction) window.pushDeleteAction = undoRedo.pushDeleteAction;
            if (selection.multiSelection) window.multiSelection = selection.multiSelection;
            if (selection.clearAllSelections) window.clearAllSelections = selection.clearAllSelections;

            // Initialize centralized copy/paste system
            if (copyPaste.initCopyPaste) copyPaste.initCopyPaste();

            // Initialize AI renderer bridge
            const aiRenderer = await import('./core/AIRenderer.js');
            if (aiRenderer.initAIRenderer) aiRenderer.initAIRenderer();

            // Initialize graph engine bridge
            const graphEngine = await import('./core/GraphEngine.js');
            if (graphEngine.initGraphEngine) graphEngine.initGraphEngine();

            // Initialize layer ordering
            const layerOrder = await import('./core/LayerOrder.js');
            if (layerOrder.initLayerOrder) layerOrder.initLayerOrder();

            // Initialize LixScript programmatic diagram engine
            const lixScript = await import('./core/LixScriptParser.js');
            if (lixScript.initLixScriptBridge) lixScript.initLixScriptBridge();

            // ── Public API surfaces ──

            // Scene operations (save, load, export, etc.)
            this.scene = window.__sceneSerializer || {
                save: sceneSerializer.saveScene,
                load: sceneSerializer.loadScene,
                download: sceneSerializer.downloadScene,
                upload: sceneSerializer.uploadScene,
                exportPNG: sceneSerializer.exportAsPNG,
                exportPDF: sceneSerializer.exportAsPDF,
                copyAsPNG: sceneSerializer.copyAsPNG,
                copyAsSVG: sceneSerializer.copyAsSVG,
                reset: sceneSerializer.resetCanvas,
                findText: sceneSerializer.findTextOnCanvas,
            };

            // Shape array reference
            this.shapes = window.shapes;

            // Undo/redo
            this.undo = undoRedo.undo || (() => {});
            this.redo = undoRedo.redo || (() => {});

            // LixScript execution
            this.lixscript = {
                parse: lixScript.parseLixScript || (() => null),
                execute: lixScript.executeLixScript || (lixScript.parseLixScript ? (code) => {
                    const parsed = lixScript.parseLixScript(code);
                    if (parsed && lixScript.resolveShapeRefs) lixScript.resolveShapeRefs(parsed);
                    return parsed;
                } : (() => null)),
            };

            // Store module refs for advanced consumers
            this._modules.sceneSerializer = sceneSerializer;
            this._modules.lixScript = lixScript;

            this._initialized = true;
            console.log('[SketchEngine] Initialized successfully');
        } catch (err) {
            console.error('[SketchEngine] Initialization failed:', err);
            throw err;
        }
    }

    /**
     * Sync tool flags from Zustand activeTool value.
     */
    setActiveTool(toolName) {
        // Deselect current shape when switching tools
        if (window.currentShape && typeof window.currentShape.removeSelection === 'function') {
            window.currentShape.removeSelection();
            window.currentShape = null;
        }
        if (typeof window.clearAllSelections === 'function') {
            window.clearAllSelections();
        }
        if (typeof window.disableAllSideBars === 'function') {
            window.disableAllSideBars();
        }

        // Force cleanup eraser trail when switching tools
        if (typeof window.forceCleanupEraserTrail === 'function') {
            window.forceCleanupEraserTrail();
        }
        // Clean up any lingering icon miniature/drag state
        if (typeof window.__cleanupIconTool === 'function') {
            window.__cleanupIconTool();
        }
        if (typeof window.__cancelShapeRecognition === 'function') {
            window.__cancelShapeRecognition();
        }
        if (typeof window.__cancelLasso === 'function') window.__cancelLasso();

        window.isPaintToolActive = false;
        window.isSquareToolActive = false;
        window.isCircleToolActive = false;
        window.isArrowToolActive = false;
        window.isTextToolActive = false;
        window.isLaserToolActive = false;
        window.isLineToolActive = false;
        window.isEraserToolActive = false;
        window.isSelectionToolActive = false;
        window.isImageToolActive = false;
        window.isPanningToolActive = false;
        window.isFrameToolActive = false;
        window.isIconToolActive = false;
        window.isCodeToolActive = false;
        window.isShapeRecognitionToolActive = false;
        window.isPaintBucketToolActive = false;
        window.isLassoToolActive = false;
        window.isWebEmbedToolActive = false;

        const flagMap = {
            select: 'isSelectionToolActive',
            pan: 'isPanningToolActive',
            rectangle: 'isSquareToolActive',
            circle: 'isCircleToolActive',
            line: 'isLineToolActive',
            arrow: 'isArrowToolActive',
            freehand: 'isPaintToolActive',
            text: 'isTextToolActive',
            code: 'isCodeToolActive',
            eraser: 'isEraserToolActive',
            laser: 'isLaserToolActive',
            image: 'isImageToolActive',
            frame: 'isFrameToolActive',
            icon: 'isIconToolActive',
            'draw-shape': 'isShapeRecognitionToolActive',
            'paint-bucket': 'isPaintBucketToolActive',
            lasso: 'isLassoToolActive',
            'web-embed': 'isWebEmbedToolActive',
        };

        const flag = flagMap[toolName];
        if (flag) window[flag] = true;

        if (toolName === 'text' && window.isTextInCodeMode) {
            window.isCodeToolActive = true;
        }

        // Show image source picker when image tool is activated
        if (toolName === 'image' && window.__showImageSourcePicker) {
            window.__showImageSourcePicker();
        }
        if (toolName === 'web-embed') {
            window.__showWebEmbedModal?.();
            window.dispatchEvent(new CustomEvent('lixsketch:open-web-embed'));
        }

        // Set appropriate cursor for the active tool
        const cursorMap = {
            select: 'default',
            pan: 'grab',
            rectangle: 'crosshair',
            circle: 'crosshair',
            line: 'crosshair',
            arrow: 'crosshair',
            freehand: 'crosshair',
            text: 'crosshair',
            code: 'crosshair',
            eraser: 'crosshair',
            laser: 'crosshair',
            image: 'crosshair',
            frame: 'crosshair',
            icon: 'crosshair',
            'draw-shape': 'crosshair',
            'paint-bucket': 'cell',
            lasso: 'crosshair',
            'web-embed': 'crosshair',
        };
        if (this.svg) {
            this.svg.style.cursor = cursorMap[toolName] || 'default';
        }
    }

    cleanup() {
        if (typeof window.__cancelShapeRecognition === 'function') {
            window.__cancelShapeRecognition();
        }
        // Remove event listeners from the SVG element
        if (this._modules.core?.eventDispatcher?.cleanupEventDispatcher) {
            this._modules.core.eventDispatcher.cleanupEventDispatcher();
        }
        window.shapes = [];
        window.currentShape = null;
        window.lastMousePos = null;
        window.__sketchInteractionReady = false;
        delete window.__sceneSerializer;
        this._modules = {};
        this._initialized = false;
        console.log('[SketchEngine] Cleaned up');
    }
}

export { SketchEngine };
export default SketchEngine;
