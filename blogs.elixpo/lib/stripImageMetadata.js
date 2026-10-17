// Strip identifying metadata (EXIF/GPS, XMP, IPTC, comments) out of an image.
//
// WHY THIS EXISTS
// Secret (anonymous) posts are only as anonymous as the files attached to them. A
// phone photo carries GPS coordinates, a capture timestamp and often a device serial
// in its EXIF block — publishing one under an anonymous post would hand over the
// author's location regardless of how carefully we strip their byline everywhere else.
//
// `src/utils/compressImage.js` already drops metadata as a side effect of its canvas
// re-encode, but that is CLIENT-side and incidental. This is the server-side backstop:
// anything reaching /api/media/upload by another route — a direct API call, a future
// upload path that skips the canvas — is scrubbed here before it is stored. Cloudinary
// keeps the original asset intact, so once bytes leave this Worker they are permanent.
//
// We deliberately scrub EVERY upload rather than only those on a secret post: at
// upload time the post is usually still a draft and its secret flag can flip later,
// so "scrub only secret uploads" would miss precisely the images that matter.
//
// Pure byte surgery over ArrayBuffers — no native deps, runs in the edge runtime.
// Unknown/unhandled formats are returned untouched rather than mangled.

export function stripImageMetadata(buf) {
  try {
    const b = new Uint8Array(buf);
    if (isJpeg(b)) return stripJpeg(b);
    if (isPng(b)) return stripPng(b);
    if (isWebp(b)) return stripWebp(b);
    return buf;
  } catch {
    // Never let a malformed file break an upload — worst case we store it as-is.
    return buf;
  }
}

// ── JPEG ────────────────────────────────────────────────────────────────────
// Structure: SOI, then marker segments (0xFF, marker, 2-byte length, payload),
// until SOS (0xFFDA) after which the entropy-coded scan data runs to EOI.
// We drop APPn (EXIF/XMP/IPTC/Photoshop live here) and COM comments, but keep
// APP0/JFIF and APP2/ICC — a colour profile is rendering data, not identity, and
// dropping it visibly shifts colours.
function isJpeg(b) {
  return b.length > 3 && b[0] === 0xff && b[1] === 0xd8;
}

function stripJpeg(b) {
  const parts = [b.subarray(0, 2)]; // SOI
  let i = 2;
  while (i + 1 < b.length) {
    if (b[i] !== 0xff) break; // desynced — bail out and keep the remainder verbatim
    const marker = b[i + 1];

    // Standalone markers carry no length payload.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(b.subarray(i, i + 2));
      i += 2;
      continue;
    }
    // Start of scan: everything from here on is compressed image data.
    if (marker === 0xda) break;

    if (i + 3 >= b.length) break;
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > b.length) break;

    const isApp = marker >= 0xe0 && marker <= 0xef;
    const keepApp = marker === 0xe0 || marker === 0xe2; // JFIF, ICC
    const isComment = marker === 0xfe;
    if (!((isApp && !keepApp) || isComment)) parts.push(b.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  if (i < b.length) parts.push(b.subarray(i));
  return concat(parts);
}

// ── PNG ─────────────────────────────────────────────────────────────────────
// Signature, then chunks: length(4) type(4) data crc(4). Only ancillary chunks
// carry metadata; critical and rendering chunks are preserved untouched.
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_STRIP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

function isPng(b) {
  return b.length > 8 && PNG_SIG.every((v, i) => b[i] === v);
}

function stripPng(b) {
  const parts = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const len = readU32BE(b, i);
    const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    const total = 12 + len; // length + type + data + crc
    if (total < 12 || i + total > b.length) break;
    if (!PNG_STRIP.has(type)) parts.push(b.subarray(i, i + total));
    i += total;
    if (type === 'IEND') break;
  }
  return concat(parts);
}

// ── WebP ────────────────────────────────────────────────────────────────────
// RIFF container: "RIFF" size(4) "WEBP", then chunks: fourcc(4) size(4) payload,
// each padded to an even length. EXIF and XMP live in their own chunks.
function isWebp(b) {
  return (
    b.length > 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  );
}

function stripWebp(b) {
  const chunks = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const fourcc = String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
    const size = readU32LE(b, i + 4);
    const padded = size + (size % 2); // chunks are padded to an even byte count
    const end = i + 8 + padded;
    if (end > b.length) break;

    if (fourcc !== 'EXIF' && fourcc !== 'XMP ') {
      const chunk = b.subarray(i, end).slice(); // copy: VP8X may need mutating
      // VP8X advertises which optional chunks follow. Leaving the EXIF/XMP bits set
      // after removing those chunks makes the file self-contradictory, so clear them.
      // Flags byte layout: ICC 0x20, Alpha 0x10, EXIF 0x08, XMP 0x04, Anim 0x02.
      if (fourcc === 'VP8X' && chunk.length > 8) chunk[8] &= ~0x0c;
      chunks.push(chunk);
    }
    i = end;
  }

  let payload = 0;
  for (const c of chunks) payload += c.length;
  const out = new Uint8Array(12 + payload);
  out.set(b.subarray(0, 12), 0);
  writeU32LE(out, 4, 4 + payload); // RIFF size covers "WEBP" + all chunks
  let o = 12;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out.buffer;
}

// ── helpers ─────────────────────────────────────────────────────────────────
function readU32BE(b, i) {
  return ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
}
function readU32LE(b, i) {
  return (b[i] + (b[i + 1] << 8) + (b[i + 2] << 16) + ((b[i + 3] << 24) >>> 0)) >>> 0;
}
function writeU32LE(b, i, v) {
  b[i] = v & 0xff;
  b[i + 1] = (v >>> 8) & 0xff;
  b[i + 2] = (v >>> 16) & 0xff;
  b[i + 3] = (v >>> 24) & 0xff;
}
function concat(parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out.buffer;
}
