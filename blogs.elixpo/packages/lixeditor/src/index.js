/**
 * @elixpo/lixeditor — A rich WYSIWYG block editor and renderer.
 *
 * Usage:
 *   import { LixEditor, LixPreview, LixThemeProvider } from '@elixpo/lixeditor';
 *   import '@elixpo/lixeditor/styles';
 *
 *   <LixThemeProvider>
 *     <LixEditor
 *       initialContent={blocks}
 *       onChange={(editor) => save(editor.getBlocks())}
 *       features={{ equations: true, mermaid: true }}
 *     />
 *   </LixThemeProvider>
 *
 *   <LixPreview blocks={blocks} />
 */

// Core components
export { default as LixEditor } from './editor/LixEditor';
export { default as LixPreview } from './preview/LixPreview';

// Theme
export { LixThemeProvider, useLixTheme } from './hooks/useLixTheme';

// Block specs — for consumers who want to build custom schemas
export {
  BlockEquation,
  InlineEquation,
  DateInline,
  MermaidBlock,
  TableOfContents,
  ButtonBlock,
  PDFEmbedBlock,
  ImageBlock,
} from './blocks/index';
export { VariableInline, setVariableSuggestions } from './blocks/VariableInline';

// Utilities
export { renderBlocksToHTML, buttonBlockToHTML } from './preview/renderBlocks';
export { default as LinkPreviewTooltip, useLinkPreview, setLinkPreviewEndpoint } from './editor/LinkPreviewTooltip';
export { default as KeyboardShortcutsModal } from './editor/KeyboardShortcutsModal';

// Host-controlled media upload (module-level alternative to the uploadFile prop)
export { setImageUploader, LixUploadContext, useUploadConfig } from './editor/uploadConfig';
