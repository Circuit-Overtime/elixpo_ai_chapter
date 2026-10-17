"use client";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import "@elixpo/lixeditor/styles";
import { type LixBlock, LixPreview, LixThemeProvider } from "@elixpo/lixeditor";
import { useTheme } from "./theme-provider";

export interface LixPreviewInnerProps {
    blocks?: LixBlock[] | null;
    html?: string;
}

export default function LixPreviewInner({ blocks, html }: LixPreviewInnerProps) {
    const { theme } = useTheme();
    return (
        <LixThemeProvider theme={theme}>
            <LixPreview blocks={blocks} html={html} />
        </LixThemeProvider>
    );
}
