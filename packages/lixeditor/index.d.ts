import type { ReactNode, Ref } from 'react';

export interface LixFeatures {
  equations?: boolean;
  mermaid?: boolean;
  codeHighlighting?: boolean;
  tableOfContents?: boolean;
  images?: boolean;
  buttons?: boolean;
  pdf?: boolean;
  dates?: boolean;
  linkPreview?: boolean;
  markdownLinks?: boolean;
}

export interface ButtonBlockProps {
  text: string;
  url: string;
  align?: 'left' | 'center' | 'right';
  variant?: 'solid' | 'outline';
  color?: string;
  radius?: number;
}

export type LixBlock = Record<string, any>;

export interface LixEditorHandle {
  getDocument(): LixBlock[];
  getEditor(): any;
  getBlocks(): LixBlock[];
  /** Email-safe HTML: bulletproof buttons, inline-styled images, {{vars}} round-trip. */
  getHTML(): string;
  /** BlockNote's lossy editor-DOM HTML. */
  getHTMLLossy(): Promise<string>;
  getMarkdown(): Promise<string>;
  /** Insert a ready image block with the URL already set (host-driven insert). */
  insertImage(url: string, opts?: { alt?: string; align?: 'left' | 'center' | 'right'; name?: string }): void;
}

export interface LixEditorProps {
  initialContent?: LixBlock[] | string | null;
  onChange?: (editor: any) => void;
  onReady?: () => void;
  features?: LixFeatures;
  placeholder?: string;

  // Added in 2.7.0
  uploadFile?: (file: File) => Promise<string>;
  acceptImageTypes?: string[];
  maxFileSizeBytes?: number;
  onUploadError?: (err: Error, file: File) => void;
  buttonDefaults?: Partial<ButtonBlockProps>;
  variableSuggestions?: string[];
  editable?: boolean;
  linkPreviewEndpoint?: string;
  /** "host" → no in-block Upload/Embed-URL card; images appear only with a URL. */
  imageInsert?: 'default' | 'host';

  codeLanguages?: Record<string, any>;
  extraBlockSpecs?: any[];
  extraInlineSpecs?: any[];
  slashMenuItems?: any[];
  collaboration?: any;
  children?: ReactNode;
  ref?: Ref<LixEditorHandle>;
}

export const LixEditor: React.ForwardRefExoticComponent<
  LixEditorProps & React.RefAttributes<LixEditorHandle>
>;

export interface LixPreviewProps {
  blocks?: LixBlock[] | string | null;
  html?: string;
  features?: LixFeatures;
  className?: string;
}
export const LixPreview: React.FC<LixPreviewProps>;

export const LixThemeProvider: React.FC<{ children?: ReactNode; theme?: string; defaultTheme?: string }>;
export function useLixTheme(): {
  theme: string; setTheme: (t: string) => void; toggleTheme: () => void; isDark: boolean; mounted: boolean;
};

// Block / inline specs (for custom schemas)
export const BlockEquation: (config?: any) => any;
export const InlineEquation: any;
export const DateInline: any;
export const VariableInline: any;
export const MermaidBlock: (config?: any) => any;
export const TableOfContents: (config?: any) => any;
export const ButtonBlock: (config?: any) => any;
export const PDFEmbedBlock: (config?: any) => any;
export const ImageBlock: (config?: any) => any;

// Utilities
export function renderBlocksToHTML(blocks: LixBlock[]): string;
export function buttonBlockToHTML(props: Partial<ButtonBlockProps> & Record<string, any>): string;
export const LinkPreviewTooltip: React.FC<any>;
export function useLinkPreview(): any;
export function setLinkPreviewEndpoint(endpoint: string): void;
export const KeyboardShortcutsModal: React.FC<any>;

// Host-controlled media upload (module-level alternative to the uploadFile prop)
export function setImageUploader(fn: (file: File) => Promise<string>): void;
export const LixUploadContext: React.Context<any>;
export function useUploadConfig(): {
  uploadFile: ((file: File) => Promise<string>) | null;
  acceptImageTypes: string[];
  maxFileSizeBytes: number;
  onUploadError: ((err: Error, file: File) => void) | null;
};

// Merge-variable suggestions (module-level alternative to variableSuggestions prop)
export function setVariableSuggestions(list: string[]): void;
