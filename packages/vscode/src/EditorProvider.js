const vscode = require('vscode');
const path = require('path');

class LixSketchEditorProvider {
    constructor(context) {
        this.context = context;
    }

    resolveCustomTextEditor(document, webviewPanel, _token) {
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this.context.extensionPath, 'media')),
            ],
        };

        // Derive canvas name from file name
        const fileName = path.basename(document.uri.fsPath, '.lixsketch');

        webviewPanel.webview.html = this._getWebviewContent(webviewPanel.webview, fileName);

        let isApplyingEdit = false;

        webviewPanel.webview.onDidReceiveMessage((msg) => {
            switch (msg.type) {
                case 'ready':
                    const text = document.getText();
                    webviewPanel.webview.postMessage({
                        type: 'load',
                        content: text || '{}',
                    });
                    break;

                case 'update':
                    if (msg.content) {
                        isApplyingEdit = true;
                        const edit = new vscode.WorkspaceEdit();
                        edit.replace(
                            document.uri,
                            new vscode.Range(0, 0, document.lineCount, 0),
                            msg.content
                        );
                        vscode.workspace.applyEdit(edit).then(() => {
                            isApplyingEdit = false;
                        });
                    }
                    break;

                case 'manual-save':
                    // Ctrl+S explicit save
                    if (msg.content) {
                        isApplyingEdit = true;
                        const edit = new vscode.WorkspaceEdit();
                        edit.replace(
                            document.uri,
                            new vscode.Range(0, 0, document.lineCount, 0),
                            msg.content
                        );
                        vscode.workspace.applyEdit(edit).then(() => {
                            isApplyingEdit = false;
                            document.save();
                        });
                    }
                    break;
            }
        });

        const changeSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
            if (e.document.uri.toString() === document.uri.toString() && !isApplyingEdit) {
                webviewPanel.webview.postMessage({
                    type: 'load',
                    content: document.getText(),
                });
            }
        });

        webviewPanel.onDidDispose(() => {
            changeSubscription.dispose();
        });
    }

    _getWebviewContent(webview, canvasName) {
        const mediaUri = (file) => webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'media', file))
        );

        const engineUri = mediaUri('engine.bundle.js');
        const webviewJsUri = mediaUri('webview.js');
        const fontsUri = mediaUri('fonts.css');
        const toolbarCssUri = mediaUri('toolbar.css');
        const logoUri = mediaUri('icon.png');
        const nonce = getNonce();

        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none';
                   img-src ${webview.cspSource} data: blob: https:;
                   style-src ${webview.cspSource} 'unsafe-inline' https://unpkg.com;
                   font-src ${webview.cspSource} https://unpkg.com;
                   script-src 'nonce-${nonce}' https://unpkg.com;
                   connect-src https://unpkg.com https://sketch.elixpo.com;">
    <link rel="stylesheet" href="${fontsUri}">
    <link rel="stylesheet" href="${toolbarCssUri}">
    <link rel="stylesheet" href="https://unpkg.com/boxicons@2.1.4/css/boxicons.min.css">
</head>
<body>

    <!-- ═══════════ HEADER ═══════════ -->
    <header id="header">
        <div class="header-left">
            <div class="header-logo" style="background-image:url('${logoUri}')"></div>
            <div class="header-divider-v"></div>
            <input type="text" id="canvas-name" value="${canvasName}" spellcheck="false" placeholder="Untitled" />
        </div>
        <div class="header-right">
            <div id="save-status" class="save-dot" title="Saved to disk"></div>
            <button class="header-btn" id="helpBtn" title="Help (?)"><i class="bx bx-help-circle"></i></button>
            <button class="header-btn" id="shortcutsBtn" title="Shortcuts (Ctrl+/)"><i class="bx bx-command"></i></button>
            <button class="header-btn" id="menuBtn" title="Menu"><i class="bx bx-menu"></i></button>
        </div>
    </header>

    <!-- ═══════════ TOOLBAR ═══════════ -->
    <div id="toolbar">
        <button class="tool-btn tool-lock" data-action="toollock" title="Tool Lock (Q)">
            <i class="bx bx-lock-alt"></i>
            <span class="tool-key">Q</span>
        </button>
        <div class="tool-divider"></div>
        <button class="tool-btn" data-tool="pan" title="Pan (H)">
            <i class="bx bxs-hand"></i><span class="tool-key">H</span>
        </button>
        <button class="tool-btn active" data-tool="select" title="Select (V)">
            <i class="bx bxs-pointer"></i><span class="tool-key">V</span>
        </button>
        <div class="tool-divider"></div>
        <button class="tool-btn" data-tool="rectangle" title="Rectangle (R)">
            <i class="bx bx-square"></i><span class="tool-key">R</span>
        </button>
        <button class="tool-btn" data-tool="circle" title="Circle (O)">
            <i class="bx bx-circle"></i><span class="tool-key">O</span>
        </button>
        <button class="tool-btn" data-tool="line" title="Line (L)">
            <i class="bx bx-minus"></i><span class="tool-key">L</span>
        </button>
        <button class="tool-btn" data-tool="arrow" title="Arrow (A)">
            <i class="bx bx-right-arrow-alt" style="transform:rotate(-45deg)"></i><span class="tool-key">A</span>
        </button>
        <button class="tool-btn" data-tool="text" title="Text (T)">
            <i class="bx bx-text"></i><span class="tool-key">T</span>
        </button>
        <button class="tool-btn" data-tool="freehand" title="Draw (P)">
            <i class="bx bx-pen"></i><span class="tool-key">P</span>
        </button>
        <button class="tool-btn" data-tool="image" title="Image (9)">
            <i class="bx bx-image-alt"></i><span class="tool-key">9</span>
        </button>
        <button class="tool-btn" data-tool="icon" title="Icon (I)">
            <i class="bx bx-wink-smile"></i><span class="tool-key">I</span>
        </button>
        <div class="tool-divider"></div>
        <button class="tool-btn" data-tool="frame" title="Frame (F)">
            <i class="bx bx-crop"></i><span class="tool-key">F</span>
        </button>
        <button class="tool-btn" data-tool="laser" title="Laser (K)">
            <i class="bx bxs-magic-wand"></i><span class="tool-key">K</span>
        </button>
        <button class="tool-btn" data-tool="eraser" title="Eraser (E)">
            <i class="bx bxs-eraser"></i><span class="tool-key">E</span>
        </button>
        <div class="tool-divider"></div>
        <button class="tool-btn" data-action="ai-diagrams" title="AI Diagram Generator">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/>
                <path d="M18 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z"/>
            </svg>
        </button>
    </div>

    <!-- ═══════════ IMAGE SOURCE PICKER (on image tool) ═══════════ -->
    <div id="image-source-picker" style="display:none">
        <button class="img-picker-btn" data-action="ai-image">
            <div class="img-picker-icon ai">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/>
                    <path d="M18 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z"/>
                </svg>
            </div>
            <div class="img-picker-text">
                <div class="img-picker-label">Generate with AI</div>
                <div class="img-picker-desc">Coming soon</div>
            </div>
            <span class="coming-soon-badge">Soon</span>
        </button>
        <div class="img-picker-divider"></div>
        <button class="img-picker-btn" data-action="upload-image">
            <div class="img-picker-icon upload"><i class="bx bx-upload"></i></div>
            <div class="img-picker-text">
                <div class="img-picker-label">Upload from device</div>
                <div class="img-picker-desc">PNG, JPG, SVG, WebP</div>
            </div>
            <kbd class="img-picker-kbd">U</kbd>
        </button>
    </div>

    <!-- ═══════════ AI DIAGRAM MODAL (Coming Soon) ═══════════ -->
    <div id="ai-diagram-modal" class="modal-overlay" style="display:none">
        <div class="modal-backdrop"></div>
        <div class="modal-card" style="max-width:520px">
            <div class="modal-header">
                <h2>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:8px;color:var(--accent)">
                        <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/>
                        <path d="M18 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z"/>
                    </svg>
                    AI Diagram Generator
                </h2>
                <button class="modal-close" data-close="ai-diagram-modal"><i class="bx bx-x"></i></button>
            </div>
            <div class="modal-body">
                <div class="coming-soon-card">
                    <div class="coming-soon-icon">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/>
                            <path d="M18 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z"/>
                        </svg>
                    </div>
                    <h3 class="coming-soon-title">Coming Soon</h3>
                    <p class="coming-soon-desc">
                        Generate diagrams, flowcharts, architecture diagrams, and research paper illustrations from text prompts using AI.
                    </p>
                    <div class="coming-soon-features">
                        <div class="coming-soon-feature"><i class="bx bx-conversation"></i> Text-to-Diagram</div>
                        <div class="coming-soon-feature"><i class="bx bx-code-alt"></i> LixScript Generation</div>
                        <div class="coming-soon-feature"><i class="bx bx-git-merge"></i> Mermaid Import</div>
                        <div class="coming-soon-feature"><i class="bx bx-book-open"></i> Research Paper Illustrations</div>
                    </div>
                    <div class="coming-soon-api-note">
                        <i class="bx bx-key"></i>
                        <span>This feature will require an <strong>API key</strong> to access AI generation services. API key configuration for the VS Code extension is coming in a future update.</span>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- ═══════════ AI IMAGE MODAL (Coming Soon) ═══════════ -->
    <div id="ai-image-modal" class="modal-overlay" style="display:none">
        <div class="modal-backdrop"></div>
        <div class="modal-card" style="max-width:520px">
            <div class="modal-header">
                <h2>
                    <i class="bx bx-image-alt" style="margin-right:8px;color:var(--accent-blue)"></i>
                    AI Image Generator
                </h2>
                <button class="modal-close" data-close="ai-image-modal"><i class="bx bx-x"></i></button>
            </div>
            <div class="modal-body">
                <div class="coming-soon-card">
                    <div class="coming-soon-icon" style="color:var(--accent-blue)">
                        <i class="bx bx-image-alt" style="font-size:40px"></i>
                    </div>
                    <h3 class="coming-soon-title">Coming Soon</h3>
                    <p class="coming-soon-desc">
                        Generate images from text prompts and place them directly on the canvas. Edit images with AI-powered selective brush editing.
                    </p>
                    <div class="coming-soon-features">
                        <div class="coming-soon-feature"><i class="bx bx-image-add"></i> Text-to-Image</div>
                        <div class="coming-soon-feature"><i class="bx bx-brush"></i> AI Image Editing</div>
                        <div class="coming-soon-feature"><i class="bx bx-palette"></i> Multiple Models</div>
                        <div class="coming-soon-feature"><i class="bx bx-expand"></i> Up to 768×768</div>
                    </div>
                    <div class="coming-soon-api-note">
                        <i class="bx bx-key"></i>
                        <span>This feature will require an <strong>API key</strong> to access image generation services. API key configuration for the VS Code extension is coming in a future update.</span>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- ═══════════ SIDEBARS (popover toolbar, matching website) ═══════════ -->

    <!-- Rectangle -->
    <div id="sidebar-rectangle" class="sb" style="display:none">
        <div class="tb-wrap">
            <button class="tb-btn" data-popover="rect-stroke" title="Stroke color"><span class="color-dot" id="rect-stroke-dot" style="background:#fff"></span><svg class="tb-chev" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button>
            <div class="popover" id="pop-rect-stroke"><div class="pop-inner"><p class="pop-label">Stroke</p><div class="color-grid" data-prop="stroke" data-dot="rect-stroke-dot"><button class="cs active" data-value="#fff" style="background:#fff"></button><button class="cs" data-value="#FF8383" style="background:#FF8383"></button><button class="cs" data-value="#3A994C" style="background:#3A994C"></button><button class="cs" data-value="#56A2E8" style="background:#56A2E8"></button><button class="cs" data-value="#FFD700" style="background:#FFD700"></button><button class="cs" data-value="#FF69B4" style="background:#FF69B4"></button><button class="cs" data-value="#A855F7" style="background:#A855F7"></button></div></div><div class="pop-arrow"></div></div>
        </div>
        <div class="tb-div"></div>
        <div class="tb-wrap">
            <button class="tb-btn" data-popover="rect-fill" title="Fill color"><span class="color-dot" id="rect-fill-dot" style="background:transparent"><svg viewBox="0 0 16 16" style="width:100%;height:100%"><line x1="2" y1="14" x2="14" y2="2" stroke="#666" stroke-width="1.5"/></svg></span><svg class="tb-chev" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button>
            <div class="popover" id="pop-rect-fill"><div class="pop-inner"><p class="pop-label">Background</p><div class="color-grid" data-prop="fill" data-dot="rect-fill-dot"><button class="cs active" data-value="transparent"><svg viewBox="0 0 20 20" style="width:14px;height:14px"><line x1="4" y1="16" x2="16" y2="4" stroke="#666" stroke-width="2"/></svg></button><button class="cs" data-value="#f0f0f0" style="background:#f0f0f0"></button><button class="cs" data-value="#ffcccb" style="background:#ffcccb"></button><button class="cs" data-value="#90ee90" style="background:#90ee90"></button><button class="cs" data-value="#add8e6" style="background:#add8e6"></button><button class="cs" data-value="#FFE4B5" style="background:#FFE4B5"></button><button class="cs" data-value="#DDA0DD" style="background:#DDA0DD"></button><button class="cs" data-value="#2d2d2d" style="background:#2d2d2d"></button></div></div><div class="pop-arrow"></div></div>
        </div>
        <div class="tb-div"></div>
        <div class="tb-wrap">
            <button class="tb-btn" data-popover="rect-width" title="Stroke width"><i class="bx bxs-edit-alt"></i><svg class="tb-chev" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button>
            <div class="popover" id="pop-rect-width"><div class="pop-inner"><p class="pop-label">Width</p><div class="pop-row" data-prop="strokeWidth"><button class="pop-opt active" data-value="1"><div class="width-pill" style="height:1px"></div></button><button class="pop-opt" data-value="2"><div class="width-pill" style="height:2px"></div></button><button class="pop-opt" data-value="4"><div class="width-pill" style="height:4px"></div></button><button class="pop-opt" data-value="7"><div class="width-pill" style="height:7px"></div></button></div></div><div class="pop-arrow"></div></div>
        </div>
        <div class="tb-div"></div>
        <div class="tb-wrap">
            <button class="tb-btn" data-popover="rect-style" title="Stroke style"><i class="bx bxs-minus-circle"></i><svg class="tb-chev" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button>
            <div class="popover" id="pop-rect-style"><div class="pop-inner"><p class="pop-label">Style</p><div class="pop-row" data-prop="strokeStyle"><button class="pop-opt active" data-value="solid"><svg width="28" height="4"><line x1="0" y1="2" x2="28" y2="2" stroke="#fff" stroke-width="2"/></svg></button><button class="pop-opt" data-value="dashed"><svg width="28" height="4"><line x1="0" y1="2" x2="28" y2="2" stroke="#fff" stroke-width="2" stroke-dasharray="6 4"/></svg></button><button class="pop-opt" data-value="dotted"><svg width="28" height="4"><line x1="0" y1="2" x2="28" y2="2" stroke="#fff" stroke-width="2" stroke-dasharray="2 3"/></svg></button></div></div><div class="pop-arrow"></div></div>
        </div>
        <div class="tb-div"></div>
        <div class="tb-wrap">
            <button class="tb-btn" data-popover="rect-fillpat" title="Fill style"><i class="bx bxs-brush"></i><svg class="tb-chev" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button>
            <div class="popover" id="pop-rect-fillpat"><div class="pop-inner"><p class="pop-label">Fill</p><div class="pop-col" data-prop="fillStyle"><button class="pop-opt-row active" data-value="hachure">Hachure</button><button class="pop-opt-row" data-value="solid">Solid</button><button class="pop-opt-row" data-value="dots">Dots</button><button class="pop-opt-row" data-value="cross-hatch">Cross</button><button class="pop-opt-row" data-value="transparent">None</button></div></div><div class="pop-arrow"></div></div>
        </div>
        <div class="tb-div"></div>
        <button class="tb-layer" data-action="sendToBack" title="Send to back"><i class="bx bx-chevrons-down"></i></button>
        <button class="tb-layer" data-action="sendBackward" title="Send backward"><i class="bx bx-chevron-down"></i></button>
        <button class="tb-layer" data-action="bringForward" title="Bring forward"><i class="bx bx-chevron-up"></i></button>
        <button class="tb-layer" data-action="bringToFront" title="Bring to front"><i class="bx bx-chevrons-up"></i></button>
    </div>

    <!-- Circle (same as rectangle) -->
    <div id="sidebar-circle" class="sb" style="display:none">
        <div class="tb-wrap"><button class="tb-btn" data-popover="circ-stroke" title="Stroke color"><span class="color-dot" id="circ-stroke-dot" style="background:#fff"></span><svg class="tb-chev" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button><div class="popover" id="pop-circ-stroke"><div class="pop-inner"><p class="pop-label">Stroke</p><div class="color-grid" data-prop="stroke" data-dot="circ-stroke-dot"><button class="cs active" data-value="#fff" style="background:#fff"></button><button class="cs" data-value="#FF8383" style="background:#FF8383"></button><button class="cs" data-value="#3A994C" style="background:#3A994C"></button><button class="cs" data-value="#56A2E8" style="background:#56A2E8"></button><button class="cs" data-value="#FFD700" style="background:#FFD700"></button><button class="cs" data-value="#FF69B4" style="background:#FF69B4"></button><button class="cs" data-value="#A855F7" style="background:#A855F7"></button></div></div><div class="pop-arrow"></div></div></div>
        <div class="tb-div"></div>
        <div class="tb-wrap"><button class="tb-btn" data-popover="circ-fill" title="Fill color"><span class="color-dot" id="circ-fill-dot" style="background:transparent"><svg viewBox="0 0 16 16" style="width:100%;height:100%"><line x1="2" y1="14" x2="14" y2="2" stroke="#666" stroke-width="1.5"/></svg></span><svg class="tb-chev" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button><div class="popover" id="pop-circ-fill"><div class="pop-inner"><p class="pop-label">Background</p><div class="color-grid" data-prop="fill" data-dot="circ-fill-dot"><button class="cs active" data-value="transparent"><svg viewBox="0 0 20 20" style="width:14px;height:14px"><line x1="4" y1="16" x2="16" y2="4" stroke="#666" stroke-width="2"/></svg></button><button class="cs" data-value="#f0f0f0" style="background:#f0f0f0"></button><button class="cs" data-value="#ffcccb" style="background:#ffcccb"></button><button class="cs" data-value="#90ee90" style="background:#90ee90"></button><button class="cs" data-value="#add8e6" style="background:#add8e6"></button><button class="cs" data-value="#FFE4B5" style="background:#FFE4B5"></button><button class="cs" data-value="#DDA0DD" style="background:#DDA0DD"></button><button class="cs" data-value="#2d2d2d" style="background:#2d2d2d"></button></div></div><div class="pop-arrow"></div></div></div>
        <div class="tb-div"></div>
        <div class="tb-wrap"><button class="tb-btn" data-popover="circ-width" title="Width"><i class="bx bxs-edit-alt"></i><svg class="tb-chev" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button><div class="popover" id="pop-circ-width"><div class="pop-inner"><p class="pop-label">Width</p><div class="pop-row" data-prop="strokeWidth"><button class="pop-opt active" data-value="1"><div class="width-pill" style="height:1px"></div></button><button class="pop-opt" data-value="2"><div class="width-pill" style="height:2px"></div></button><button class="pop-opt" data-value="4"><div class="width-pill" style="height:4px"></div></button><button class="pop-opt" data-value="7"><div class="width-pill" style="height:7px"></div></button></div></div><div class="pop-arrow"></div></div></div>
        <div class="tb-div"></div>
        <div class="tb-wrap"><button class="tb-btn" data-popover="circ-fillpat" title="Fill style"><i class="bx bxs-brush"></i><svg class="tb-chev" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button><div class="popover" id="pop-circ-fillpat"><div class="pop-inner"><p class="pop-label">Fill</p><div class="pop-col" data-prop="fillStyle"><button class="pop-opt-row active" data-value="hachure">Hachure</button><button class="pop-opt-row" data-value="solid">Solid</button><button class="pop-opt-row" data-value="dots">Dots</button><button class="pop-opt-row" data-value="cross-hatch">Cross</button><button class="pop-opt-row" data-value="transparent">None</button></div></div><div class="pop-arrow"></div></div></div>
        <div class="tb-div"></div>
        <button class="tb-layer" data-action="sendToBack" title="Send to back"><i class="bx bx-chevrons-down"></i></button><button class="tb-layer" data-action="sendBackward" title="Send backward"><i class="bx bx-chevron-down"></i></button><button class="tb-layer" data-action="bringForward" title="Bring forward"><i class="bx bx-chevron-up"></i></button><button class="tb-layer" data-action="bringToFront" title="Bring to front"><i class="bx bx-chevrons-up"></i></button>
    </div>

    <!-- Arrow -->
    <div id="sidebar-arrow" class="sb" style="display:none">
        <div class="tb-wrap"><button class="tb-btn" data-popover="arr-head" title="Arrow head"><i class="bx bx-right-arrow-alt" style="transform:rotate(-45deg)"></i><svg class="tb-chev" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button><div class="popover" id="pop-arr-head"><div class="pop-inner"><p class="pop-label">Head</p><div class="pop-row" data-prop="arrowHead"><button class="pop-opt active" data-value="default"><svg width="20" height="14" viewBox="0 0 20 14"><line x1="2" y1="7" x2="14" y2="7" stroke="#fff" stroke-width="1.5"/><polyline points="10,2 16,7 10,12" fill="none" stroke="#fff" stroke-width="1.5"/></svg></button><button class="pop-opt" data-value="outline"><svg width="20" height="14" viewBox="0 0 20 14"><line x1="2" y1="7" x2="11" y2="7" stroke="#fff" stroke-width="1.5"/><polygon points="11,2 18,7 11,12" fill="none" stroke="#fff" stroke-width="1.5"/></svg></button><button class="pop-opt" data-value="solid"><svg width="20" height="14" viewBox="0 0 20 14"><line x1="2" y1="7" x2="11" y2="7" stroke="#fff" stroke-width="1.5"/><polygon points="11,2 18,7 11,12" fill="#fff" stroke="#fff" stroke-width="1"/></svg></button></div></div><div class="pop-arrow"></div></div></div>
        <div class="tb-div"></div>
        <div class="tb-wrap"><button class="tb-btn" data-popover="arr-stroke" title="Stroke color"><span class="color-dot" id="arr-stroke-dot" style="background:#fff"></span><svg class="tb-chev" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button><div class="popover" id="pop-arr-stroke"><div class="pop-inner"><p class="pop-label">Stroke</p><div class="color-grid" data-prop="stroke" data-dot="arr-stroke-dot"><button class="cs active" data-value="#fff" style="background:#fff"></button><button class="cs" data-value="#FF8383" style="background:#FF8383"></button><button class="cs" data-value="#3A994C" style="background:#3A994C"></button><button class="cs" data-value="#56A2E8" style="background:#56A2E8"></button><button class="cs" data-value="#FFD700" style="background:#FFD700"></button><button class="cs" data-value="#FF69B4" style="background:#FF69B4"></button><button class="cs" data-value="#A855F7" style="background:#A855F7"></button></div></div><div class="pop-arrow"></div></div></div>
        <div class="tb-div"></div>
        <div class="tb-wrap"><button class="tb-btn" data-popover="arr-width" title="Width"><i class="bx bxs-edit-alt"></i><svg class="tb-chev" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button><div class="popover" id="pop-arr-width"><div class="pop-inner"><p class="pop-label">Width</p><div class="pop-row" data-prop="strokeWidth"><button class="pop-opt active" data-value="1"><div class="width-pill" style="height:1px"></div></button><button class="pop-opt" data-value="2"><div class="width-pill" style="height:2px"></div></button><button class="pop-opt" data-value="4"><div class="width-pill" style="height:4px"></div></button><button class="pop-opt" data-value="7"><div class="width-pill" style="height:7px"></div></button></div></div><div class="pop-arrow"></div></div></div>
        <div class="tb-div"></div>
        <div class="tb-wrap"><button class="tb-btn" data-popover="arr-style" title="Style"><i class="bx bxs-minus-circle"></i><svg class="tb-chev" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button><div class="popover" id="pop-arr-style"><div class="pop-inner"><p class="pop-label">Style</p><div class="pop-row" data-prop="strokeStyle"><button class="pop-opt active" data-value="solid"><svg width="28" height="4"><line x1="0" y1="2" x2="28" y2="2" stroke="#fff" stroke-width="2"/></svg></button><button class="pop-opt" data-value="dashed"><svg width="28" height="4"><line x1="0" y1="2" x2="28" y2="2" stroke="#fff" stroke-width="2" stroke-dasharray="6 4"/></svg></button></div></div><div class="pop-arrow"></div></div></div>
        <div class="tb-div"></div>
        <div class="tb-wrap"><button class="tb-btn" data-popover="arr-type" title="Arrow type"><i class="bx bx-git-branch"></i><svg class="tb-chev" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button><div class="popover" id="pop-arr-type"><div class="pop-inner"><p class="pop-label">Type</p><div class="pop-row" data-prop="arrowType"><button class="pop-opt active" data-value="straight"><svg width="24" height="12" viewBox="0 0 24 12"><line x1="2" y1="6" x2="22" y2="6" stroke="#fff" stroke-width="1.5"/></svg></button><button class="pop-opt" data-value="curved"><svg width="24" height="12" viewBox="0 0 24 12"><path d="M2,10 Q12,0 22,10" fill="none" stroke="#fff" stroke-width="1.5"/></svg></button><button class="pop-opt" data-value="elbow"><svg width="24" height="12" viewBox="0 0 24 12"><polyline points="2,10 2,2 22,2 22,10" fill="none" stroke="#fff" stroke-width="1.5"/></svg></button></div><div class="pop-row curvature-row" data-prop="curvature" style="display:none;margin-top:6px"><button class="pop-opt active" data-value="8">Lo</button><button class="pop-opt" data-value="20">Md</button><button class="pop-opt" data-value="40">Hi</button></div></div><div class="pop-arrow"></div></div></div>
        <div class="tb-div"></div>
        <button class="tb-layer" data-action="sendToBack" title="Send to back"><i class="bx bx-chevrons-down"></i></button><button class="tb-layer" data-action="sendBackward" title="Send backward"><i class="bx bx-chevron-down"></i></button><button class="tb-layer" data-action="bringForward" title="Bring forward"><i class="bx bx-chevron-up"></i></button><button class="tb-layer" data-action="bringToFront" title="Bring to front"><i class="bx bx-chevrons-up"></i></button>
    </div>

    <!-- Line -->
    <div id="sidebar-line" class="sb" style="display:none">
        <div class="tb-wrap"><button class="tb-btn" data-popover="ln-stroke" title="Stroke color"><span class="color-dot" id="ln-stroke-dot" style="background:#fff"></span><svg class="tb-chev" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button><div class="popover" id="pop-ln-stroke"><div class="pop-inner"><p class="pop-label">Stroke</p><div class="color-grid" data-prop="stroke" data-dot="ln-stroke-dot"><button class="cs active" data-value="#fff" style="background:#fff"></button><button class="cs" data-value="#FF8383" style="background:#FF8383"></button><button class="cs" data-value="#3A994C" style="background:#3A994C"></button><button class="cs" data-value="#56A2E8" style="background:#56A2E8"></button><button class="cs" data-value="#FFD700" style="background:#FFD700"></button><button class="cs" data-value="#FF69B4" style="background:#FF69B4"></button><button class="cs" data-value="#A855F7" style="background:#A855F7"></button></div></div><div class="pop-arrow"></div></div></div>
        <div class="tb-div"></div>
        <div class="tb-wrap"><button class="tb-btn" data-popover="ln-width" title="Width"><i class="bx bxs-edit-alt"></i><svg class="tb-chev" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button><div class="popover" id="pop-ln-width"><div class="pop-inner"><p class="pop-label">Width</p><div class="pop-row" data-prop="strokeWidth"><button class="pop-opt active" data-value="1"><div class="width-pill" style="height:1px"></div></button><button class="pop-opt" data-value="2"><div class="width-pill" style="height:2px"></div></button><button class="pop-opt" data-value="4"><div class="width-pill" style="height:4px"></div></button><button class="pop-opt" data-value="7"><div class="width-pill" style="height:7px"></div></button></div></div><div class="pop-arrow"></div></div></div>
        <div class="tb-div"></div>
        <div class="tb-wrap"><button class="tb-btn" data-popover="ln-style" title="Style"><i class="bx bxs-minus-circle"></i><svg class="tb-chev" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button><div class="popover" id="pop-ln-style"><div class="pop-inner"><p class="pop-label">Style</p><div class="pop-row" data-prop="strokeStyle"><button class="pop-opt active" data-value="solid"><svg width="28" height="4"><line x1="0" y1="2" x2="28" y2="2" stroke="#fff" stroke-width="2"/></svg></button><button class="pop-opt" data-value="dashed"><svg width="28" height="4"><line x1="0" y1="2" x2="28" y2="2" stroke="#fff" stroke-width="2" stroke-dasharray="6 4"/></svg></button><button class="pop-opt" data-value="dotted"><svg width="28" height="4"><line x1="0" y1="2" x2="28" y2="2" stroke="#fff" stroke-width="2" stroke-dasharray="2 3"/></svg></button></div></div><div class="pop-arrow"></div></div></div>
        <div class="tb-div"></div>
        <div class="tb-wrap"><button class="tb-btn" data-popover="ln-rough" title="Sloppiness"><i class="bx bxs-brush"></i><svg class="tb-chev" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button><div class="popover" id="pop-ln-rough"><div class="pop-inner"><p class="pop-label">Sloppiness</p><div class="pop-row" data-prop="roughness"><button class="pop-opt active" data-value="0">0</button><button class="pop-opt" data-value="2">2</button><button class="pop-opt" data-value="4">4</button></div><p class="pop-label" style="margin-top:8px">Edge</p><div class="pop-row" data-prop="edge"><button class="pop-opt active" data-value="1">Smooth</button><button class="pop-opt" data-value="5">Rough</button></div></div><div class="pop-arrow"></div></div></div>
        <div class="tb-div"></div>
        <button class="tb-layer" data-action="sendToBack" title="Send to back"><i class="bx bx-chevrons-down"></i></button><button class="tb-layer" data-action="sendBackward" title="Send backward"><i class="bx bx-chevron-down"></i></button><button class="tb-layer" data-action="bringForward" title="Bring forward"><i class="bx bx-chevron-up"></i></button><button class="tb-layer" data-action="bringToFront" title="Bring to front"><i class="bx bx-chevrons-up"></i></button>
    </div>

    <!-- Freehand -->
    <div id="sidebar-freehand" class="sb" style="display:none">
        <div class="tb-wrap"><button class="tb-btn" data-popover="fh-stroke" title="Stroke color"><span class="color-dot" id="fh-stroke-dot" style="background:#fff"></span><svg class="tb-chev" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button><div class="popover" id="pop-fh-stroke"><div class="pop-inner"><p class="pop-label">Stroke</p><div class="color-grid" data-prop="stroke" data-dot="fh-stroke-dot"><button class="cs active" data-value="#fff" style="background:#fff"></button><button class="cs" data-value="#FF8383" style="background:#FF8383"></button><button class="cs" data-value="#3A994C" style="background:#3A994C"></button><button class="cs" data-value="#56A2E8" style="background:#56A2E8"></button><button class="cs" data-value="#FFD700" style="background:#FFD700"></button><button class="cs" data-value="#FF69B4" style="background:#FF69B4"></button><button class="cs" data-value="#A855F7" style="background:#A855F7"></button></div></div><div class="pop-arrow"></div></div></div>
        <div class="tb-div"></div>
        <div class="tb-wrap"><button class="tb-btn" data-popover="fh-width" title="Width"><i class="bx bxs-edit-alt"></i><svg class="tb-chev" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button><div class="popover" id="pop-fh-width"><div class="pop-inner"><p class="pop-label">Width</p><div class="pop-row" data-prop="strokeWidth"><button class="pop-opt active" data-value="1"><div class="width-pill" style="height:1px"></div></button><button class="pop-opt" data-value="2"><div class="width-pill" style="height:2px"></div></button><button class="pop-opt" data-value="4"><div class="width-pill" style="height:4px"></div></button><button class="pop-opt" data-value="7"><div class="width-pill" style="height:7px"></div></button></div></div><div class="pop-arrow"></div></div></div>
        <div class="tb-div"></div>
        <div class="tb-wrap"><button class="tb-btn" data-popover="fh-taper" title="Taper"><i class="bx bxs-pen"></i><svg class="tb-chev" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button><div class="popover" id="pop-fh-taper"><div class="pop-inner"><p class="pop-label">Taper</p><div class="pop-row" data-prop="taper"><button class="pop-opt active" data-value="0" title="Uniform"><i class="bx bxs-minus-circle"></i></button><button class="pop-opt" data-value="0.5" title="Pen"><i class="bx bxs-pen"></i></button><button class="pop-opt" data-value="0.8" title="Brush"><i class="bx bxs-brush"></i></button></div><p class="pop-label" style="margin-top:8px">Roughness</p><div class="pop-row" data-prop="roughness"><button class="pop-opt active" data-value="smooth" title="Smooth"><i class="bx bxs-droplet"></i></button><button class="pop-opt" data-value="medium" title="Medium"><i class="bx bxs-leaf"></i></button><button class="pop-opt" data-value="rough" title="Rough"><i class="bx bxs-bolt"></i></button></div><p class="pop-label" style="margin-top:8px">Opacity</p><div style="display:flex;align-items:center;gap:6px"><input type="range" class="sb-range" data-prop="opacity" min="0" max="1" step="0.05" value="1"/><span class="range-val" id="opacity-val">100%</span></div></div><div class="pop-arrow"></div></div></div>
        <div class="tb-div"></div>
        <button class="tb-layer" data-action="sendToBack" title="Send to back"><i class="bx bx-chevrons-down"></i></button><button class="tb-layer" data-action="sendBackward" title="Send backward"><i class="bx bx-chevron-down"></i></button><button class="tb-layer" data-action="bringForward" title="Bring forward"><i class="bx bx-chevron-up"></i></button><button class="tb-layer" data-action="bringToFront" title="Bring to front"><i class="bx bx-chevrons-up"></i></button>
    </div>

    <!-- Text -->
    <div id="sidebar-text" class="sb" style="display:none">
        <div class="tb-wrap"><button class="tb-btn" data-popover="txt-color" title="Text color"><span class="color-dot" id="txt-color-dot" style="background:#fff"></span><svg class="tb-chev" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button><div class="popover" id="pop-txt-color"><div class="pop-inner"><p class="pop-label">Color</p><div class="color-grid" data-prop="color" data-dot="txt-color-dot"><button class="cs active" data-value="#fff" style="background:#fff"></button><button class="cs" data-value="#FF8383" style="background:#FF8383"></button><button class="cs" data-value="#3A994C" style="background:#3A994C"></button><button class="cs" data-value="#56A2E8" style="background:#56A2E8"></button><button class="cs" data-value="#FFD700" style="background:#FFD700"></button><button class="cs" data-value="#FF69B4" style="background:#FF69B4"></button><button class="cs" data-value="#A855F7" style="background:#A855F7"></button></div></div><div class="pop-arrow"></div></div></div>
        <div class="tb-div"></div>
        <div class="tb-wrap"><button class="tb-btn" data-popover="txt-font" title="Font"><i class="bx bxs-font-family"></i><svg class="tb-chev" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button><div class="popover" id="pop-txt-font"><div class="pop-inner"><p class="pop-label">Font</p><div class="pop-row" data-prop="fontFamily"><button class="pop-opt active" data-value="lixFont" style="font-family:lixFont">Lix</button><button class="pop-opt" data-value="lixCode" style="font-family:lixCode">Code</button><button class="pop-opt" data-value="lixDefault" style="font-family:lixDefault">Def</button><button class="pop-opt" data-value="lixFancy" style="font-family:lixFancy">Fan</button></div></div><div class="pop-arrow"></div></div></div>
        <div class="tb-div"></div>
        <div class="tb-wrap"><button class="tb-btn" data-popover="txt-size" title="Size"><i class="bx bx-font-size"></i><svg class="tb-chev" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button><div class="popover" id="pop-txt-size"><div class="pop-inner"><p class="pop-label">Size</p><div class="pop-row" data-prop="fontSize"><button class="pop-opt" data-value="20">S</button><button class="pop-opt active" data-value="30">M</button><button class="pop-opt" data-value="48">L</button><button class="pop-opt" data-value="72">XL</button></div></div><div class="pop-arrow"></div></div></div>
    </div>

    <!-- Frame -->
    <div id="sidebar-frame" class="sb" style="display:none">
        <input type="text" id="frame-name-input" class="frame-name" value="Frame" placeholder="Frame name" />
        <div class="tb-div"></div>
        <div class="tb-wrap"><button class="tb-btn" data-popover="frm-fill" title="Fill style"><i class="bx bxs-square"></i><svg class="tb-chev" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button><div class="popover" id="pop-frm-fill"><div class="pop-inner"><p class="pop-label">Fill</p><div class="pop-row" data-prop="frameFill"><button class="pop-opt active" data-value="transparent"><i class="bx bx-x"></i></button><button class="pop-opt" data-value="solid"><i class="bx bxs-square"></i></button><button class="pop-opt" data-value="grid"><i class="bx bx-grid-alt"></i></button></div></div><div class="pop-arrow"></div></div></div>
        <div class="tb-div"></div>
        <button class="tb-layer" data-action="sendToBack" title="Send to back"><i class="bx bx-chevrons-down"></i></button><button class="tb-layer" data-action="sendBackward" title="Send backward"><i class="bx bx-chevron-down"></i></button><button class="tb-layer" data-action="bringForward" title="Bring forward"><i class="bx bx-chevron-up"></i></button><button class="tb-layer" data-action="bringToFront" title="Bring to front"><i class="bx bx-chevrons-up"></i></button>
    </div>

    <!-- Image -->
    <div id="sidebar-image" class="sb" style="display:none">
        <button class="tb-btn" data-action="replaceImage" title="Replace image"><i class="bx bx-upload"></i></button>
        <div class="tb-div"></div>
        <button class="tb-layer" data-action="sendToBack" title="Send to back"><i class="bx bx-chevrons-down"></i></button><button class="tb-layer" data-action="sendBackward" title="Send backward"><i class="bx bx-chevron-down"></i></button><button class="tb-layer" data-action="bringForward" title="Bring forward"><i class="bx bx-chevron-up"></i></button><button class="tb-layer" data-action="bringToFront" title="Bring to front"><i class="bx bx-chevrons-up"></i></button>
    </div>

    <!-- Icon Panel (right side) -->
    <div id="sidebar-icon" class="icon-panel" style="display:none">
        <div class="icon-panel-header"><span class="icon-panel-title">Icons</span><button class="icon-panel-close" id="icon-panel-close"><i class="bx bx-x"></i></button></div>
        <div class="icon-search-wrap"><i class="bx bx-search icon-search-icon"></i><input type="text" id="icon-search" class="icon-search" placeholder="Search icons..." /></div>
        <div class="icon-categories"><button class="icon-cat active" data-cat=""><i class="bx bxs-grid-alt"></i> All</button><button class="icon-cat" data-cat="tech"><i class="bx bxs-chip"></i> Tech</button><button class="icon-cat" data-cat="devops"><i class="bx bxs-server"></i> DevOps</button><button class="icon-cat" data-cat="design"><i class="bx bxs-palette"></i> Design</button><button class="icon-cat" data-cat="social"><i class="bx bxs-share-alt"></i> Social</button><button class="icon-cat" data-cat="nav"><i class="bx bxs-navigation"></i> Nav</button><button class="icon-cat" data-cat="business"><i class="bx bxs-briefcase"></i> Biz</button><button class="icon-cat" data-cat="media"><i class="bx bxs-videos"></i> Media</button></div>
        <div class="icon-grid" id="icon-grid"><div class="icon-loading"><i class="bx bx-loader-alt bx-spin"></i> Loading icons...</div></div>
    </div>

    <!-- ═══════════ MENU (hidden by default) ═══════════ -->
    <div id="menu-backdrop" style="display:none"></div>
    <div id="app-menu" style="display:none">
        <button class="menu-item" data-action="help"><span><i class="bx bx-help-circle"></i>Help</span><span class="menu-shortcut">?</span></button>
        <button class="menu-item" data-action="shortcuts"><span><i class="bx bx-command"></i>Shortcuts</span><span class="menu-shortcut">Ctrl+/</span></button>
        <hr class="menu-divider" />
        <button class="menu-item" data-action="find"><span><i class="bx bx-search"></i>Find Text</span><span class="menu-shortcut">Ctrl+F</span></button>
        <button class="menu-item" data-action="canvasProperties"><span><i class="bx bx-info-circle"></i>Canvas Properties</span><span class="menu-shortcut">Alt+/</span></button>
        <hr class="menu-divider" />
        <!-- Preferences (expandable) -->
        <button class="menu-item" id="pref-toggle-btn">
            <span><i class="bx bx-cog"></i>Preferences</span>
            <i class="bx bx-chevron-down pref-chevron"></i>
        </button>
        <div id="pref-submenu" class="pref-submenu" style="display:none">
            <button class="menu-item pref-item" data-pref="toolLock">
                <span><i class="bx bx-check pref-check" style="visibility:hidden"></i>Tool lock</span>
                <span class="menu-shortcut">Q</span>
            </button>
            <button class="menu-item pref-item" data-pref="snapObjects">
                <span><i class="bx bx-check pref-check" style="visibility:hidden"></i>Snap to objects</span>
                <span class="menu-shortcut">Alt+S</span>
            </button>
            <button class="menu-item pref-item" data-pref="toggleGrid">
                <span><i class="bx bx-check pref-check" style="visibility:hidden"></i>Toggle grid</span>
                <span class="menu-shortcut">Ctrl+'</span>
            </button>
            <button class="menu-item pref-item" data-pref="zenMode">
                <span><i class="bx bx-check pref-check" style="visibility:hidden"></i>Zen mode</span>
                <span class="menu-shortcut">Alt+Z</span>
            </button>
            <button class="menu-item pref-item" data-pref="viewMode">
                <span><i class="bx bx-check pref-check" style="visibility:hidden"></i>View mode</span>
                <span class="menu-shortcut">Alt+R</span>
            </button>
            <button class="menu-item pref-item" data-pref="properties">
                <span><i class="bx bx-check pref-check" style="visibility:hidden"></i>Canvas & Shape properties</span>
                <span class="menu-shortcut">Alt+/</span>
            </button>
            <button class="menu-item pref-item" data-pref="arrowBinding">
                <span><i class="bx bx-check pref-check" style="color:var(--accent-blue)"></i>Arrow binding</span>
            </button>
            <button class="menu-item pref-item" data-pref="snapMidpoints">
                <span><i class="bx bx-check pref-check" style="color:var(--accent-blue)"></i>Snap to midpoints</span>
            </button>
        </div>
        <hr class="menu-divider" />
        <div class="menu-section-label">Canvas Background</div>
        <div class="menu-bg-row">
            <button class="bg-swatch active" data-bg="#000" style="background:#000"></button>
            <button class="bg-swatch" data-bg="#161718" style="background:#161718"></button>
            <button class="bg-swatch" data-bg="#13171C" style="background:#13171C"></button>
            <button class="bg-swatch" data-bg="#181605" style="background:#181605"></button>
            <button class="bg-swatch" data-bg="#1B1615" style="background:#1B1615"></button>
        </div>
        <hr class="menu-divider" />
        <button class="menu-item menu-danger" data-action="resetCanvas"><span><i class="bx bx-reset"></i>Reset Canvas</span></button>
    </div>

    <!-- ═══════════ SHORTCUTS MODAL ═══════════ -->
    <div id="shortcuts-modal" class="modal-overlay" style="display:none">
        <div class="modal-backdrop"></div>
        <div class="modal-card" style="max-width:600px">
            <div class="modal-header">
                <h2>Keyboard Shortcuts</h2>
                <button class="modal-close" data-close="shortcuts-modal"><i class="bx bx-x"></i></button>
            </div>
            <div class="modal-body shortcuts-grid">
                <div>
                    <h3 class="shortcut-section-title">Tools</h3>
                    <div class="shortcut-row"><span>Pan</span><kbd>H</kbd></div>
                    <div class="shortcut-row"><span>Select</span><kbd>V</kbd></div>
                    <div class="shortcut-row"><span>Rectangle</span><kbd>R</kbd></div>
                    <div class="shortcut-row"><span>Circle</span><kbd>O</kbd></div>
                    <div class="shortcut-row"><span>Line</span><kbd>L</kbd></div>
                    <div class="shortcut-row"><span>Arrow</span><kbd>A</kbd></div>
                    <div class="shortcut-row"><span>Text</span><kbd>T</kbd></div>
                    <div class="shortcut-row"><span>Freehand</span><kbd>P</kbd></div>
                    <div class="shortcut-row"><span>Image</span><kbd>9</kbd></div>
                    <div class="shortcut-row"><span>Frame</span><kbd>F</kbd></div>
                    <div class="shortcut-row"><span>Laser</span><kbd>K</kbd></div>
                    <div class="shortcut-row"><span>Eraser</span><kbd>E</kbd></div>
                </div>
                <div>
                    <h3 class="shortcut-section-title">Actions</h3>
                    <div class="shortcut-row"><span>Undo</span><kbd>Ctrl+Z</kbd></div>
                    <div class="shortcut-row"><span>Redo</span><kbd>Ctrl+Shift+Z</kbd></div>
                    <div class="shortcut-row"><span>Copy</span><kbd>Ctrl+C</kbd></div>
                    <div class="shortcut-row"><span>Paste</span><kbd>Ctrl+V</kbd></div>
                    <div class="shortcut-row"><span>Save</span><kbd>Ctrl+S</kbd></div>
                    <div class="shortcut-row"><span>Delete</span><kbd>Del</kbd></div>
                    <div class="shortcut-row"><span>Deselect</span><kbd>Esc</kbd></div>
                    <div class="shortcut-row"><span>Hold to Pan</span><kbd>Space</kbd></div>
                    <h3 class="shortcut-section-title" style="margin-top:12px">View</h3>
                    <div class="shortcut-row"><span>Zoom In</span><kbd>Ctrl++</kbd></div>
                    <div class="shortcut-row"><span>Zoom Out</span><kbd>Ctrl+-</kbd></div>
                    <div class="shortcut-row"><span>Reset Zoom</span><kbd>Ctrl+0</kbd></div>
                    <div class="shortcut-row"><span>Toggle Grid</span><kbd>Ctrl+'</kbd></div>
                </div>
            </div>
        </div>
    </div>

    <!-- ═══════════ HELP MODAL ═══════════ -->
    <div id="help-modal" class="modal-overlay" style="display:none">
        <div class="modal-backdrop"></div>
        <div class="modal-card" style="max-width:500px">
            <div class="modal-header">
                <h2>Help</h2>
                <button class="modal-close" data-close="help-modal"><i class="bx bx-x"></i></button>
            </div>
            <div class="modal-body">
                <p style="color:var(--text-secondary);font-size:13px;line-height:1.6;margin-bottom:12px">
                    <strong style="color:var(--text-primary)">LixSketch</strong> is an open-source whiteboard canvas.
                    Draw shapes, arrows, freehand strokes, add text — everything saves directly to the <code>.lixsketch</code> file.
                </p>
                <p style="color:var(--text-dim);font-size:11px;line-height:1.5">
                    Built with RoughJS for a hand-drawn aesthetic. Online features (cloud sync, collaboration) are disabled in the VS Code extension — all data stays on disk.
                </p>
                <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
                    <a href="https://github.com/elixpo/lixsketch" class="help-link"><i class="bx bxl-github"></i> GitHub</a>
                    <a href="https://github.com/elixpo/lixsketch/issues" class="help-link"><i class="bx bx-bug"></i> Report Issue</a>
                </div>
            </div>
        </div>
    </div>

    <!-- ═══════════ CANVAS PROPERTIES MODAL ═══════════ -->
    <div id="canvas-props-modal" class="modal-overlay" style="display:none">
        <div class="modal-backdrop"></div>
        <div class="modal-card" style="max-width:440px">
            <div class="modal-header">
                <h2><i class="bx bx-info-circle" style="margin-right:6px;color:var(--accent-blue)"></i>Canvas Properties</h2>
                <button class="modal-close" data-close="canvas-props-modal"><i class="bx bx-x"></i></button>
            </div>
            <div class="modal-body">
                <!-- File info -->
                <div class="props-section">
                    <div class="props-section-title">File</div>
                    <div class="props-row"><span class="props-label">Name</span><span class="props-value" id="prop-name">${canvasName}</span></div>
                    <div class="props-row"><span class="props-label">Format</span><span class="props-value">.lixsketch</span></div>
                    <div class="props-row"><span class="props-label">Storage</span><span class="props-value">Local disk</span></div>
                </div>
                <!-- Canvas stats -->
                <div class="props-section">
                    <div class="props-section-title">Canvas</div>
                    <div class="props-row"><span class="props-label">Shapes</span><span class="props-value" id="prop-shapes">0</span></div>
                    <div class="props-row"><span class="props-label">Viewport</span><span class="props-value" id="prop-viewport">—</span></div>
                    <div class="props-row"><span class="props-label">Zoom</span><span class="props-value" id="prop-zoom">100%</span></div>
                </div>
                <!-- Shape breakdown -->
                <div class="props-section">
                    <div class="props-section-title">Shape Breakdown</div>
                    <div id="prop-breakdown" class="props-breakdown">—</div>
                </div>
            </div>
        </div>
    </div>

    <!-- ═══════════ FOOTER ═══════════ -->
    <div id="footer">
        <div class="footer-group">
            <button id="undoBtn" class="footer-btn" title="Undo (Ctrl+Z)"><i class="bx bx-undo"></i></button>
            <div class="footer-divider"></div>
            <button id="redoBtn" class="footer-btn" title="Redo (Ctrl+Shift+Z)"><i class="bx bx-redo"></i></button>
        </div>
        <div class="footer-group">
            <button id="zoomOut" class="footer-btn" title="Zoom Out (Ctrl+-)"><i class="bx bx-minus"></i></button>
            <div class="footer-divider"></div>
            <button id="zoomPercent" class="footer-btn zoom-label" title="Reset Zoom (Ctrl+0)">100%</button>
            <div class="footer-divider"></div>
            <button id="zoomIn" class="footer-btn" title="Zoom In (Ctrl++)"><i class="bx bx-plus"></i></button>
        </div>
    </div>

    <!-- ═══════════ SAVE TOAST ═══════════ -->
    <div id="save-toast" style="display:none">
        <i class="bx bx-check" style="color:#4ade80;margin-right:6px"></i>Saved to disk
    </div>

    <!-- ═══════════ SVG CANVAS ═══════════ -->
    <svg id="freehand-canvas" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"></svg>

    <script nonce="${nonce}" src="${engineUri}"></script>
    <script nonce="${nonce}" src="${webviewJsUri}"></script>
</body>
</html>`;
    }
}

function getNonce() {
    let text = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}

module.exports = { LixSketchEditorProvider };
