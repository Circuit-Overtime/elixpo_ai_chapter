export function parseChecklistShortcut(value) {
    const match = String(value || "").match(/^\s?\[([ xX])\]$/);
    if (!match) return null;

    return { checked: match[1].toLowerCase() === "x" };
}
