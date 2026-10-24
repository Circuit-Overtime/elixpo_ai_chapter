import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, createCodeBlockSpec } from '@blocknote/core';
import { useCreateBlockNote, SuggestionMenuController, getDefaultReactSlashMenuItems, TableHandlesController } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { BlogImageBlock } from '../../lixeditor/src/blocks/ImageBlock';
import { DateInline } from '../../lixeditor/src/blocks/DateInline';
import LinkPreviewTooltip, { useLinkPreview } from '../../lixeditor/src/editor/LinkPreviewTooltip';
import './styles.css';

// VS Code API
const vscode = acquireVsCodeApi();

// Code block with Shiki
const codeBlock = createCodeBlockSpec({
  supportedLanguages: {
    text: { name: 'Text' },
    javascript: { name: 'JavaScript' }, typescript: { name: 'TypeScript' },
    python: { name: 'Python' }, java: { name: 'Java' },
    c: { name: 'C' }, cpp: { name: 'C++' }, csharp: { name: 'C#' },
    go: { name: 'Go' }, rust: { name: 'Rust' }, ruby: { name: 'Ruby' },
    php: { name: 'PHP' }, swift: { name: 'Swift' }, kotlin: { name: 'Kotlin' },
    html: { name: 'HTML' }, css: { name: 'CSS' }, json: { name: 'JSON' },
    yaml: { name: 'YAML' }, markdown: { name: 'Markdown' },
    bash: { name: 'Bash' }, shell: { name: 'Shell' }, sql: { name: 'SQL' },
    jsx: { name: 'JSX' }, tsx: { name: 'TSX' },
  },
  createHighlighter: async () => {
    const { createHighlighter } = await import('shiki');
    return createHighlighter({
      themes: ['vitesse-dark', 'vitesse-light'],
      langs: ['javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'html', 'css', 'json', 'yaml', 'markdown', 'bash', 'shell', 'sql', 'jsx', 'tsx'],
    });
  },
});

const schema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, codeBlock, image: BlogImageBlock({}) },
  inlineContentSpecs: { ...defaultInlineContentSpecs, dateInline: DateInline },
});

// ── Header Bar ──
function HeaderBar({ title, onTitleChange, onSave, onImport, onExport, saving, saved }) {
  const [editing, setEditing] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  return (
    <>
      <div className="lix-header">
        <div className="lix-header-left">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9b7bf7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          {editing ? (
            <input
              ref={inputRef}
              defaultValue={title}
              onBlur={(e) => { onTitleChange(e.target.value); setEditing(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { onTitleChange(e.target.value); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
              className="lix-header-title-input"
            />
          ) : (
            <span className="lix-header-title" onClick={() => setEditing(true)}>
              {title || 'Untitled Document'}
            </span>
          )}
          <span className="lix-header-status">
            {saving ? 'Saving...' : saved ? 'Saved' : ''}
          </span>
        </div>
        <div className="lix-header-right">
          <button className="lix-header-btn" onClick={onImport} title="Open file">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
          </button>
          <button className="lix-header-btn" onClick={onExport} title="Export as Markdown">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <button className="lix-header-btn" onClick={onSave} title="Save (Ctrl+S)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          </button>
          <button className="lix-header-btn" onClick={() => setShowHelp(!showHelp)} title="Keyboard shortcuts">
            ?
          </button>
        </div>
      </div>
      {showHelp && (
        <>
          <div className="lix-help-backdrop" onClick={() => setShowHelp(false)} />
          <div className="lix-help-modal">
            <div className="lix-help-header">
              <span>Keyboard Shortcuts</span>
              <button onClick={() => setShowHelp(false)} className="lix-help-close">&times;</button>
            </div>
            <div className="lix-help-list">
              {[
                ['/', 'Slash commands'],
                ['Ctrl+B', 'Bold'],
                ['Ctrl+I', 'Italic'],
                ['Ctrl+U', 'Underline'],
                ['Ctrl+Shift+S', 'Strikethrough'],
                ['Ctrl+E', 'Inline code'],
                ['Ctrl+K', 'Create link'],
                ['Ctrl+D', 'Insert date'],
                ['Tab', 'Indent / Nest'],
                ['Shift+Tab', 'Unindent'],
                ['---', 'Horizontal rule'],
                ['```lang', 'Code block'],
                ['[text](url)', 'Link'],
                ['![alt](url)', 'Image embed'],
              ].map(([key, desc]) => (
                <div key={key} className="lix-help-row">
                  <kbd className="lix-help-key">{key}</kbd>
                  <span className="lix-help-desc">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ── Main App ──
function LixEditorApp() {
  const [initialContent, setInitialContent] = useState(undefined);
  const [loaded, setLoaded] = useState(false);
  const [isDark, setIsDark] = useState(document.body.classList.contains('vscode-dark'));
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveTimerRef = useRef(null);
  const editorRef = useRef(null);

  useEffect(() => {
    const observer = new MutationObserver(() => setIsDark(document.body.classList.contains('vscode-dark')));
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handler = (event) => {
      const message = event.data;
      if (message.type === 'load') {
        const blocks = message.blocks;
        setInitialContent(blocks?.length ? blocks : undefined);
        setLoaded(true);
      }
      if (message.type === 'import' && message.content) {
        try {
          const blocks = JSON.parse(message.content);
          if (Array.isArray(blocks) && blocks.length) {
            setInitialContent(blocks);
          }
        } catch { /* not JSON — could handle markdown in future */ }
      }
    };
    window.addEventListener('message', handler);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleChange = useCallback((editor) => {
    editorRef.current = editor;
    clearTimeout(saveTimerRef.current);
    setSaved(false);
    saveTimerRef.current = setTimeout(() => {
      const blocks = editor.document;
      vscode.postMessage({ type: 'update', blocks });
      setSaving(true);
      setTimeout(() => { setSaving(false); setSaved(true); }, 300);
    }, 800);
  }, []);

  const handleSaveNow = useCallback(() => {
    if (editorRef.current) {
      vscode.postMessage({ type: 'save', blocks: editorRef.current.document });
      setSaving(true);
      setTimeout(() => { setSaving(false); setSaved(true); }, 300);
    }
  }, []);

  const handleImport = useCallback(() => {
    vscode.postMessage({ type: 'import' });
  }, []);

  const handleExportMarkdown = useCallback(async () => {
    if (!editorRef.current) return;
    try {
      const md = await editorRef.current.blocksToMarkdownLossy(editorRef.current.document);
      vscode.postMessage({ type: 'exportMarkdown', markdown: md });
    } catch {}
  }, []);

  if (!loaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--vscode-foreground)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>LixEditor</div>
          <div style={{ fontSize: 13, opacity: 0.6 }}>Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <HeaderBar title={title} onTitleChange={setTitle} onSave={handleSaveNow} onImport={handleImport} onExport={handleExportMarkdown} saving={saving} saved={saved} />
      <EditorView initialContent={initialContent} isDark={isDark} onChange={handleChange} />
    </div>
  );
}

// ── Editor ──
function EditorView({ initialContent, isDark, onChange }) {
  const editorWrapperRef = useRef(null);
  const linkPreview = useLinkPreview();
  const linkPreviewRef = useRef(linkPreview);
  linkPreviewRef.current = linkPreview;

  const editor = useCreateBlockNote({
    schema,
    initialContent: initialContent || undefined,
    domAttributes: { editor: { class: 'lix-vscode-editor' } },
  });

  // Auto-convert [text](url) to link, ![alt](url) to image, URL+space to link
  useEffect(() => {
    if (!editor) return;
    const tiptap = editor._tiptapEditor;
    if (!tiptap) return;

    const handleInput = () => {
      const { state, view } = tiptap;
      const { $from } = state.selection;
      const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');

      const imgMatch = textBefore.match(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/);
      if (imgMatch) {
        const [fullMatch, alt, imgUrl] = imgMatch;
        const from = $from.pos - fullMatch.length;
        view.dispatch(state.tr.delete(from, $from.pos));
        const cursorBlock = editor.getTextCursorPosition().block;
        editor.insertBlocks([{ type: 'image', props: { url: imgUrl, caption: alt || '' } }], cursorBlock, 'after');
        requestAnimationFrame(() => { try { const block = editor.getTextCursorPosition().block; if (block?.type === 'paragraph' && !(block.content || []).some(c => c.text?.trim())) editor.removeBlocks([block.id]); } catch {} });
        return;
      }

      const linkMatch = textBefore.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      if (linkMatch) {
        const [fullMatch, linkText, url] = linkMatch;
        const from = $from.pos - fullMatch.length;
        const linkMark = state.schema.marks.link.create({ href: url });
        view.dispatch(state.tr.delete(from, $from.pos).insertText(linkText, from).addMark(from, from + linkText.length, linkMark));
        return;
      }

      const urlMatch = textBefore.match(/(https?:\/\/[^\s]+)\s$/);
      if (urlMatch) {
        const [fullMatch, url] = urlMatch;
        const from = $from.pos - fullMatch.length;
        const to = $from.pos - 1;
        view.dispatch(state.tr.addMark(from, to, state.schema.marks.link.create({ href: url })));
      }
    };

    tiptap.on('update', handleInput);
    return () => tiptap.off('update', handleInput);
  }, [editor]);

  // Ctrl+D → insert date
  useEffect(() => {
    if (!editor) return;
    const tiptap = editor._tiptapEditor;
    const dom = tiptap?.view?.dom;
    if (!dom) return;

    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        editor.insertInlineContent([{ type: 'dateInline', props: { date: new Date().toISOString().split('T')[0] } }]);
      }
    };

    dom.addEventListener('keydown', handleKeyDown);
    return () => { try { dom.removeEventListener('keydown', handleKeyDown); } catch {} };
  }, [editor]);

  // Link preview on hover
  useEffect(() => {
    const wrapper = editorWrapperRef.current;
    if (!wrapper) return;

    const handleMouseOver = (e) => {
      const link = e.target.closest('a[href]');
      if (!link || link.closest('.bn-toolbar') || link.closest('.bn-link-toolbar')) return;
      // Don't show preview if link toolbar or popup is visible
      if (document.querySelector('.bn-link-toolbar') || document.querySelector('.link-editor-popup')) return;
      const href = link.getAttribute('href');
      if (href && href.startsWith('http')) linkPreviewRef.current.show(link, href);
    };
    const handleMouseOut = (e) => {
      if (e.target.closest('a[href]')) linkPreviewRef.current.cancel();
    };
    // Hide preview when clicking (which triggers the link toolbar)
    const handleClick = () => { linkPreviewRef.current.hide(); };
    wrapper.addEventListener('click', handleClick);

    wrapper.addEventListener('mouseover', handleMouseOver);
    wrapper.addEventListener('mouseout', handleMouseOut);
    return () => {
      wrapper.removeEventListener('mouseover', handleMouseOver);
      wrapper.removeEventListener('mouseout', handleMouseOut);
      wrapper.removeEventListener('click', handleClick);
    };
  }, []);

  // Intercept right-clicks on table handles to trigger their left-click menu
  useEffect(() => {
    const wrapper = editorWrapperRef.current;
    if (!wrapper) return;
    const handleContextMenu = (e) => {
      const el = e.target instanceof Element
        ? e.target.closest('[class*="TableHandle" i], [class*="table-handle" i], [class*="tableHandle" i], .bn-table-dir-row-handle, .bn-table-dir-col-handle')
        : null;
      if (el) {
        e.preventDefault();
        e.stopPropagation();
        el.click();
      }
    };
    wrapper.addEventListener('contextmenu', handleContextMenu);
    return () => wrapper.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  const handleEditorChange = useCallback(() => { onChange(editor); }, [editor, onChange]);

  const getItems = useCallback(async (query) => {
    return getDefaultReactSlashMenuItems(editor)
      .filter(item => !['video', 'audio', 'file'].includes(item.key))
      .filter(item => item.title.toLowerCase().includes(query.toLowerCase()));
  }, [editor]);

  return (
    <div ref={editorWrapperRef} style={{ maxWidth: 720, margin: '0 auto', padding: '8px 16px 100px', minHeight: 'calc(100vh - 44px)', position: 'relative' }}>
      <BlockNoteView editor={editor} onChange={handleEditorChange} theme={isDark ? 'dark' : 'light'} slashMenu={false}>
        <SuggestionMenuController triggerCharacter="/" getItems={getItems} />
        <TableHandlesController />
      </BlockNoteView>

      {linkPreview.preview && (
        <LinkPreviewTooltip
          anchorEl={linkPreview.preview.anchorEl}
          url={linkPreview.preview.url}
          onClose={linkPreview.hide}
        />
      )}
    </div>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<LixEditorApp />);
