/**
 * Sanitizes text for Discord output, allowing basic markdown.
 * Removes links, code blocks, quotes, and excess markdown.
 * @param {string} text
 * @returns {string}
 */
export function sanitizeText(text) {
    if (!text) return '';
    let sanitized = text;
    // Remove links/URLs
    sanitized = sanitized.replace(/(https?:\/\/[^\s]+)/g, '');
    // Remove Markdown code blocks (backticks)
    sanitized = sanitized.replace(/```.*?```/gs, '');
    sanitized = sanitized.replace(/`.*?`/g, '');
    // Remove Markdown quotes (>)
    sanitized = sanitized.replace(/^>.*$/gm, '');
    // Remove list markers
    sanitized = sanitized.replace(/^[\s]*[-+*][\s]+/gm, '');
    // Allow **bold**, *italics*, __underline__, _italics_, ~~strikethrough~~
    sanitized = sanitized.replace(/(?<!\s)\*\*([^\s*]+)\*\*(?!\s)/g, '**$1**');
    sanitized = sanitized.replace(/(?<!\s)\*([^\s*]+)\*(?!\s)/g, '*$1*');
    sanitized = sanitized.replace(/(?<!\s)__([^\s_]+)__(?!\s)/g, '__$1__');
    sanitized = sanitized.replace(/(?<!\s)_([^\s_]+)_(?!\s)/g, '_$1_');
    sanitized = sanitized.replace(/(?<!\s)~~([^\s~]+)~~(?!\s)/g, '~~$1~~');
    // Remove any remaining unpaired markdown characters
    sanitized = sanitized.replace(/[\*_~`]/g, '');
    // Escape basic HTML entities
    sanitized = sanitized.replace(/</g, '<').replace(/>/g, '>');
    // Trim whitespace
    sanitized = sanitized.trim();
    // Collapse multiple newlines into max two
    sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
    return sanitized;
}

/**
 * Returns a suffix prompt string based on the theme.
 * @param {string} theme
 * @returns {string}
 */
export function getSuffixPrompt(theme) {
    switch (theme) {
        case "fantasy": return "in a magical fantasy setting, with mythical creatures and surreal landscapes";
        case "halloween": return "with spooky Halloween-themed elements, pumpkins, and eerie shadows";
        case "structure": return "in the style of monumental architecture, statues, or structural art";
        case "crayon": return "in the style of colorful crayon art with vibrant, childlike strokes";
        case "space": return "in a vast, cosmic space setting with stars, planets and nebulae";
        case "chromatic": return "in a chromatic style with vibrant, shifting colors and gradients";
        case "cyberpunk": return "in a futuristic cyberpunk setting with neon lights and dystopian vibes";
        case "anime": return "in the style of anime, with detailed character designs and dynamic poses";
        case "landscape": return "depicting a breathtaking landscape with natural scenery and serene views";
        case "samurai": return "featuring a traditional samurai theme with warriors and ancient Japan";
        case "wpap": return "in the WPAP style with geometric shapes and vibrant pop-art colors";
        case "vintage": return "in a vintage, old-fashioned style with sepia tones and retro aesthetics";
        case "pixel": return "in a pixel art style with blocky, 8-bit visuals and retro game aesthetics";
        case "normal": return "realistic and natural style";
        case "synthwave": return "in a retro-futuristic synthwave style with neon colors and 80s vibes";
        default: return "artistic style";
    }
}