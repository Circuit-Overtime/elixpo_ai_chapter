"use client";

import dynamic from "next/dynamic";
import type { LixPreviewInnerProps } from "./lix-preview-inner";

const Inner = dynamic(() => import("./lix-preview-inner"), { ssr: false, loading: () => null });

/** Read-only render of a lixeditor document (faithful preview). */
export default function LixPreview(props: LixPreviewInnerProps) {
    return <Inner {...props} />;
}

export type { LixPreviewInnerProps };
