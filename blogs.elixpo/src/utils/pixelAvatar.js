/**
 * Deterministic generators for avatars and banners in 3 different styles:
 * 1. Neo-Brutalist (Active Default)
 * 2. Premium Aesthetic (Mesh Gradient)
 * 3. Classic Pixel-Art
 */

// Shared hash function
export function hashSeed(seed) {
  let hash = 0;
  const s = seed || 'default';
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// ============================================================================
// 1. NEO-BRUTALIST STYLE (Currently Active)
// ============================================================================

export const BRUTALIST_PALETTES = [
  ['#FBE54D', '#FF7E67', '#74E291'], 
  ['#A7EDE7', '#FFB3FD', '#FBE54D'],
  ['#74E291', '#FBE54D', '#FF7E67'],
  ['#FFA1F5', '#A7EDE7', '#FBE54D'],
  ['#FF7E67', '#74E291', '#A7EDE7'],
  ['#E2F0CB', '#FF9AA2', '#C7CEEA'],
  ['#C7CEEA', '#B5EAD7', '#FFDFD3'],
  ['#FFD166', '#EF476F', '#118AB2'],
  ['#06D6A0', '#EF476F', '#FFD166'],
  ['#FCFCFC', '#FF7E67', '#A7EDE7'],
  ['#FCA311', '#E5E5E5', '#14213D'],
  ['#FFBE0B', '#FF006E', '#8338EC'],
];

function drawBrutalistShape(type, x, y, size, fill, hash) {
  const shadowOffset = 8;
  const sw = 6;
  if (type === 0) { // Circle
    return `<circle cx="${x + shadowOffset}" cy="${y + shadowOffset}" r="${size}" fill="#000000" /><circle cx="${x}" cy="${y}" r="${size}" fill="${fill}" stroke="#000000" stroke-width="${sw}" />`;
  } else if (type === 1) { // Rectangle
    return `<rect x="${x - size + shadowOffset}" y="${y - size + shadowOffset}" width="${size*2}" height="${size*2}" fill="#000000" /><rect x="${x - size}" y="${y - size}" width="${size*2}" height="${size*2}" fill="${fill}" stroke="#000000" stroke-width="${sw}" />`;
  } else if (type === 2) { // Pill
    return `<rect x="${x - size*1.5 + shadowOffset}" y="${y - size*0.5 + shadowOffset}" width="${size*3}" height="${size}" rx="${size/2}" fill="#000000" /><rect x="${x - size*1.5}" y="${y - size*0.5}" width="${size*3}" height="${size}" rx="${size/2}" fill="${fill}" stroke="#000000" stroke-width="${sw}" />`;
  } else { // Polygon
    const points = `${x},${y-size} ${x+size},${y} ${x},${y+size} ${x-size},${y}`;
    const shadowPoints = `${x+shadowOffset},${y-size+shadowOffset} ${x+size+shadowOffset},${y+shadowOffset} ${x+shadowOffset},${y+size+shadowOffset} ${x-size+shadowOffset},${y+shadowOffset}`;
    return `<polygon points="${shadowPoints}" fill="#000000" /><polygon points="${points}" fill="${fill}" stroke="#000000" stroke-width="${sw}" stroke-linejoin="round" />`;
  }
}

export function generatePixelAvatar(seed) {
  const h = hashSeed(seed);
  const palette = BRUTALIST_PALETTES[h % BRUTALIST_PALETTES.length];
  const [bg, c1, c2] = palette;
  const SIZE = 240;
  const grid = `<pattern id="grid_${h}" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#000000" stroke-width="2" opacity="0.15"/></pattern><rect width="${SIZE}" height="${SIZE}" fill="${bg}"/><rect width="${SIZE}" height="${SIZE}" fill="url(#grid_${h})"/>`;
  let shapes = '';
  for(let i=0; i<2; i++) {
     const type = (h + i*7) % 4;
     const cx = 60 + ((h * (i*13 + 7)) % 120);
     const cy = 60 + ((h * (i*17 + 11)) % 120);
     const size = 40 + ((h * (i*19 + 23)) % 40);
     shapes += drawBrutalistShape(type, cx, cy, size, i === 0 ? c1 : c2, h);
  }
  return `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">${grid}${shapes}<rect width="${SIZE}" height="${SIZE}" fill="none" stroke="#000000" stroke-width="12"/></svg>`)}`;
}

export function generateProfileBanner(seed, tintSeed) {
  const h = hashSeed(seed);
  const paletteHash = tintSeed ? hashSeed(tintSeed) : h;
  const palette = BRUTALIST_PALETTES[paletteHash % BRUTALIST_PALETTES.length];
  const [bg, c1, c2] = palette;
  const W = 1056, H = 160;
  const grid = `<pattern id="grid_pb_${h}" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#000000" stroke-width="2" opacity="0.15"/></pattern><rect width="${W}" height="${H}" fill="${bg}"/><rect width="${W}" height="${H}" fill="url(#grid_pb_${h})"/>`;
  let shapes = '';
  for(let i=0; i<4; i++) {
     const type = (h + i*11) % 4;
     const cx = 100 + ((h * (i*13 + 7)) % (W - 200));
     const cy = ((h * (i*17 + 11)) % H);
     const size = 50 + ((h * (i*19 + 23)) % 70);
     shapes += drawBrutalistShape(type, cx, cy, size, i % 2 === 0 ? c1 : c2, h);
  }
  return `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${grid}${shapes}<rect width="${W}" height="${H}" fill="none" stroke="#000000" stroke-width="12"/></svg>`)}`;
}

export function generateBlogBanner(seed) {
  const h = hashSeed(seed);
  const palette = BRUTALIST_PALETTES[h % BRUTALIST_PALETTES.length];
  const [bg, c1, c2] = palette;
  const W = 720, H = 240;
  const grid = `<pattern id="grid_bb_${h}" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="20" cy="20" r="2" fill="#000000" opacity="0.3"/></pattern><rect width="${W}" height="${H}" fill="${bg}"/><rect width="${W}" height="${H}" fill="url(#grid_bb_${h})"/>`;
  let shapes = '';
  for(let i=0; i<4; i++) {
     const type = (h + i*13) % 4;
     const cx = 100 + ((h * (i*7 + 11)) % (W - 200));
     const cy = 40 + ((h * (i*17 + 23)) % (H - 80));
     const size = 60 + ((h * (i*19 + 31)) % 80);
     shapes += drawBrutalistShape(type, cx, cy, size, i % 2 === 0 ? c1 : c2, h);
  }
  return `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${grid}${shapes}<rect width="${W}" height="${H}" fill="none" stroke="#000000" stroke-width="12"/></svg>`)}`;
}

export function generateBlogThumbnail(seed) {
  const h = hashSeed(seed);
  const palette = BRUTALIST_PALETTES[h % BRUTALIST_PALETTES.length];
  const [bg, c1, c2] = palette;
  const SIZE = 240;
  const grid = `<pattern id="grid_tb_${h}" width="30" height="30" patternUnits="userSpaceOnUse"><circle cx="15" cy="15" r="2" fill="#000000" opacity="0.3"/></pattern><rect width="${SIZE}" height="${SIZE}" fill="${bg}"/><rect width="${SIZE}" height="${SIZE}" fill="url(#grid_tb_${h})"/>`;
  let shapes = '';
  for(let i=0; i<2; i++) {
     const type = (h + i*5) % 4;
     const cx = 60 + ((h * (i*13 + 7)) % (SIZE - 120));
     const cy = 60 + ((h * (i*17 + 11)) % (SIZE - 120));
     const size = 40 + ((h * (i*19 + 23)) % 50);
     shapes += drawBrutalistShape(type, cx, cy, size, i === 0 ? c1 : c2, h);
  }
  return `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">${grid}${shapes}<rect width="${SIZE}" height="${SIZE}" fill="none" stroke="#000000" stroke-width="12"/></svg>`)}`;
}


// ============================================================================
// 2. PREMIUM AESTHETIC (Mesh Gradient)
// ============================================================================

export const AESTHETIC_PALETTES = [
  ['#1a1040', '#9b7bf7', '#c084fc'], ['#00224D', '#5D0E41', '#FF204E'],
  ['#001C30', '#176B87', '#64CCC5'], ['#1A120B', '#5A3E2B', '#D5CEA3'],
  ['#1F1717', '#CE5A67', '#FCF5ED'], ['#0F0F0F', '#232D3F', '#008170'],
  ['#0B2447', '#19376D', '#576CBC'], ['#2B2A4C', '#B31312', '#EA906C'],
  ['#1B262C', '#0F4C75', '#BBE1FA'], ['#18122B', '#443C68', '#635985'],
];

export function generatePixelAvatarAesthetic(seed) {
  const h = hashSeed(seed);
  const palette = AESTHETIC_PALETTES[h % AESTHETIC_PALETTES.length];
  const [bg, c1, c2] = palette;
  const SIZE = 240;
  let shapes = '';
  for(let i=0; i<4; i++) {
     const cx = ((h * (i*13 + 7)) % (SIZE*1.5)) - (SIZE/4);
     const cy = ((h * (i*17 + 11)) % (SIZE*1.5)) - (SIZE/4);
     const r = 80 + ((h * (i*19 + 23)) % 120);
     const opacity = 0.5 + (((h * (i*37 + 41)) % 30) / 100);
     shapes += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${i % 2 === 0 ? c1 : c2}" opacity="${opacity}"/>`;
  }
  return `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}"><rect width="${SIZE}" height="${SIZE}" fill="${bg}" rx="12"/>${shapes}<path d="M0 0 L${SIZE} ${SIZE} L${SIZE} 0 Z" fill="#ffffff" opacity="0.06"/></svg>`)}`;
}

export function generateProfileBannerAesthetic(seed, tintSeed) {
  const h = hashSeed(seed);
  const paletteHash = tintSeed ? hashSeed(tintSeed) : h;
  const palette = AESTHETIC_PALETTES[paletteHash % AESTHETIC_PALETTES.length];
  const [bg, c1, c2] = palette;
  const W = 1056, H = 160;
  let shapes = '';
  for(let i=0; i<6; i++) {
     const cx = ((h * (i*13 + 7)) % (W * 1.2)) - (W * 0.1);
     const cy = ((h * (i*17 + 11)) % (H * 2)) - (H/2);
     const rx = 200 + ((h * (i*19 + 23)) % 400);
     const ry = 150 + ((h * (i*29 + 31)) % 200);
     const opacity = 0.4 + (((h * (i*37 + 41)) % 40) / 100);
     shapes += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${i % 2 === 0 ? c1 : c2}" opacity="${opacity}"/>`;
  }
  return `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><rect width="${W}" height="${H}" fill="${bg}"/>${shapes}<path d="M0 ${H} L${W} 0 L${W} ${H} Z" fill="#000000" opacity="0.15"/><path d="M0 0 L${W/2} 0 L0 ${H} Z" fill="#ffffff" opacity="0.08"/></svg>`)}`;
}

export function generateBlogBannerAesthetic(seed) {
  const h = hashSeed(seed);
  const palette = AESTHETIC_PALETTES[h % AESTHETIC_PALETTES.length];
  const [bg, c1, c2] = palette;
  const W = 720, H = 240;
  let shapes = '';
  for(let i=0; i<6; i++) {
     const cx = ((h * (i*13 + 7)) % (W * 1.2)) - (W * 0.1);
     const cy = ((h * (i*17 + 11)) % (H * 2)) - (H/2);
     const rx = 150 + ((h * (i*19 + 23)) % 300);
     const ry = 150 + ((h * (i*29 + 31)) % 250);
     const opacity = 0.4 + (((h * (i*37 + 41)) % 40) / 100);
     shapes += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${i % 2 === 0 ? c1 : c2}" opacity="${opacity}"/>`;
  }
  return `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><rect width="${W}" height="${H}" fill="${bg}"/>${shapes}<path d="M0 ${H} L${W} 0 L${W} ${H} Z" fill="#000000" opacity="0.15"/><path d="M0 0 L${W/3} 0 L0 ${H} Z" fill="#ffffff" opacity="0.08"/></svg>`)}`;
}

export function generateBlogThumbnailAesthetic(seed) {
  const h = hashSeed(seed);
  const palette = AESTHETIC_PALETTES[h % AESTHETIC_PALETTES.length];
  const [bg, c1, c2] = palette;
  const SIZE = 240;
  let shapes = '';
  for(let i=0; i<4; i++) {
     const cx = ((h * (i*13 + 7)) % (SIZE*1.5)) - (SIZE/4);
     const cy = ((h * (i*17 + 11)) % (SIZE*1.5)) - (SIZE/4);
     const r = 80 + ((h * (i*19 + 23)) % 100);
     const opacity = 0.4 + (((h * (i*37 + 41)) % 40) / 100);
     shapes += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${i % 2 === 0 ? c1 : c2}" opacity="${opacity}"/>`;
  }
  return `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}"><rect width="${SIZE}" height="${SIZE}" fill="${bg}"/>${shapes}<rect x="6" y="6" width="${SIZE - 12}" height="${SIZE - 12}" rx="14" fill="none" stroke="${c1}" stroke-opacity="0.3" stroke-width="2"/></svg>`)}`;
}


// ============================================================================
// 3. CLASSIC PIXEL-ART STYLE
// ============================================================================

export const CLASSIC_PALETTES = [
  ['#e0f2fe', '#0284c7', '#7dd3fc'], ['#fce7f3', '#db2777', '#f9a8d4'],
  ['#dcfce7', '#16a34a', '#86efac'], ['#fef3c7', '#d97706', '#fcd34d'],
  ['#f3e8ff', '#9333ea', '#d8b4fe'], ['#fee2e2', '#dc2626', '#fca5a5'],
];

export function generatePixelAvatarClassic(seed) {
  const h = hashSeed(seed);
  const palette = CLASSIC_PALETTES[h % CLASSIC_PALETTES.length];
  const [bg, fg, fgLight] = palette;
  const CX = 6, CY = 6, PX = 8;
  const bits = [];
  for (let i = 0; i < CX * CY; i++) bits.push(((h * (i * 13 + 3)) & 0xFF) > 128);
  let rects = '';
  for (let y = 0; y < CY; y++) {
    for (let x = 0; x < CX; x++) {
      if (!bits[y * CX + x]) continue;
      const fill = ((x + y) % 3 === 0) ? fgLight : fg;
      rects += `<rect x="${x * PX}" y="${y * PX}" width="${PX}" height="${PX}" fill="${fill}" rx="1"/><rect x="${96 - (x + 1) * PX}" y="${y * PX}" width="${PX}" height="${PX}" fill="${fill}" rx="1"/><rect x="${x * PX}" y="${96 - (y + 1) * PX}" width="${PX}" height="${PX}" fill="${fill}" rx="1"/><rect x="${96 - (x + 1) * PX}" y="${96 - (y + 1) * PX}" width="${PX}" height="${PX}" fill="${fill}" rx="1"/>`;
    }
  }
  return `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="${bg}" rx="8"/>${rects}</svg>`)}`;
}

export function generateProfileBannerClassic(seed, tintSeed) {
  const h = hashSeed(seed);
  const paletteHash = tintSeed ? hashSeed(tintSeed) : h;
  const palette = CLASSIC_PALETTES[paletteHash % CLASSIC_PALETTES.length];
  const [bg, fg, fgLight] = palette;
  const W = 1056, H = 160, PX = 8, CX = 12, CY = 8;
  const bits = [];
  for (let y = 0; y < CY; y++) {
    for (let x = 0; x < CX; x++) {
      const dist = Math.sqrt(x * x + y * y) / Math.sqrt(CX * CX + CY * CY);
      bits.push(((h * (y * 7 + x * 13 + 3)) & 0xFF) > (dist * 200));
    }
  }
  let rects = '';
  const drawCorner = (ox, oy, flipX, flipY) => {
    for (let y = 0; y < CY; y++) {
      for (let x = 0; x < CX; x++) {
        if (!bits[y * CX + x]) continue;
        const px = flipX ? ox - (x + 1) * PX : ox + x * PX;
        const py = flipY ? oy - (y + 1) * PX : oy + y * PX;
        rects += `<rect x="${px}" y="${py}" width="${PX}" height="${PX}" fill="${((x + y) % 3 === 0) ? fgLight : fg}" rx="1"/>`;
      }
    }
  };
  drawCorner(0, 0, false, false); drawCorner(W, 0, true, false); drawCorner(0, H, false, true); drawCorner(W, H, true, true);
  let bgPixels = '';
  for (let y = 0; y < Math.floor(H / PX); y += 2) {
    for (let x = 0; x < Math.floor(W / PX); x += 3) {
      const v = (h * (y * 53 + x * 37 + 19)) & 0xFF;
      if (v > 225) bgPixels += `<rect x="${x * PX}" y="${y * PX}" width="${PX}" height="${PX}" fill="${v > 242 ? fgLight : fg}" opacity="${v > 242 ? '0.10' : '0.06'}" rx="1"/>`;
    }
  }
  return `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><rect width="${W}" height="${H}" fill="${bg}"/>${bgPixels}${rects}</svg>`)}`;
}

export function generateBlogBannerClassic(seed) {
  const h = hashSeed(seed);
  const palette = CLASSIC_PALETTES[h % CLASSIC_PALETTES.length];
  const [bg, fg, fgLight] = palette;
  const W = 720, H = 240, PX = 8, CX = 15, CY = 15;
  const bits = [];
  for (let y = 0; y < CY; y++) {
    for (let x = 0; x < CX; x++) {
      const dist = Math.sqrt(x * x + y * y) / Math.sqrt(CX * CX + CY * CY);
      bits.push(((h * (y * 7 + x * 13 + 3)) & 0xFF) > (dist * 200));
    }
  }
  let rects = '';
  const drawCorner = (ox, oy, flipX, flipY) => {
    for (let y = 0; y < CY; y++) {
      for (let x = 0; x < CX; x++) {
        if (!bits[y * CX + x]) continue;
        const px = flipX ? ox - (x + 1) * PX : ox + x * PX;
        const py = flipY ? oy - (y + 1) * PX : oy + y * PX;
        rects += `<rect x="${px}" y="${py}" width="${PX}" height="${PX}" fill="${((x + y) % 3 === 0) ? fgLight : fg}" rx="1"/>`;
      }
    }
  };
  drawCorner(0, 0, false, false); drawCorner(W, 0, true, false); drawCorner(0, H, false, true); drawCorner(W, H, true, true);
  return `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${bg}"/>${rects}</svg>`)}`;
}

export function generateBlogThumbnailClassic(seed) {
  const h = hashSeed(seed);
  const palette = CLASSIC_PALETTES[h % CLASSIC_PALETTES.length];
  const [bg, fg, fgLight] = palette;
  const SIZE = 240, PX = 8, CX = 8, CY = 8;
  const bits = [];
  for (let i = 0; i < CX * CY; i++) bits.push(((h * (i * 13 + 3)) & 0xFF) > 128);
  let rects = '';
  for (let y = 0; y < CY; y++) {
    for (let x = 0; x < CX; x++) {
      if (!bits[y * CX + x]) continue;
      const fill = ((x + y) % 3 === 0) ? fgLight : fg;
      rects += `<rect x="${x * PX}" y="${y * PX}" width="${PX}" height="${PX}" fill="${fill}" rx="1"/><rect x="${SIZE - (x + 1) * PX}" y="${y * PX}" width="${PX}" height="${PX}" fill="${fill}" rx="1"/><rect x="${x * PX}" y="${SIZE - (y + 1) * PX}" width="${PX}" height="${PX}" fill="${fill}" rx="1"/><rect x="${SIZE - (x + 1) * PX}" y="${SIZE - (y + 1) * PX}" width="${PX}" height="${PX}" fill="${fill}" rx="1"/>`;
    }
  }
  return `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}"><rect width="${SIZE}" height="${SIZE}" fill="${bg}" rx="12"/>${rects}</svg>`)}`;
}
