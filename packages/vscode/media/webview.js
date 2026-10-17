/* eslint-disable */
/**
 * LixSketch VS Code Webview Bridge
 * Exact website behavior. Auto-save is silent; toast only on Ctrl+S.
 */
(function () {
    const vscode = acquireVsCodeApi();
    const svgEl = document.getElementById('freehand-canvas');
    if (!svgEl) return;

    svgEl.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);

    let engine = null;
    let saveTimeout = null;
    let isLoading = false;
    let toolLocked = false;

    // ═══════════ TOOLBAR ═══════════
    const toolBtns = document.querySelectorAll('.tool-btn[data-tool]');
    const toolLockBtn = document.querySelector('.tool-btn[data-action="toollock"]');

    function setActiveTool(tool) {
        if (engine) engine.setActiveTool(tool);
        toolBtns.forEach(b => b.classList.remove('active'));
        const btn = document.querySelector(`.tool-btn[data-tool="${tool}"]`);
        if (btn) btn.classList.add('active');
        updateSidebar(tool);
    }

    toolBtns.forEach(btn => {
        btn.addEventListener('click', () => setActiveTool(btn.getAttribute('data-tool')));
    });

    if (toolLockBtn) {
        toolLockBtn.addEventListener('click', () => {
            toolLocked = !toolLocked;
            toolLockBtn.classList.toggle('active', toolLocked);
            const icon = toolLockBtn.querySelector('i');
            if (icon) icon.className = toolLocked ? 'bx bxs-lock-alt' : 'bx bx-lock-alt';
        });
    }

    const shortcutMap = {
        'v': 'select', 'h': 'pan', 'r': 'rectangle', 'o': 'circle',
        'a': 'arrow', 'l': 'line', 't': 'text', 'p': 'freehand',
        'e': 'eraser', 'f': 'frame', 'k': 'laser', 'd': 'freehand',
        '9': 'image', 'i': 'icon',
    };

    document.addEventListener('keydown', (e) => {
        const tag = e.target.tagName;
        const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable;

        // Ctrl+S = manual save with toast
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            doManualSave();
            return;
        }

        // Ctrl+/ = shortcuts modal
        if ((e.ctrlKey || e.metaKey) && e.key === '/') {
            e.preventDefault();
            toggleModal('shortcuts-modal');
            return;
        }

        // Escape = close modals/menu, or deselect
        if (e.key === 'Escape') {
            if (closeAnyOpen()) return;
        }

        // Don't handle tool shortcuts when typing
        if (isInput) return;

        // Tool shortcuts
        const tool = shortcutMap[e.key.toLowerCase()];
        if (tool && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            setActiveTool(tool);
            return;
        }

        // Q = tool lock
        if (e.key.toLowerCase() === 'q' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            if (toolLockBtn) toolLockBtn.click();
            return;
        }

        // ? = help
        if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            toggleModal('help-modal');
            return;
        }

        // Alt+/ = canvas properties
        if (e.altKey && e.key === '/') {
            e.preventDefault();
            openCanvasProperties();
            return;
        }

        // Alt+S = snap to objects
        if (e.altKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            prefState.snapObjects = !prefState.snapObjects;
            applyPreference('snapObjects', prefState.snapObjects);
            updatePrefCheck('snapObjects');
            return;
        }

        // Alt+Z = zen mode
        if (e.altKey && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            prefState.zenMode = !prefState.zenMode;
            applyPreference('zenMode', prefState.zenMode);
            updatePrefCheck('zenMode');
            return;
        }

        // Alt+R = view mode
        if (e.altKey && e.key.toLowerCase() === 'r') {
            e.preventDefault();
            prefState.viewMode = !prefState.viewMode;
            applyPreference('viewMode', prefState.viewMode);
            updatePrefCheck('viewMode');
            return;
        }

        // Ctrl+Z / Ctrl+Shift+Z
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) { if (engine && engine.redo) engine.redo(); }
            else { if (engine && engine.undo) engine.undo(); }
            return;
        }

        // Ctrl+0/+/-
        if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); if (window.resetZoom) window.resetZoom(); return; }
        if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); if (window.zoomIn) window.zoomIn(); return; }
        if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); if (window.zoomOut) window.zoomOut(); return; }

        // Delete/Backspace = delete selected shapes (NOT save)
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (window.deleteSelectedShapes) {
                e.preventDefault();
                window.deleteSelectedShapes();
            }
            return;
        }
    });

    // ═══════════ SIDEBARS ═══════════
    const sidebarMap = {
        'rectangle': 'sidebar-rectangle', 'circle': 'sidebar-circle',
        'arrow': 'sidebar-arrow', 'line': 'sidebar-line',
        'freehand': 'sidebar-freehand', 'text': 'sidebar-text',
        'frame': 'sidebar-frame', 'image': 'sidebar-image',
    };

    function updateSidebar(tool) {
        // Hide all bottom sidebars
        document.querySelectorAll('.sb').forEach(s => s.style.display = 'none');
        // Close all popovers
        document.querySelectorAll('.popover').forEach(p => p.style.display = 'none');
        document.querySelectorAll('.tb-btn').forEach(b => b.classList.remove('open'));
        // Icon panel is special (right side)
        const iconPanel = document.getElementById('sidebar-icon');
        if (tool === 'icon') {
            if (iconPanel) { iconPanel.style.display = 'flex'; fetchIcons('', ''); }
        } else {
            if (iconPanel) iconPanel.style.display = 'none';
        }
        const id = sidebarMap[tool];
        if (id) { const el = document.getElementById(id); if (el) el.style.display = 'flex'; }
    }

    // ═══════════ POPOVER SYSTEM ═══════════
    // Toggle popover on button click
    document.querySelectorAll('.tb-btn[data-popover]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const popId = 'pop-' + btn.dataset.popover;
            const pop = document.getElementById(popId);
            if (!pop) return;
            const isOpen = pop.style.display === 'block';
            // Close all popovers first
            document.querySelectorAll('.popover').forEach(p => p.style.display = 'none');
            document.querySelectorAll('.tb-btn').forEach(b => b.classList.remove('open'));
            if (!isOpen) {
                pop.style.display = 'block';
                btn.classList.add('open');
            }
        });
    });

    // Close popovers on outside click
    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('.tb-wrap')) {
            document.querySelectorAll('.popover').forEach(p => p.style.display = 'none');
            document.querySelectorAll('.tb-btn').forEach(b => b.classList.remove('open'));
        }
    });

    // Color swatches inside popovers
    document.querySelectorAll('.color-grid').forEach(grid => {
        grid.addEventListener('click', (e) => {
            const swatch = e.target.closest('.cs');
            if (!swatch) return;
            grid.querySelectorAll('.cs').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            const prop = grid.dataset.prop, value = swatch.dataset.value;
            // Update the color dot preview
            const dotId = grid.dataset.dot;
            if (dotId) {
                const dot = document.getElementById(dotId);
                if (dot) {
                    if (value === 'transparent') {
                        dot.style.background = 'transparent';
                        dot.innerHTML = '<svg viewBox="0 0 16 16" style="width:100%;height:100%"><line x1="2" y1="14" x2="14" y2="2" stroke="#666" stroke-width="1.5"/></svg>';
                    } else {
                        dot.style.background = value;
                        dot.innerHTML = '';
                    }
                }
            }
            if (prop && value !== undefined && window.setShapeProperty) window.setShapeProperty(prop, value);
        });
    });

    // Option buttons (width, style, type, fill pattern, etc.)
    document.querySelectorAll('.pop-row, .pop-col').forEach(row => {
        row.addEventListener('click', (e) => {
            const opt = e.target.closest('.pop-opt, .pop-opt-row');
            if (!opt) return;
            row.querySelectorAll('.pop-opt, .pop-opt-row').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            const prop = row.dataset.prop, value = opt.dataset.value;
            if (prop && value !== undefined && window.setShapeProperty) window.setShapeProperty(prop, value);
            // Arrow type -> show/hide curvature row
            if (prop === 'arrowType') {
                const curvRow = row.parentElement.querySelector('.curvature-row');
                if (curvRow) curvRow.style.display = value === 'curved' ? 'flex' : 'none';
            }
        });
    });

    // Layer buttons
    document.querySelectorAll('.tb-layer').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            if (action && window[action]) window[action]();
        });
    });

    // Range sliders
    document.querySelectorAll('.sb-range').forEach(range => {
        range.addEventListener('input', () => {
            const prop = range.dataset.prop;
            const value = parseFloat(range.value);
            if (prop === 'opacity') {
                const label = document.getElementById('opacity-val');
                if (label) label.textContent = Math.round(value * 100) + '%';
            }
            if (prop && window.setShapeProperty) window.setShapeProperty(prop, value);
        });
    });

    // ═══════════ ICON PANEL ═══════════
    const ICON_API = 'https://sketch.elixpo.com/api/icons/search';
    let iconDebounce = null;

    const iconSearch = document.getElementById('icon-search');
    const iconGrid = document.getElementById('icon-grid');
    const iconPanelClose = document.getElementById('icon-panel-close');

    if (iconPanelClose) {
        iconPanelClose.addEventListener('click', () => {
            const panel = document.getElementById('sidebar-icon');
            if (panel) panel.style.display = 'none';
            setActiveTool('select');
        });
    }

    // Category tabs
    document.querySelectorAll('.icon-cat').forEach(cat => {
        cat.addEventListener('click', () => {
            document.querySelectorAll('.icon-cat').forEach(c => c.classList.remove('active'));
            cat.classList.add('active');
            fetchIcons(iconSearch ? iconSearch.value : '', cat.dataset.cat);
        });
    });

    // Search input (debounced)
    if (iconSearch) {
        iconSearch.addEventListener('input', () => {
            if (iconDebounce) clearTimeout(iconDebounce);
            iconDebounce = setTimeout(() => {
                const activeCat = document.querySelector('.icon-cat.active');
                fetchIcons(iconSearch.value, activeCat ? activeCat.dataset.cat : '');
            }, 300);
        });
    }

    async function fetchIcons(query, category) {
        if (!iconGrid) return;
        iconGrid.innerHTML = '<div class="icon-loading"><i class="bx bx-loader-alt bx-spin"></i> Loading...</div>';
        try {
            const params = new URLSearchParams();
            if (query) params.set('q', query);
            if (category) params.set('category', category);
            params.set('inline', '1');
            const res = await fetch(ICON_API + '?' + params.toString());
            if (!res.ok) throw new Error('fetch failed');
            const data = await res.json();
            const results = data.results || [];
            if (results.length === 0) {
                iconGrid.innerHTML = '<div class="icon-empty">No icons found</div>';
                return;
            }
            iconGrid.innerHTML = '';
            results.forEach(icon => {
                const btn = document.createElement('button');
                btn.className = 'icon-cell';
                btn.title = icon.filename || icon.name || '';
                // Icons come as inline SVG strings
                if (icon.svg && icon.svg.startsWith('<svg')) {
                    btn.innerHTML = icon.svg;
                } else if (icon.url) {
                    btn.innerHTML = '<img src="' + icon.url + '" alt="" style="width:24px;height:24px;filter:invert(1)" />';
                }
                btn.addEventListener('click', () => {
                    if (window.placeIconOnCanvas) {
                        window.placeIconOnCanvas(icon);
                    }
                });
                iconGrid.appendChild(btn);
            });
        } catch (err) {
            iconGrid.innerHTML = '<div class="icon-empty">Failed to load icons</div>';
            console.warn('[LixSketch] Icon fetch error:', err);
        }
    }

    // ═══════════ HEADER ═══════════
    const menuBtn = document.getElementById('menuBtn');
    const appMenu = document.getElementById('app-menu');
    const menuBackdrop = document.getElementById('menu-backdrop');
    const shortcutsBtn = document.getElementById('shortcutsBtn');
    const helpBtn = document.getElementById('helpBtn');

    function toggleMenu() {
        const open = appMenu.style.display === 'none';
        appMenu.style.display = open ? 'block' : 'none';
        menuBackdrop.style.display = open ? 'block' : 'none';
    }

    if (menuBtn) menuBtn.addEventListener('click', toggleMenu);
    if (menuBackdrop) menuBackdrop.addEventListener('click', toggleMenu);
    if (shortcutsBtn) shortcutsBtn.addEventListener('click', () => toggleModal('shortcuts-modal'));
    if (helpBtn) helpBtn.addEventListener('click', () => toggleModal('help-modal'));

    // Menu items
    document.querySelectorAll('.menu-item[data-action]').forEach(item => {
        item.addEventListener('click', () => {
            const action = item.dataset.action;
            toggleMenu();
            if (action === 'help') toggleModal('help-modal');
            if (action === 'shortcuts') toggleModal('shortcuts-modal');
            if (action === 'canvasProperties') openCanvasProperties();
            if (action === 'resetCanvas') {
                if (engine && engine.scene && engine.scene.reset) engine.scene.reset();
            }
        });
    });

    // Preferences submenu toggle
    const prefToggleBtn = document.getElementById('pref-toggle-btn');
    const prefSubmenu = document.getElementById('pref-submenu');
    if (prefToggleBtn && prefSubmenu) {
        prefToggleBtn.addEventListener('click', () => {
            const open = prefSubmenu.style.display === 'none';
            prefSubmenu.style.display = open ? 'block' : 'none';
            const chevron = prefToggleBtn.querySelector('.pref-chevron');
            if (chevron) chevron.classList.toggle('open', open);
        });
    }

    // Preference state tracking
    const prefState = {
        toolLock: false, snapObjects: false, toggleGrid: false,
        zenMode: false, viewMode: false, properties: false,
        arrowBinding: true, snapMidpoints: true,
    };

    // Preference item clicks
    document.querySelectorAll('.pref-item').forEach(item => {
        item.addEventListener('click', () => {
            const pref = item.dataset.pref;
            if (!pref) return;
            prefState[pref] = !prefState[pref];
            const check = item.querySelector('.pref-check');
            if (check) {
                check.style.visibility = prefState[pref] ? 'visible' : 'hidden';
                check.style.color = 'var(--accent-blue)';
            }
            applyPreference(pref, prefState[pref]);
        });
    });

    function updatePrefCheck(pref) {
        const item = document.querySelector(`.pref-item[data-pref="${pref}"]`);
        if (!item) return;
        const check = item.querySelector('.pref-check');
        if (check) {
            check.style.visibility = prefState[pref] ? 'visible' : 'hidden';
            check.style.color = 'var(--accent-blue)';
        }
    }

    function applyPreference(pref, value) {
        if (pref === 'toolLock') {
            toolLocked = value;
            if (toolLockBtn) {
                toolLockBtn.classList.toggle('active', value);
                const icon = toolLockBtn.querySelector('i');
                if (icon) icon.className = value ? 'bx bxs-lock-alt' : 'bx bx-lock-alt';
            }
        }
        if (pref === 'toggleGrid' && window.toggleGrid) window.toggleGrid();
        if (pref === 'snapObjects' && window.toggleSnapToObjects) window.toggleSnapToObjects();
        if (pref === 'zenMode' && window.toggleZenMode) window.toggleZenMode();
        if (pref === 'viewMode' && window.toggleViewMode) window.toggleViewMode();
        if (pref === 'properties') openCanvasProperties();
        if (pref === 'arrowBinding' && window.toggleArrowBinding) window.toggleArrowBinding();
        if (pref === 'snapMidpoints' && window.toggleSnapMidpoints) window.toggleSnapMidpoints();
    }

    // Canvas Properties modal
    function openCanvasProperties() {
        // Gather stats
        const shapes = window.shapes || [];
        const propName = document.getElementById('prop-name');
        const propShapes = document.getElementById('prop-shapes');
        const propViewport = document.getElementById('prop-viewport');
        const propZoom = document.getElementById('prop-zoom');
        const propBreakdown = document.getElementById('prop-breakdown');

        if (propShapes) propShapes.textContent = shapes.length;

        if (propViewport) {
            const vb = window.currentViewBox;
            if (vb) propViewport.textContent = Math.round(vb.width) + ' × ' + Math.round(vb.height);
        }

        if (propZoom) {
            propZoom.textContent = Math.round((window.currentZoom || 1) * 100) + '%';
        }

        if (propBreakdown) {
            const counts = {};
            shapes.forEach(s => {
                const name = s.shapeName || s.constructor?.name || 'unknown';
                counts[name] = (counts[name] || 0) + 1;
            });
            if (Object.keys(counts).length === 0) {
                propBreakdown.innerHTML = '<span style="color:var(--text-dim);font-size:11px">No shapes yet</span>';
            } else {
                propBreakdown.innerHTML = Object.entries(counts)
                    .map(([k, v]) => '<span class="props-badge">' + k + ' <strong>' + v + '</strong></span>')
                    .join('');
            }
        }

        toggleModal('canvas-props-modal');
    }

    // Canvas background swatches
    document.querySelectorAll('.bg-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
            document.querySelectorAll('.bg-swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            const bg = swatch.dataset.bg;
            svgEl.style.background = bg;
        });
    });

    // ═══════════ MODALS ═══════════
    function toggleModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.style.display = modal.style.display === 'none' ? 'flex' : 'none';
    }

    // Close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.close;
            if (id) document.getElementById(id).style.display = 'none';
        });
    });

    // Click backdrop to close
    document.querySelectorAll('.modal-backdrop').forEach(bd => {
        bd.addEventListener('click', () => {
            bd.parentElement.style.display = 'none';
        });
    });

    function closeAnyOpen() {
        let closed = false;
        document.querySelectorAll('.modal-overlay').forEach(m => {
            if (m.style.display !== 'none') { m.style.display = 'none'; closed = true; }
        });
        if (appMenu.style.display !== 'none') { toggleMenu(); closed = true; }
        return closed;
    }

    // ═══════════ FOOTER ═══════════
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    if (undoBtn) undoBtn.addEventListener('click', () => { if (engine && engine.undo) engine.undo(); });
    if (redoBtn) redoBtn.addEventListener('click', () => { if (engine && engine.redo) engine.redo(); });

    // ═══════════ AUTO-SAVE (silent, no toast) ═══════════
    const saveDot = document.getElementById('save-status');

    function scheduleAutoSave() {
        if (isLoading) return;
        // Mark as unsaved
        if (saveDot) saveDot.classList.add('unsaved');
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            if (!engine || !engine.scene) return;
            try {
                const sceneData = engine.scene.save('VS Code Diagram');
                if (sceneData) {
                    const json = typeof sceneData === 'string' ? sceneData : JSON.stringify(sceneData, null, 2);
                    vscode.postMessage({ type: 'update', content: json });
                    if (saveDot) saveDot.classList.remove('unsaved');
                }
            } catch (err) {
                console.warn('[LixSketch] Auto-save error:', err);
            }
        }, 800);
    }

    // ═══════════ MANUAL SAVE (Ctrl+S, with toast) ═══════════
    function doManualSave() {
        if (!engine || !engine.scene) return;
        try {
            const sceneData = engine.scene.save('VS Code Diagram');
            if (sceneData) {
                const json = typeof sceneData === 'string' ? sceneData : JSON.stringify(sceneData, null, 2);
                vscode.postMessage({ type: 'manual-save', content: json });
                if (saveDot) saveDot.classList.remove('unsaved');
                showSaveToast();
            }
        } catch (err) {
            console.warn('[LixSketch] Save error:', err);
        }
    }

    function showSaveToast() {
        const toast = document.getElementById('save-toast');
        if (!toast) return;
        toast.style.display = 'flex';
        setTimeout(() => { toast.style.display = 'none'; }, 1800);
    }

    // Observe SVG mutations for auto-save
    const observer = new MutationObserver(() => scheduleAutoSave());

    // ═══════════ AI DIAGRAM BUTTON ═══════════
    const aiDiagramBtn = document.querySelector('.tool-btn[data-action="ai-diagrams"]');
    if (aiDiagramBtn) {
        aiDiagramBtn.addEventListener('click', () => toggleModal('ai-diagram-modal'));
    }

    // ═══════════ IMAGE SOURCE PICKER ═══════════
    const imagePicker = document.getElementById('image-source-picker');
    let imagePickerOpen = false;

    function showImageSourcePicker() {
        if (!imagePicker) return;
        // Position next to the image tool button
        const imgBtn = document.querySelector('.tool-btn[data-tool="image"]');
        if (imgBtn) {
            const rect = imgBtn.getBoundingClientRect();
            imagePicker.style.left = (rect.right + 10) + 'px';
            imagePicker.style.top = (rect.top - 10) + 'px';
        } else {
            imagePicker.style.left = '65px';
            imagePicker.style.top = (window.innerHeight / 2 - 50) + 'px';
        }
        imagePicker.style.display = 'block';
        imagePickerOpen = true;

        // Close on outside click (delayed to not catch opening click)
        setTimeout(() => {
            const closeHandler = (e) => {
                if (imagePicker && !imagePicker.contains(e.target)) {
                    hideImageSourcePicker();
                    document.removeEventListener('mousedown', closeHandler);
                }
            };
            document.addEventListener('mousedown', closeHandler);
        }, 50);
    }

    function hideImageSourcePicker() {
        if (imagePicker) imagePicker.style.display = 'none';
        imagePickerOpen = false;
    }

    // AI image button
    const aiImageBtn = imagePicker?.querySelector('[data-action="ai-image"]');
    if (aiImageBtn) {
        aiImageBtn.addEventListener('click', () => {
            hideImageSourcePicker();
            setActiveTool('select');
            toggleModal('ai-image-modal');
        });
    }

    // Upload button
    const uploadImageBtn = imagePicker?.querySelector('[data-action="upload-image"]');
    if (uploadImageBtn) {
        uploadImageBtn.addEventListener('click', () => {
            hideImageSourcePicker();
            if (window.openImageFilePicker) window.openImageFilePicker();
        });
    }

    // ═══════════ INIT ENGINE ═══════════
    async function initEngine() {
        try {
            const { createSketchEngine } = LixSketch;
            engine = createSketchEngine(svgEl, {
                initialZoom: 1, minZoom: 0.4, maxZoom: 30,
                onEvent: (type, data) => {
                    if (type === 'zoom:change') {
                        const pct = document.getElementById('zoomPercent');
                        if (pct) pct.textContent = Math.round(data * 100) + '%';
                    }
                    if (type === 'tool:change') {
                        toolBtns.forEach(b => b.classList.remove('active'));
                        const btn = document.querySelector(`.tool-btn[data-tool="${data}"]`);
                        if (btn) btn.classList.add('active');
                        updateSidebar(data);
                    }
                    if (type === 'sidebar:select' && data && data.sidebar) {
                        const mapped = sidebarMap[data.sidebar];
                        if (mapped) {
                            document.querySelectorAll('.sidebar').forEach(s => s.style.display = 'none');
                            const el = document.getElementById(mapped);
                            if (el) el.style.display = 'flex';
                        }
                    }
                    if (type === 'sidebar:clear') {
                        const current = document.querySelector('.tool-btn.active');
                        const tool = current ? current.dataset.tool : 'select';
                        if (!sidebarMap[tool]) {
                            document.querySelectorAll('.sidebar').forEach(s => s.style.display = 'none');
                        }
                    }
                },
            });

            await engine.init();

            // Observe SVG for auto-save (but NOT on every tiny mutation)
            observer.observe(svgEl, { childList: true, subtree: true, attributes: true, characterData: true });

            // Save on mouseup (drawing done), not on every mutation
            svgEl.addEventListener('mouseup', scheduleAutoSave);

            // Zoom controls
            const zoomInBtn = document.getElementById('zoomIn');
            const zoomOutBtn = document.getElementById('zoomOut');
            const zoomPct = document.getElementById('zoomPercent');
            if (zoomInBtn && window.zoomIn) zoomInBtn.addEventListener('click', window.zoomIn);
            if (zoomOutBtn && window.zoomOut) zoomOutBtn.addEventListener('click', window.zoomOut);
            if (zoomPct && window.resetZoom) zoomPct.addEventListener('click', window.resetZoom);

            // Image tool: show picker with AI (coming soon) + upload
            window.__showImageSourcePicker = () => {
                showImageSourcePicker();
            };

            console.log('[LixSketch] Engine initialized');
            vscode.postMessage({ type: 'ready' });
        } catch (err) {
            console.error('[LixSketch] Engine init failed:', err);
        }
    }

    // ═══════════ MESSAGES FROM EXTENSION ═══════════
    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (!msg) return;
        if (msg.type === 'load') {
            if (!engine || !engine.scene) {
                setTimeout(() => window.dispatchEvent(new MessageEvent('message', { data: msg })), 200);
                return;
            }
            try {
                isLoading = true;
                const content = msg.content.trim();
                if (content && content !== '{}') {
                    const sceneData = JSON.parse(content);
                    if (sceneData.shapes && sceneData.shapes.length > 0) {
                        engine.scene.load(sceneData);
                        // Ensure shapes are interactive after load
                        engine.setActiveTool('select');
                    }
                }
            } catch (err) {
                console.warn('[LixSketch] Load error:', err);
            } finally {
                setTimeout(() => { isLoading = false; }, 300);
            }
        }
    });

    initEngine();
})();
