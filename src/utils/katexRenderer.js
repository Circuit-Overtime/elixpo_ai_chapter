let katexPromise;

const htmlCache = new Map();
const MAX_CACHE_ENTRIES = 80;
const MAX_CACHE_CHARS = 400_000;
let cachedChars = 0;

function stripDelimiters(raw) {
    let value = String(raw || "").trim();
    if (value.startsWith("\\[") && value.endsWith("\\]"))
        return value.slice(2, -2).trim();
    if (value.startsWith("$$") && value.endsWith("$$"))
        return value.slice(2, -2).trim();
    if (value.startsWith("\\(") && value.endsWith("\\)"))
        return value.slice(2, -2).trim();
    if (value.startsWith("$") && value.endsWith("$") && value.length > 2)
        return value.slice(1, -1).trim();
    return value;
}

function loadKatex() {
    katexPromise ||= import("katex").then((module) => module.default);
    return katexPromise;
}

export async function renderKatex(latex, displayMode = true) {
    const expression = stripDelimiters(latex);
    if (!expression) return "";

    const key = `${displayMode ? "block" : "inline"}:${expression}`;
    const cached = htmlCache.get(key);
    if (cached) {
        // Refresh insertion order so frequently visible equations remain cached.
        htmlCache.delete(key);
        htmlCache.set(key, cached);
        return cached;
    }

    try {
        const katex = await loadKatex();
        const html = katex.renderToString(expression, {
            displayMode,
            throwOnError: false,
        });
        // Very large generated markup is cheaper to recompute than retain.
        if (html.length <= MAX_CACHE_CHARS / 4) {
            htmlCache.set(key, html);
            cachedChars += html.length;
        }
        while (
            htmlCache.size > MAX_CACHE_ENTRIES ||
            cachedChars > MAX_CACHE_CHARS
        ) {
            const oldestKey = htmlCache.keys().next().value;
            const oldestHtml = htmlCache.get(oldestKey);
            htmlCache.delete(oldestKey);
            cachedChars -= oldestHtml?.length || 0;
        }
        return html;
    } catch {
        return `<span style="color:#f87171">${String(latex || "")}</span>`;
    }
}
