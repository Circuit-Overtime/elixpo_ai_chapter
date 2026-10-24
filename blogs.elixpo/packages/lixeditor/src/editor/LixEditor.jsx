'use client';

import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  createCodeBlockSpec,
  filterSuggestionItems,
} from '@blocknote/core';
import {
  useCreateBlockNote,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  TableHandlesController,
  FormattingToolbar,
  FormattingToolbarController,
  getFormattingToolbarItems,
} from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { useCallback, useMemo, forwardRef, useImperativeHandle, useState, useRef, useEffect } from 'react';
import { useLixTheme } from '../hooks/useLixTheme';

// Core blocks
import { BlockEquation } from '../blocks/BlockEquation';
import { MermaidBlock } from '../blocks/MermaidBlock';
import { TableOfContents } from '../blocks/TableOfContents';
import { InlineEquation } from '../blocks/InlineEquation';
import { DateInline } from '../blocks/DateInline';
import { VariableInline, setVariableSuggestions } from '../blocks/VariableInline';

// Optional blocks — imported but can be disabled via config
import { BlogImageBlock as ImageBlock } from '../blocks/ImageBlock';
import { ButtonBlock } from '../blocks/ButtonBlock';
import { PDFEmbedBlock } from '../blocks/PDFEmbedBlock';

// Utilities
import LinkPreviewTooltip, { useLinkPreview, setLinkPreviewEndpoint } from './LinkPreviewTooltip';
import { LixUploadContext } from './uploadConfig';
import { renderBlocksToHTML } from '../preview/renderBlocks';

// Default code block languages
const DEFAULT_LANGUAGES = {
  text: { name: 'Text' },
  javascript: { name: 'JavaScript', aliases: ['js'] },
  typescript: { name: 'TypeScript', aliases: ['ts'] },
  python: { name: 'Python', aliases: ['py'] },
  java: { name: 'Java' },
  c: { name: 'C' },
  cpp: { name: 'C++' },
  csharp: { name: 'C#', aliases: ['cs'] },
  go: { name: 'Go' },
  rust: { name: 'Rust', aliases: ['rs'] },
  ruby: { name: 'Ruby', aliases: ['rb'] },
  php: { name: 'PHP' },
  swift: { name: 'Swift' },
  kotlin: { name: 'Kotlin', aliases: ['kt'] },
  html: { name: 'HTML' },
  css: { name: 'CSS' },
  json: { name: 'JSON' },
  yaml: { name: 'YAML', aliases: ['yml'] },
  markdown: { name: 'Markdown', aliases: ['md'] },
  bash: { name: 'Bash', aliases: ['sh'] },
  shell: { name: 'Shell' },
  sql: { name: 'SQL' },
  graphql: { name: 'GraphQL', aliases: ['gql'] },
  jsx: { name: 'JSX' },
  tsx: { name: 'TSX' },
  vue: { name: 'Vue' },
  svelte: { name: 'Svelte' },
  dart: { name: 'Dart' },
  lua: { name: 'Lua' },
  r: { name: 'R' },
  scala: { name: 'Scala' },
};

/**
 * LixEditor — A rich WYSIWYG block editor.
 *
 * @param {Object} props
 * @param {Array} [props.initialContent] - Initial block content (BlockNote format)
 * @param {Function} [props.onChange] - Called when content changes, receives the editor instance
 * @param {Object} [props.features] - Enable/disable features
 * @param {boolean} [props.features.equations=true] - Block & inline LaTeX equations
 * @param {boolean} [props.features.mermaid=true] - Mermaid diagram blocks
 * @param {boolean} [props.features.codeHighlighting=true] - Shiki syntax highlighting
 * @param {boolean} [props.features.tableOfContents=true] - TOC block
 * @param {boolean} [props.features.images=true] - Image blocks
 * @param {boolean} [props.features.buttons=true] - Button blocks
 * @param {boolean} [props.features.pdf=true] - PDF embed blocks
 * @param {boolean} [props.features.dates=true] - Inline date chips
 * @param {boolean} [props.features.linkPreview=true] - Link hover preview
 * @param {boolean} [props.features.markdownLinks=true] - Auto-convert [text](url) to links
 * @param {Object} [props.codeLanguages] - Custom code block language map (overrides defaults)
 * @param {Array} [props.extraBlockSpecs] - Additional custom block specs to register
 * @param {Array} [props.extraInlineSpecs] - Additional custom inline content specs
 * @param {Array} [props.slashMenuItems] - Additional slash menu items
 * @param {string} [props.placeholder] - Editor placeholder text
 * @param {Object} [props.collaboration] - Yjs collaboration config
 * @param {Function} [props.onReady] - Called when editor is ready
 * @param {React.ReactNode} [props.children] - Additional children rendered inside BlockNoteView
 */
const LixEditor = forwardRef(function LixEditor({
  initialContent,
  onChange,
  features = {},
  codeLanguages,
  extraBlockSpecs = [],
  extraInlineSpecs = [],
  slashMenuItems: extraSlashItems = [],
  placeholder = "Type '/' for commands...",
  collaboration,
  onReady,
  children,
  // NEW in 2.7.0
  uploadFile,
  acceptImageTypes,
  maxFileSizeBytes,
  onUploadError,
  buttonDefaults,
  variableSuggestions,
  editable = true,
  linkPreviewEndpoint,
  imageInsert = 'default',
}, ref) {
  const { isDark } = useLixTheme();
  const wrapperRef = useRef(null);
  const editorLinkPreview = useLinkPreview();

  // Merge features with defaults
  const f = {
    equations: true, mermaid: true, codeHighlighting: true,
    tableOfContents: true, images: true, buttons: true, pdf: true,
    dates: true, linkPreview: true, markdownLinks: true,
    ...features,
  };

  // Build block specs
  const langs = codeLanguages || DEFAULT_LANGUAGES;
  const codeBlock = f.codeHighlighting
    ? createCodeBlockSpec({
        supportedLanguages: langs,
        createHighlighter: async () => {
          const { createHighlighter } = await import('shiki');
          return createHighlighter({
            themes: ['vitesse-dark', 'vitesse-light'],
            langs: Object.keys(langs).filter(k => k !== 'text'),
          });
        },
      })
    : undefined;

  const schema = useMemo(() => {
    const blockSpecs = { ...defaultBlockSpecs };
    if (codeBlock) blockSpecs.codeBlock = codeBlock;
    if (f.equations) blockSpecs.blockEquation = BlockEquation({});
    if (f.mermaid) blockSpecs.mermaidBlock = MermaidBlock({});
    if (f.tableOfContents) blockSpecs.tableOfContents = TableOfContents({});
    if (f.images) blockSpecs.image = ImageBlock({});
    if (f.buttons) blockSpecs.buttonBlock = ButtonBlock({});
    if (f.pdf) blockSpecs.pdfEmbed = PDFEmbedBlock({});

    // Register extra block specs
    for (const spec of extraBlockSpecs) {
      if (spec.type && spec.spec) blockSpecs[spec.type] = spec.spec;
    }

    const inlineContentSpecs = { ...defaultInlineContentSpecs };
    if (f.equations) inlineContentSpecs.inlineEquation = InlineEquation;
    if (f.dates) inlineContentSpecs.dateInline = DateInline;
    inlineContentSpecs.lixVariable = VariableInline;

    // Register extra inline specs
    for (const spec of extraInlineSpecs) {
      if (spec.type && spec.spec) inlineContentSpecs[spec.type] = spec.spec;
    }

    return BlockNoteSchema.create({ blockSpecs, inlineContentSpecs });
  }, []);

  // Sanitize initial content
  const sanitized = useMemo(() => {
    if (!initialContent) return undefined;
    let blocks = initialContent;
    if (typeof blocks === 'string') {
      try { blocks = JSON.parse(blocks); } catch { return undefined; }
    }
    if (!Array.isArray(blocks) || blocks.length === 0) return undefined;
    return blocks;
  }, [initialContent]);

  const editor = useCreateBlockNote({
    schema,
    ...(collaboration ? { collaboration } : { initialContent: sanitized || undefined }),
    domAttributes: { editor: { class: 'lix-editor' } },
    placeholders: { default: placeholder },
  });

  useImperativeHandle(ref, () => ({
    getDocument: () => editor.document,
    getEditor: () => editor,
    getBlocks: () => editor.document,
    // Email-safe HTML: bulletproof buttons, inline-styled images, {{vars}} round-trip.
    getHTML: () => renderBlocksToHTML(editor.document),
    // BlockNote's lossy HTML, if a consumer wants the editor-DOM flavour instead.
    getHTMLLossy: async () => await editor.blocksToHTMLLossy(editor.document),
    getMarkdown: async () => await editor.blocksToMarkdownLossy(editor.document),
    // Insert a ready image block with the URL already set (host-driven insert).
    insertImage: (url, opts = {}) => {
      if (!url) return;
      const props = { url, alt: opts.alt || '', align: opts.align || '', name: opts.name || '' };
      const ref = editor.getTextCursorPosition?.()?.block || editor.document[editor.document.length - 1];
      if (ref) editor.insertBlocks([{ type: 'image', props }], ref, 'after');
      else editor.insertBlocks([{ type: 'image', props }], editor.document[0], 'before');
    },
  }), [editor]);

  // triggerUploadForBlock — shared by paste/drop/pickHostImage. Sets _uploading
  // prop on the block so the ImageRenderer shows the skeleton/error states.
  const triggerUploadForBlock = useCallback(async (blockId, file) => {
    if (!file || !file.type.startsWith('image/')) return;
    if (acceptImageTypes?.length && !acceptImageTypes.includes(file.type)) return;
    if (maxFileSizeBytes && file.size > maxFileSizeBytes) {
      onUploadError?.(new Error(`Image exceeds ${Math.round(maxFileSizeBytes / 1024 / 1024)}MB limit`), file);
      try { editor.updateBlock(blockId, { props: { _uploading: 'error' } }); } catch {}
      return;
    }

    if (uploadFile) {
      try {
        const resultUrl = await uploadFile(file);
        if (!resultUrl || typeof resultUrl !== 'string') throw new Error('uploadFile did not return a URL');
        editor.updateBlock(blockId, { props: { url: resultUrl, name: file.name, _uploading: '' } });
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        onUploadError?.(e, file);
        try { editor.updateBlock(blockId, { props: { _uploading: 'error' } }); } catch {}
      }
      return;
    }

    // Base64 fallback (standalone / zero-config)
    try {
      const reader = new FileReader();
      reader.onload = () => {
        editor.updateBlock(blockId, { props: { url: reader.result, name: file.name, _uploading: '' } });
      };
      reader.onerror = () => {
        try { editor.updateBlock(blockId, { props: { _uploading: 'error' } }); } catch {}
      };
      reader.readAsDataURL(file);
    } catch {
      try { editor.updateBlock(blockId, { props: { _uploading: 'error' } }); } catch {}
    }
  }, [editor, uploadFile, acceptImageTypes, maxFileSizeBytes, onUploadError]);

  // Host image picker — file → uploadFile → insertImage (used by the slash item
  // when imageInsert='host', so users never hit the embed-URL card).
  const pickHostImage = useCallback(() => {
    if (!uploadFile) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = (acceptImageTypes || ['image/png', 'image/jpeg', 'image/gif', 'image/webp']).join(',');
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      // Insert placeholder skeleton immediately
      const ref = editor.getTextCursorPosition?.()?.block || editor.document[editor.document.length - 1];
      if (!ref) return;
      editor.insertBlocks([
        { type: 'image', props: { url: '', previewWidth: 740, _uploading: 'uploading' } },
        { type: 'paragraph', content: [] },
      ], ref, 'after');
      // Move cursor to the paragraph below so user can keep typing
      const doc = editor.document;
      const refIdx = doc.findIndex((b) => b.id === ref.id);
      const newBlock = doc[refIdx + 1];
      const paragraphBlock = doc[refIdx + 2];
      if (paragraphBlock) {
        requestAnimationFrame(() => {
          try { editor.setTextCursorPosition(paragraphBlock.id, 'start'); } catch {}
        });
      }
      if (!newBlock) return;
      // Upload in background
      triggerUploadForBlock(newBlock.id, file);
    };
    input.click();
  }, [editor, uploadFile, acceptImageTypes, onUploadError, triggerUploadForBlock]);

  // Notify parent when ready
  useEffect(() => { if (onReady) onReady(); }, []);

  // Host-configurable link-preview endpoint (prop mirrors setLinkPreviewEndpoint).
  useEffect(() => {
    if (linkPreviewEndpoint) setLinkPreviewEndpoint(linkPreviewEndpoint);
  }, [linkPreviewEndpoint]);

  // Toggle editability (read-only previews).
  useEffect(() => {
    if (editor?.isEditable !== undefined) {
      try { editor.isEditable = editable; } catch {}
    }
  }, [editor, editable]);

  // Intercept right-clicks on table handles to trigger their left-click menu
  useEffect(() => {
    const wrapper = wrapperRef.current;
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

  // Host-supplied merge-variable suggestions for the {{variable}} chip.
  useEffect(() => { setVariableSuggestions(variableSuggestions || []); }, [variableSuggestions]);

  // Markdown-as-you-type: "> " \u2192 quote (always), plus ![alt](url)/[text](url)
  // conversions (gated on markdownLinks).
  useEffect(() => {
    if (!editor) return;
    const tiptap = editor._tiptapEditor;
    if (!tiptap) return;

    const handleInput = () => {
      const { state, view } = tiptap;
      const { $from } = state.selection;
      const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');

      // "> " at the start of a line \u2192 turn the block into a blockquote.
      if (textBefore === '> ') {
        try {
          const block = editor.getTextCursorPosition().block;
          if (block && block.type !== 'quote') {
            view.dispatch(state.tr.delete($from.pos - 2, $from.pos)); // strip the "> " marker
            editor.updateBlock(block, { type: 'quote' });
            return;
          }
        } catch {}
      }

      if (!f.markdownLinks) return;

      // Image syntax: ![alt](url)
      const imgMatch = textBefore.match(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/);
      if (imgMatch) {
        const [fullMatch, alt, imgUrl] = imgMatch;
        const from = $from.pos - fullMatch.length;
        view.dispatch(state.tr.delete(from, $from.pos));
        const cursorBlock = editor.getTextCursorPosition().block;
        editor.insertBlocks(
          [{ type: 'image', props: { url: imgUrl, caption: alt || '' } }],
          cursorBlock, 'after'
        );
        requestAnimationFrame(() => {
          try {
            const block = editor.getTextCursorPosition().block;
            if (block?.type === 'paragraph' && !(block.content || []).some(c => c.text?.trim())) {
              editor.removeBlocks([block.id]);
            }
          } catch {}
        });
        return;
      }

      // Link syntax: [text](url)
      const match = textBefore.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      if (!match) return;
      const [fullMatch, linkText, url] = match;
      const from = $from.pos - fullMatch.length;
      const linkMark = state.schema.marks.link.create({ href: url });
      const tr = state.tr.delete(from, $from.pos).insertText(linkText, from).addMark(from, from + linkText.length, linkMark);
      view.dispatch(tr);
    };

    tiptap.on('update', handleInput);
    return () => tiptap.off('update', handleInput);
  }, [editor, f.markdownLinks]);

  // Shift+Arrow should extend the text selection, not move/rearrange blocks.
  // BlockNote binds block-move to Shift+ArrowUp/Down; intercept it in the capture
  // phase (before ProseMirror's handler) so the native selection happens instead.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const onKeyDown = (e) => {
      if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const block = editor.getTextCursorPosition()?.block;
        if (block?.type === 'paragraph') {
          const value = (block.content || []).map((item) => item.text || '').join('');
          const marker = value.match(/^\s?\[([ xX])\]$/);
          if (marker) {
            e.preventDefault();
            e.stopImmediatePropagation();
            editor.updateBlock(block.id, {
              type: 'checkListItem',
              props: { checked: marker[1].toLowerCase() === 'x' },
              content: [],
            });
            requestAnimationFrame(() => {
              try { editor.setTextCursorPosition(block.id, 'end'); } catch {}
            });
            return;
          }
        }
      }

      if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey
        && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.stopImmediatePropagation();
      }
    };
    el.addEventListener('keydown', onKeyDown, true);
    return () => el.removeEventListener('keydown', onKeyDown, true);
  }, [editor]);

  // Link preview hover
  useEffect(() => {
    if (!f.linkPreview) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const handleMouseOver = (e) => {
      const link = e.target.closest('a[href]');
      if (!link || link.closest('.bn-link-toolbar') || link.closest('.bn-toolbar')) return;
      if (document.querySelector('.bn-link-toolbar') || document.querySelector('.link-editor-popup')) return;
      const href = link.getAttribute('href');
      if (href && href.startsWith('http')) editorLinkPreview.show(link, href);
    };
    const handleMouseOut = (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;
      editorLinkPreview.cancel();
    };
    const handleClick = (e) => {
      editorLinkPreview.hide();
      if (!(e.ctrlKey || e.metaKey)) return;
      const link = e.target.closest('a[href]');
      if (!link || link.closest('.bn-link-toolbar')) return;
      const href = link.getAttribute('href');
      if (href && href.startsWith('http')) {
        e.preventDefault();
        e.stopPropagation();
        window.open(href, '_blank', 'noopener,noreferrer');
      }
    };
    const handleKeyDown = (e) => { if (e.ctrlKey || e.metaKey) wrapper.classList.add('ctrl-held'); };
    const handleKeyUp = () => wrapper.classList.remove('ctrl-held');

    wrapper.addEventListener('mouseover', handleMouseOver);
    wrapper.addEventListener('mouseout', handleMouseOut);
    wrapper.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      wrapper.removeEventListener('mouseover', handleMouseOver);
      wrapper.removeEventListener('mouseout', handleMouseOut);
      wrapper.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [f.linkPreview]);

  // Ctrl+D / Cmd+D: insert today's date as an inline chip at the cursor.
  // Only fires when focus is inside the editor and the dates feature is on.
  useEffect(() => {
    if (!f.dates || !editor) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() !== 'd') return;
      // Only intercept when the editable area has focus.
      const active = document.activeElement;
      if (!active || !wrapper.contains(active)) return;

      e.preventDefault();
      try {
        const today = new Date().toISOString().split('T')[0];
        editor._tiptapEditor.commands.insertContent({
          type: 'dateInline',
          attrs: { date: today },
        });
      } catch (err) {
        console.warn('[LixEditor] insert date failed:', err);
      }
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [editor, f.dates]);

  // Editor-level paste/drop handlers — intercept image paste/drop while typing
  // so we can insert a skeleton placeholder immediately instead of waiting for
  // the upload to complete. Drops on existing image blocks are left to the
  // ImageBlock's own handleDrop.
  useEffect(() => {
    if (!f.images || !editor) return;
    const tiptap = editor._tiptapEditor;
    if (!tiptap) return;
    const editorDom = tiptap.view.dom;
    if (!editorDom) return;

    const acceptedTypes = acceptImageTypes || ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (!item.type.startsWith('image/')) continue;
        const file = item.getAsFile();
        if (!file) continue;
        if (acceptImageTypes?.length && !acceptImageTypes.includes(file.type)) continue;
        if (maxFileSizeBytes && file.size > maxFileSizeBytes) continue;

        e.preventDefault();
        e.stopPropagation();

        const cursor = editor.getTextCursorPosition();
        if (!cursor?.block) return;

        // Insert skeleton + empty paragraph below
        editor.insertBlocks([
          { type: 'image', props: { url: '', previewWidth: 740, _uploading: 'uploading' } },
          { type: 'paragraph', content: [] },
        ], cursor.block, 'after');

        const doc = editor.document;
        const cursorIdx = doc.findIndex((b) => b.id === cursor.block.id);
        const newBlock = doc[cursorIdx + 1];
        const paragraphBlock = doc[cursorIdx + 2];
        if (paragraphBlock) {
          requestAnimationFrame(() => {
            try { editor.setTextCursorPosition(paragraphBlock.id, 'start'); } catch {}
          });
        }
        if (!newBlock) return;

        triggerUploadForBlock(newBlock.id, file);
        return;
      }
    };

    const handleDrop = (e) => {
      // Let existing image blocks handle their own drops
      if (e.target.closest('[data-content-type="image"]')) return;
      const file = e.dataTransfer?.files?.[0];
      if (!file?.type.startsWith('image/')) return;
      if (acceptImageTypes?.length && !acceptImageTypes.includes(file.type)) return;

      e.preventDefault();
      e.stopPropagation();

      const cursor = editor.getTextCursorPosition();
      if (!cursor?.block) return;

      editor.insertBlocks([
        { type: 'image', props: { url: '', previewWidth: 740, _uploading: 'uploading' } },
        { type: 'paragraph', content: [] },
      ], cursor.block, 'after');

      const doc = editor.document;
      const cursorIdx = doc.findIndex((b) => b.id === cursor.block.id);
      const newBlock = doc[cursorIdx + 1];
      const paragraphBlock = doc[cursorIdx + 2];
      if (paragraphBlock) {
        requestAnimationFrame(() => {
          try { editor.setTextCursorPosition(paragraphBlock.id, 'start'); } catch {}
        });
      }
      if (!newBlock) return;

      triggerUploadForBlock(newBlock.id, file);
    };

    const handleDragOver = (e) => {
      if (e.target.closest('[data-content-type="image"]')) return;
      if (e.dataTransfer?.types?.includes('Files')) {
        e.preventDefault();
      }
    };

    editorDom.addEventListener('paste', handlePaste);
    editorDom.addEventListener('drop', handleDrop);
    editorDom.addEventListener('dragover', handleDragOver);
    return () => {
      editorDom.removeEventListener('paste', handlePaste);
      editorDom.removeEventListener('drop', handleDrop);
      editorDom.removeEventListener('dragover', handleDragOver);
    };
  }, [editor, f.images, triggerUploadForBlock, acceptImageTypes, maxFileSizeBytes]);

  // Slash menu items
  // Use BlockNote's `filterSuggestionItems` helper so the search also
  // covers `aliases` / `subtext` / `group` (the previous custom filter
  // checked title only, which produced weird half-rendered groups when
  // BlockNote items had no `title` field for the current schema).
  const getItems = useCallback(async (query) => {
    const defaults = getDefaultReactSlashMenuItems(editor)
      .filter(item => !['video', 'audio', 'file'].includes(item.key))
      // Host-driven image insert: drop BlockNote's default image item (it opens
      // the Upload/Embed-URL card we're suppressing) — replaced below.
      .filter(item => !(imageInsert === 'host' && f.images && item.key === 'image'));

    const custom = [];

    if (f.images && imageInsert === 'host' && uploadFile) {
      custom.push({
        title: 'Image',
        subtext: 'Upload an image',
        group: 'Basic',
        aliases: ['image', 'img', 'photo', 'picture', 'upload'],
        icon: <span style={{ fontSize: 14 }}>🖼️</span>,
        onItemClick: () => pickHostImage(),
      });
    }

    if (f.equations) {
      custom.push({
        title: 'Block Equation',
        subtext: 'LaTeX block equation',
        group: 'Advanced',
        aliases: ['equation', 'eq', 'latex', 'math', 'tex'],
        icon: <span style={{ fontSize: 16 }}>∑</span>,
        onItemClick: () => editor.insertBlocks([{ type: 'blockEquation' }], editor.getTextCursorPosition().block, 'after'),
      });
    }

    if (f.mermaid) {
      custom.push({
        title: 'Diagram',
        subtext: 'Mermaid diagram (flowchart, sequence, etc.)',
        group: 'Advanced',
        aliases: ['mermaid', 'flowchart', 'sequence', 'diagram', 'graph'],
        icon: <span style={{ fontSize: 14 }}>◇</span>,
        onItemClick: () => editor.insertBlocks([{ type: 'mermaidBlock' }], editor.getTextCursorPosition().block, 'after'),
      });
    }

    if (f.tableOfContents) {
      custom.push({
        title: 'Table of Contents',
        subtext: 'Auto-generated document outline',
        group: 'Advanced',
        aliases: ['toc', 'outline', 'contents'],
        icon: <span style={{ fontSize: 14 }}>☰</span>,
        onItemClick: () => editor.insertBlocks([{ type: 'tableOfContents' }], editor.getTextCursorPosition().block, 'after'),
      });
    }

    if (f.dates) {
      custom.push({
        title: 'Date',
        subtext: "Insert today's date as an inline chip (Ctrl+D)",
        group: 'Advanced',
        aliases: ['date', 'today', 'time', 'now'],
        icon: <span style={{ fontSize: 14 }}>📅</span>,
        onItemClick: () => {
          try {
            const today = new Date().toISOString().split('T')[0];
            editor._tiptapEditor.commands.insertContent({
              type: 'dateInline',
              attrs: { date: today },
            });
          } catch {}
        },
      });
    }

    custom.push({
      title: 'Variable',
      subtext: 'Insert a {{merge variable}} (exports as literal text)',
      group: 'Advanced',
      aliases: ['variable', 'merge', 'token', 'field', '{{'],
      icon: <span style={{ fontSize: 13, fontFamily: 'monospace' }}>{'{}'}</span>,
      onItemClick: () => {
        try {
          editor._tiptapEditor.commands.insertContent({ type: 'lixVariable', attrs: { name: '' } });
        } catch {}
      },
    });

    if (f.buttons) {
      custom.push({
        title: 'Button',
        subtext: 'Call-to-action button (email-safe export)',
        group: 'Basic',
        aliases: ['button', 'cta', 'link button'],
        icon: <span style={{ fontSize: 14 }}>▭</span>,
        onItemClick: () => editor.insertBlocks(
          [{ type: 'buttonBlock', props: { ...(buttonDefaults || {}) } }],
          editor.getTextCursorPosition().block,
          'after',
        ),
      });
    }

    const all = [...defaults, ...custom, ...extraSlashItems];
    const filtered = filterSuggestionItems(all, query);

    // BlockNote's slash-menu renderer emits a group label whenever the
    // group string changes between consecutive items (it assumes items
    // are pre-sorted by group). If groups interleave it produces
    // duplicate <Label key={group}> children → React key collision and
    // empty "Advanced Advanced" rows. Sort stably by group to keep all
    // items in the same group contiguous.
    const groupOrder = new Map();
    for (const item of filtered) {
      const g = item.group ?? '';
      if (!groupOrder.has(g)) groupOrder.set(g, groupOrder.size);
    }
    return filtered
      .map((item, i) => ({ item, i, gIdx: groupOrder.get(item.group ?? '') }))
      .sort((a, b) => a.gIdx - b.gIdx || a.i - b.i)
      .map((x) => x.item);
  }, [editor, f, extraSlashItems, buttonDefaults, imageInsert, uploadFile, pickHostImage]);

  const handleChange = useCallback(() => {
    if (onChange) onChange(editor);
  }, [editor, onChange]);

  const uploadCfg = useMemo(
    () => ({ uploadFile, acceptImageTypes, maxFileSizeBytes, onUploadError, imageInsert }),
    [uploadFile, acceptImageTypes, maxFileSizeBytes, onUploadError, imageInsert],
  );

  return (
    <LixUploadContext.Provider value={uploadCfg}>
    <div className={`lix-editor-wrapper${''}`} ref={wrapperRef} style={{ position: 'relative' }}>
      <BlockNoteView
        editor={editor}
        editable={editable}
        onChange={handleChange}
        theme={isDark ? 'dark' : 'light'}
        slashMenu={false}
        formattingToolbar={false}
      >
        {/* Custom formatting toolbar — drop the "Create link" button.
            Inline link insertion is intentionally disabled; users can still
            paste URLs (auto-linked) and use the markdown shortcut [text](url). */}
        <FormattingToolbarController
          formattingToolbar={() => (
            <FormattingToolbar>
              {getFormattingToolbarItems().filter((item) => {
                const key = item?.key ?? item?.props?.key;
                return key !== 'createLink';
              })}
            </FormattingToolbar>
          )}
        />
        <SuggestionMenuController triggerCharacter="/" getItems={getItems} />
        <TableHandlesController />
        {children}
      </BlockNoteView>

      {f.linkPreview && editorLinkPreview.preview && (
        <LinkPreviewTooltip
          anchorEl={editorLinkPreview.preview.anchorEl}
          url={editorLinkPreview.preview.url}
          onClose={editorLinkPreview.hide}
        />
      )}
    </div>
    </LixUploadContext.Provider>
  );
});

export default LixEditor;
