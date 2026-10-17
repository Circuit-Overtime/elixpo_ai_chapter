/**
 * Generate a deterministic pixel-art avatar (like GitHub identicons)
 * from a string seed. Returns an SVG data URL.
 */

function hashCode(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

const PALETTE = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F1948A', '#82E0AA', '#F8C471', '#AED6F1', '#D2B4DE',
  '#A3E4D7', '#FAD7A0', '#D5DBDB', '#ABEBC6', '#F9E79F',
]

export function generateAvatar(seed) {
  const hash = hashCode(seed)
  const color = PALETTE[hash % PALETTE.length]
  const size = 5
  const scale = 8

  // Generate a 5x5 grid, mirrored horizontally (only need left half + center)
  const grid = []
  for (let y = 0; y < size; y++) {
    const row = []
    for (let x = 0; x < Math.ceil(size / 2); x++) {
      const bit = (hashCode(seed + x + y * size) % 3) > 0 ? 1 : 0
      row.push(bit)
    }
    grid.push(row)
  }

  let rects = ''
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const srcX = x < Math.ceil(size / 2) ? x : size - 1 - x
      if (grid[y][srcX]) {
        rects += `<rect x="${x * scale}" y="${y * scale}" width="${scale}" height="${scale}" fill="${color}"/>`
      }
    }
  }

  const svgSize = size * scale
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgSize} ${svgSize}" width="${svgSize}" height="${svgSize}"><rect width="${svgSize}" height="${svgSize}" fill="#2a2a35"/>${rects}</svg>`

  return `data:image/svg+xml;base64,${btoa(svg)}`
}

const GUEST_ADJECTIVES = [
  'Swift', 'Clever', 'Bold', 'Calm', 'Bright',
  'Wild', 'Keen', 'Agile', 'Brave', 'Vivid',
  'Noble', 'Quick', 'Sly', 'Warm', 'Cool',
]

const GUEST_NOUNS = [
  'Fox', 'Owl', 'Bear', 'Wolf', 'Hawk',
  'Lynx', 'Crow', 'Deer', 'Hare', 'Seal',
  'Crane', 'Otter', 'Wren', 'Moth', 'Pike',
]

export function generateGuestName() {
  const adj = GUEST_ADJECTIVES[Math.floor(Math.random() * GUEST_ADJECTIVES.length)]
  const noun = GUEST_NOUNS[Math.floor(Math.random() * GUEST_NOUNS.length)]
  return `${adj} ${noun}`
}
