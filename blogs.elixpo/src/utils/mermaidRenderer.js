import {
    getMermaidConfig,
    normalizeMermaidSource,
    prepareMermaidSvg,
} from "./mermaidConfig";

const MAX_CACHE_ENTRIES = 24;
const MAX_CACHE_CHARACTERS = 1_500_000;
const MAX_SINGLE_SVG_CHARACTERS = 300_000;

let mermaidLoadPromise = null;
let renderTail = Promise.resolve();
let renderSequence = 0;
let cachedCharacters = 0;

const renderedSvgCache = new Map();
const pendingRenders = new Map();

async function loadMermaid() {
    if (!mermaidLoadPromise) {
        mermaidLoadPromise = import("mermaid").then((module) => module.default);
    }
    return mermaidLoadPromise;
}

function cacheSvg(key, svg) {
    if (svg.length > MAX_SINGLE_SVG_CHARACTERS) return;

    const previous = renderedSvgCache.get(key);
    if (previous) cachedCharacters -= previous.length;
    renderedSvgCache.delete(key);
    renderedSvgCache.set(key, svg);
    cachedCharacters += svg.length;

    while (
        renderedSvgCache.size > MAX_CACHE_ENTRIES ||
        cachedCharacters > MAX_CACHE_CHARACTERS
    ) {
        const oldestKey = renderedSvgCache.keys().next().value;
        const oldest = renderedSvgCache.get(oldestKey);
        renderedSvgCache.delete(oldestKey);
        cachedCharacters -= oldest?.length || 0;
    }
}

function readCachedSvg(key) {
    const svg = renderedSvgCache.get(key);
    if (!svg) return null;
    // Refresh insertion order so frequently visible diagrams stay cached.
    renderedSvgCache.delete(key);
    renderedSvgCache.set(key, svg);
    return svg;
}

export function getCachedMermaidSvg(source, isDark) {
    if (!source?.trim()) return "";
    const diagram = normalizeMermaidSource(source);
    return readCachedSvg(`${isDark ? "dark" : "light"}\u0000${diagram}`) || "";
}

/**
 * Mermaid mutates singleton state while rendering, so unique renders must remain
 * serialized. Identical requests are coalesced and completed SVGs use a bounded
 * LRU cache; editor node-view remounts therefore do not grow an endless queue.
 */
export function renderMermaidSvg(source, isDark, signal) {
    const diagram = normalizeMermaidSource(source);
    const key = `${isDark ? "dark" : "light"}\u0000${diagram}`;
    const cached = readCachedSvg(key);
    if (cached) return Promise.resolve(cached);

    // Static previews may coalesce identical work. Editable previews pass an
    // AbortSignal so superseded source revisions can be dropped independently.
    if (!signal) {
        const pending = pendingRenders.get(key);
        if (pending) return pending;
    }

    const task = async () => {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const mermaid = await loadMermaid();
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        mermaid.initialize(getMermaidConfig(isDark));

        const id = `lix-mermaid-${++renderSequence}`;
        const container = document.createElement("div");
        container.id = `container-${id}`;
        container.style.cssText =
            "position:fixed;inset:0;width:100vw;opacity:0;pointer-events:none;z-index:-9999;";
        document.body.appendChild(container);

        try {
            const { svg } = await mermaid.render(id, diagram, container);
            const prepared = prepareMermaidSvg(svg);
            cacheSvg(key, prepared);
            return prepared;
        } finally {
            container.remove();
            document.getElementById(id)?.remove();
        }
    };

    const result = renderTail.then(task, task);
    // Keep only a small settled tail rather than retaining the full promise chain.
    renderTail = result.then(
        () => undefined,
        () => undefined,
    );
    if (!signal) {
        pendingRenders.set(key, result);
        result.then(
            () => pendingRenders.delete(key),
            () => pendingRenders.delete(key),
        );
    }
    return result;
}
