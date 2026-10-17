/**
 * Generates a deterministic GitHub-style blocky pixel avatar as a data URI.
 * The pattern is symmetric (mirrored horizontally) and colored based on a hash.
 *
 * Usage:
 *   import { generatePixelAvatar } from '@/lib/pixel-avatar';
 *   const dataUri = generatePixelAvatar('some-string', 64);
 *   <img src={dataUri} />
 */

function hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

// Curated palette — all look good on dark backgrounds
const COLORS = [
    "#a3e635",
    "#38bdf8",
    "#f472b6",
    "#fb923c",
    "#c084fc",
    "#34d399",
    "#f87171",
    "#facc15",
    "#22d3ee",
    "#818cf8",
    "#e879f9",
    "#4ade80",
    "#f97316",
    "#2dd4bf",
    "#a78bfa",
    "#fb7185",
    "#fbbf24",
    "#67e8f9",
    "#86efac",
    "#fda4af",
];

export function generatePixelAvatar(seed: string, size: number = 64): string {
    const h = hashCode(seed);
    const color = COLORS[h % COLORS.length];
    const bgColor = "#1e2530";

    // 5x5 grid, mirrored horizontally (only need 3 cols)
    const grid: boolean[][] = [];
    for (let row = 0; row < 5; row++) {
        grid[row] = [];
        for (let col = 0; col < 3; col++) {
            // Use different bits of the hash + row/col to decide on/off
            const bit = hashCode(`${seed + row},${col}`) % 3; // ~66% fill
            grid[row][col] = bit !== 0;
        }
        // Mirror: col 3 = col 1, col 4 = col 0
        grid[row][3] = grid[row][1];
        grid[row][4] = grid[row][0];
    }

    // Build SVG
    const cellSize = size / 5;
    let rects = "";
    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
            if (grid[r][c]) {
                rects += `<rect x="${c * cellSize}" y="${r * cellSize}" width="${cellSize}" height="${cellSize}" fill="${color}"/>`;
            }
        }
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${bgColor}" rx="4"/>${rects}</svg>`;

    return `data:image/svg+xml;base64,${btoa(svg)}`;
}
