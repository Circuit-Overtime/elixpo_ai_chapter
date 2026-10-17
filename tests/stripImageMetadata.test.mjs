// Tests for lib/stripImageMetadata.js — the server-side EXIF/metadata scrub that
// secret (anonymous) posts depend on. A phone photo carries GPS coordinates; if this
// regresses, an anonymous author's location ships with their post.
//
// Run: npm test
//
// Fixtures are built byte-by-byte rather than shelled out to ImageMagick, so the
// suite is self-contained and the exact metadata under test is unambiguous.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripImageMetadata } from '../lib/stripImageMetadata.js';

const TRACER = 'GPS_34.0522_-118.2437_SECRETPHONE';
const buf = (ab) => Buffer.from(new Uint8Array(ab));
const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

// ── fixture builders ────────────────────────────────────────────────────────
const u16be = (n) => Buffer.from([(n >> 8) & 0xff, n & 0xff]);

function jpegSegment(marker, payload) {
  return Buffer.concat([Buffer.from([0xff, marker]), u16be(payload.length + 2), payload]);
}

/** Minimal but structurally valid JPEG: SOI, segments, SOS + scan data, EOI. */
function makeJpeg({ withMetadata }) {
  const parts = [Buffer.from([0xff, 0xd8])]; // SOI
  parts.push(jpegSegment(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'binary'))); // APP0
  if (withMetadata) {
    parts.push(jpegSegment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'binary'), Buffer.from(TRACER)]))); // EXIF
    parts.push(jpegSegment(0xed, Buffer.from('Photoshop 3.0\0' + TRACER))); // APP13 / IPTC
    parts.push(jpegSegment(0xfe, Buffer.from('COMMENT ' + TRACER))); // COM
  }
  parts.push(jpegSegment(0xe2, Buffer.from('ICC_PROFILE\0fake-colour-data'))); // APP2 — must survive
  parts.push(jpegSegment(0xdb, Buffer.alloc(65))); // DQT — must survive
  parts.push(Buffer.from([0xff, 0xda]), Buffer.from([0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00])); // SOS
  parts.push(Buffer.from([0x12, 0x34, 0x56, 0x78])); // entropy-coded data
  parts.push(Buffer.from([0xff, 0xd9])); // EOI
  return Buffer.concat(parts);
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type), data, Buffer.alloc(4) /* crc placeholder */]);
}

function makePng({ withMetadata }) {
  const parts = [PNG_SIG, pngChunk('IHDR', Buffer.alloc(13))];
  if (withMetadata) {
    parts.push(pngChunk('eXIf', Buffer.from(TRACER)));
    parts.push(pngChunk('tEXt', Buffer.from('Comment\0' + TRACER)));
    parts.push(pngChunk('tIME', Buffer.alloc(7)));
  }
  parts.push(pngChunk('gAMA', Buffer.alloc(4))); // rendering — must survive
  parts.push(pngChunk('IDAT', Buffer.from([0x78, 0x9c, 0x63, 0x00, 0x00])));
  parts.push(pngChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

function webpChunk(fourcc, data) {
  const size = Buffer.alloc(4);
  size.writeUInt32LE(data.length);
  const pad = data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0);
  return Buffer.concat([Buffer.from(fourcc), size, data, pad]);
}

function makeWebp({ withMetadata }) {
  // VP8X flags byte: EXIF (0x08) + XMP (0x04) advertised when metadata is present.
  const vp8xPayload = Buffer.alloc(10);
  if (withMetadata) vp8xPayload[0] = 0x0c;
  const chunks = [webpChunk('VP8X', vp8xPayload), webpChunk('VP8 ', Buffer.from([1, 2, 3, 4]))];
  if (withMetadata) {
    chunks.push(webpChunk('EXIF', Buffer.from(TRACER)));
    chunks.push(webpChunk('XMP ', Buffer.from('<x>' + TRACER + '</x>')));
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(4 + body.length, 4);
  header.write('WEBP', 8, 'ascii');
  return Buffer.concat([header, body]);
}

function pngChunkTypes(b) {
  let i = 8;
  const types = [];
  while (i + 12 <= b.length) {
    const len = b.readUInt32BE(i);
    const t = b.toString('ascii', i + 4, i + 8);
    types.push(t);
    i += 12 + len;
    if (t === 'IEND') break;
  }
  return types;
}

function webpChunkTypes(b) {
  let i = 12;
  const types = [];
  while (i + 8 <= b.length) {
    const f = b.toString('ascii', i, i + 4);
    const size = b.readUInt32LE(i + 4);
    types.push(f);
    i += 8 + size + (size % 2);
  }
  return types;
}

// ── JPEG ────────────────────────────────────────────────────────────────────
test('jpeg: removes EXIF/GPS, IPTC and comments', () => {
  const dirty = makeJpeg({ withMetadata: true });
  assert.ok(dirty.includes(TRACER), 'fixture should contain the tracer');

  const out = buf(stripImageMetadata(ab(dirty)));
  assert.ok(!out.includes(TRACER), 'GPS tracer must not survive');
  assert.ok(!out.includes('Exif\0\0'), 'EXIF header must not survive');
  assert.ok(!out.includes('Photoshop 3.0'), 'IPTC block must not survive');
});

test('jpeg: keeps JFIF, ICC profile and image data', () => {
  const out = buf(stripImageMetadata(ab(makeJpeg({ withMetadata: true }))));
  assert.ok(out.includes('JFIF'), 'JFIF must survive');
  assert.ok(out.includes('ICC_PROFILE'), 'ICC profile must survive — dropping it shifts colours');
  assert.deepEqual([...out.subarray(0, 2)], [0xff, 0xd8], 'must still start with SOI');
  assert.deepEqual([...out.subarray(-2)], [0xff, 0xd9], 'must still end with EOI');
  assert.ok(out.includes(Buffer.from([0x12, 0x34, 0x56, 0x78])), 'scan data must survive');
});

test('jpeg: a clean file is returned byte-identical', () => {
  const clean = makeJpeg({ withMetadata: false });
  const out = buf(stripImageMetadata(ab(clean)));
  assert.ok(out.equals(clean));
});

// ── PNG ─────────────────────────────────────────────────────────────────────
test('png: removes eXIf/tEXt/tIME, keeps critical and rendering chunks', () => {
  const dirty = makePng({ withMetadata: true });
  assert.ok(dirty.includes(TRACER));

  const out = buf(stripImageMetadata(ab(dirty)));
  assert.ok(!out.includes(TRACER), 'GPS tracer must not survive');

  const types = pngChunkTypes(out);
  for (const meta of ['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']) {
    assert.ok(!types.includes(meta), `${meta} must be stripped`);
  }
  for (const keep of ['IHDR', 'gAMA', 'IDAT', 'IEND']) {
    assert.ok(types.includes(keep), `${keep} must survive`);
  }
});

test('png: a clean file is returned byte-identical', () => {
  const clean = makePng({ withMetadata: false });
  const out = buf(stripImageMetadata(ab(clean)));
  assert.ok(out.equals(clean));
});

// ── WebP ────────────────────────────────────────────────────────────────────
test('webp: removes EXIF/XMP chunks and fixes the RIFF size', () => {
  const dirty = makeWebp({ withMetadata: true });
  assert.ok(dirty.includes(TRACER));

  const out = buf(stripImageMetadata(ab(dirty)));
  assert.ok(!out.includes(TRACER), 'GPS tracer must not survive');

  const types = webpChunkTypes(out);
  assert.ok(!types.includes('EXIF'), 'EXIF chunk must be stripped');
  assert.ok(!types.includes('XMP '), 'XMP chunk must be stripped');
  assert.ok(types.includes('VP8 '), 'image data must survive');
  assert.equal(out.readUInt32LE(4), out.length - 8, 'RIFF size header must be rewritten');
});

test('webp: clears the VP8X EXIF/XMP flag bits after removing those chunks', () => {
  const out = buf(stripImageMetadata(ab(makeWebp({ withMetadata: true }))));
  // VP8X payload starts 8 bytes into the first chunk, which starts at offset 12.
  const flags = out[12 + 8];
  assert.equal(flags & 0x08, 0, 'EXIF flag must be cleared, or the file advertises a chunk that is gone');
  assert.equal(flags & 0x04, 0, 'XMP flag must be cleared');
});

// ── robustness ──────────────────────────────────────────────────────────────
test('unknown formats and junk pass through untouched', () => {
  const junk = Buffer.from('not an image at all');
  assert.ok(buf(stripImageMetadata(ab(junk))).equals(junk));
});

test('truncated files do not throw', () => {
  for (const fixture of [makeJpeg({ withMetadata: true }), makePng({ withMetadata: true }), makeWebp({ withMetadata: true })]) {
    const cut = fixture.subarray(0, Math.floor(fixture.length / 2));
    assert.doesNotThrow(() => stripImageMetadata(ab(cut)));
  }
});
