export const DEFAULT_SHAPE_LABEL_FONT_SIZE = 18;

function fallbackWidth(text, fontSize) {
    return [...text].reduce((width, character) => {
        if (/\s/.test(character)) return width + fontSize * 0.34;
        if (/[ilI1.,'`]/.test(character)) return width + fontSize * 0.32;
        if (/[MW@#%]/.test(character)) return width + fontSize * 0.88;
        return width + fontSize * 0.59;
    }, 0);
}

function browserTextWidth(text, fontSize) {
    if (typeof document === 'undefined') return null;
    try {
        const canvas = browserTextWidth.canvas || (browserTextWidth.canvas = document.createElement('canvas'));
        const context = canvas.getContext?.('2d');
        if (!context) return null;
        context.font = `${fontSize}px lixFont, sans-serif`;
        return context.measureText(text).width;
    } catch {
        return null;
    }
}

export function measureShapeLabel(label, fontSize = DEFAULT_SHAPE_LABEL_FONT_SIZE) {
    const lines = String(label ?? '').replace(/\r\n?/g, '\n').split('\n');
    const safeLines = lines.length ? lines : [''];
    const widths = safeLines.map((line) => browserTextWidth(line, fontSize) ?? fallbackWidth(line, fontSize));
    const lineHeight = fontSize * 1.3;
    const contentWidth = Math.max(0, ...widths);
    const contentHeight = Math.max(lineHeight, safeLines.length * lineHeight);

    return {
        lines: safeLines,
        widths,
        lineHeight,
        contentWidth,
        contentHeight,
        requiredWidth: Math.ceil(contentWidth + 32),
        requiredHeight: Math.ceil(contentHeight + 24),
    };
}
