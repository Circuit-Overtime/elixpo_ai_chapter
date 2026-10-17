"use client";

// Browser-only. Imported exclusively through lix-editor.tsx via ssr:false, so
// BlockNote/Mantine never evaluate on the server (they touch browser globals at
// import time).
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import "@elixpo/lixeditor/styles";
import "./lix-editor-overrides.css";
import {
    LixEditor,
    type LixEditorHandle,
    type LixEditorProps,
    LixThemeProvider,
} from "@elixpo/lixeditor";
import { useRef } from "react";
import { useTheme } from "./theme-provider";

export interface LixEditorInnerProps {
    initialContent?: LixEditorProps["initialContent"];
    features?: LixEditorProps["features"];
    placeholder?: string;
    onChange?: (editor: any) => void;
    /** Receives the imperative handle (getHTML/getBlocks/…) once mounted. */
    onReady?: (api: LixEditorHandle) => void;
    /** Host-controlled image upload — return a hosted URL (we use Cloudinary). */
    uploadFile?: LixEditorProps["uploadFile"];
    /** Merge-field names suggested when typing `{{`. */
    variableSuggestions?: LixEditorProps["variableSuggestions"];
    /** Defaults for buttons inserted from the slash menu. */
    buttonDefaults?: LixEditorProps["buttonDefaults"];
}

export default function LixEditorInner({
    initialContent,
    features,
    placeholder,
    onChange,
    onReady,
    uploadFile,
    variableSuggestions,
    buttonDefaults,
}: LixEditorInnerProps) {
    const ref = useRef<LixEditorHandle>(null);
    const { theme } = useTheme();
    return (
        <LixThemeProvider theme={theme}>
            <LixEditor
                ref={ref}
                initialContent={initialContent}
                features={features}
                placeholder={placeholder}
                onChange={onChange}
                uploadFile={uploadFile}
                variableSuggestions={variableSuggestions}
                buttonDefaults={buttonDefaults}
                onReady={() => {
                    if (ref.current) onReady?.(ref.current);
                }}
            />
        </LixThemeProvider>
    );
}
