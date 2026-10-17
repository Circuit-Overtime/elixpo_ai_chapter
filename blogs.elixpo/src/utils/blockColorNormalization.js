const COLOR_LEAK_SOURCE_BLOCKS = new Set(["codeBlock", "mermaidBlock"]);
const RESETTABLE_TEXT_BLOCKS = new Set([
    "paragraph",
    "quote",
    "bulletListItem",
    "numberedListItem",
    "checkListItem",
]);

const LEAKED_GRAY_VALUES = new Set([
    "gray",
    "grey",
    "default",
    "#9ca3af",
    "rgb(156,163,175)",
    "rgba(156,163,175,1)",
]);

function normalizeColorValue(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "");
}

function clearLeakedGray(content) {
    if (!Array.isArray(content)) return content;
    let changed = false;
    const normalized = content.map((item) => {
        let next = item;
        if (LEAKED_GRAY_VALUES.has(normalizeColorValue(item?.styles?.textColor))) {
            const styles = { ...item.styles };
            delete styles.textColor;
            next = { ...next, styles };
            changed = true;
        }
        if (Array.isArray(item?.content)) {
            const nested = clearLeakedGray(item.content);
            if (nested === item.content) return next;
            next = { ...next, content: nested };
            changed = true;
        }
        return next;
    });
    return changed ? normalized : content;
}

function hasLeakedGray(content) {
    if (!Array.isArray(content)) return false;
    return content.some(
        (item) =>
            LEAKED_GRAY_VALUES.has(
                normalizeColorValue(item?.styles?.textColor),
            ) || hasLeakedGray(item?.content),
    );
}

function hasText(content) {
    if (!Array.isArray(content)) return false;
    return content.some(
        (item) =>
            Boolean(String(item?.text || "").trim()) || hasText(item?.content),
    );
}

/**
 * BlockNote can carry the neutral code-block foreground through several text
 * blocks. Clear the contiguous leaked-gray run after that boundary, stopping
 * at the first normal text block or non-text section.
 */
export function clearInheritedBlockTextColors(blocks) {
    if (!Array.isArray(blocks)) return blocks;
    let changed = false;
    let resetGrayRun = false;
    const normalized = blocks.map((block) => {
        const children = clearInheritedBlockTextColors(block?.children);
        let content = block?.content;

        if (COLOR_LEAK_SOURCE_BLOCKS.has(block?.type)) {
            resetGrayRun = true;
        } else if (resetGrayRun && RESETTABLE_TEXT_BLOCKS.has(block?.type)) {
            if (hasLeakedGray(content)) {
                content = clearLeakedGray(content);
            } else if (hasText(content)) {
                resetGrayRun = false;
            }
            // Empty paragraphs keep the reset active for the next typed line.
        } else if (resetGrayRun) {
            resetGrayRun = false;
        }

        if (children === block?.children && content === block?.content) return block;
        changed = true;
        return { ...block, children, content };
    });
    return changed ? normalized : blocks;
}
