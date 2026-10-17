import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { requireConfirmation } from '../../cli/contract.js';
import { BlogApiError } from '../../api/BlogClient.js';

function dimensions(options) {
  const value = (key) => options[key] === undefined ? undefined : Number.parseInt(options[key], 10);
  return { width: value('width'), height: value('height'), seed: value('seed') };
}

const MIME_BY_EXTENSION = Object.freeze({
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
});

export async function attachMediaToBlog({ blogClient, blogId, media, type, caption }) {
  if (!blogId) return null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const blog = await blogClient.get(blogId);
    const input = type === 'cover' ? { coverUrl: media.url } : {
      content: [...(blog.content || []), {
        id: randomUUID(), type: 'image',
        props: { url: media.url, caption: caption || '', _mediaId: media.id || '' },
        content: [], children: [],
      }],
    };
    try {
      return await blogClient.update(blogId, input, { etag: blog.etag });
    } catch (error) {
      const retryableConflict = error instanceof BlogApiError && error.code === 'revision_conflict';
      if (!retryableConflict || attempt === 2) throw error;
    }
  }
  return null;
}

export async function mediaGenerate({ mediaClient, blogClient, options }) {
  const prompt = options.prompt?.trim();
  if (!prompt) throw new Error('--prompt is required.');
  const type = options.type || 'inline';
  if (!['inline', 'cover'].includes(type)) throw new Error('--type must be inline or cover.');
  let reference;
  if (options.reference) {
    const referencePath = path.resolve(options.reference);
    const extension = path.extname(referencePath).toLowerCase();
    const mimeType = MIME_BY_EXTENSION[extension];
    if (!mimeType) throw new Error('Unsupported reference image type. Use AVIF, BMP, JPEG, PNG, SVG, or WebP.');
    reference = { bytes: await fs.readFile(referencePath), mimeType, name: path.basename(referencePath) };
  }
  const generated = await mediaClient.generate({ prompt, model: options.model || 'flux', destination: type, reference, ...dimensions(options) });
  const extension = generated.mimeType.includes('png') ? 'png' : generated.mimeType.includes('webp') ? 'webp' : 'jpg';
  const output = path.resolve(options.output || `lixblogs-${generated.generationId}.${extension}`);
  await fs.writeFile(output, generated.bytes, { mode: 0o600 });
  let media = null;
  let blog = null;
  if (options.blog) {
    media = await mediaClient.upload({ bytes: generated.bytes, mimeType: generated.mimeType, blogId: options.blog, mediaType: type, uploadId: generated.generationId });
    if (options.attach) blog = await attachMediaToBlog({ blogClient, blogId: options.blog, media, type, caption: options.caption });
  }
  return { generationId: generated.generationId, output, mimeType: generated.mimeType, media, blog };
}

export async function mediaUpload({ mediaClient, blogClient, options }) {
  if (!options.file) throw new Error('--file is required.');
  if (!options.blog) throw new Error('--blog is required.');
  const type = options.type || 'inline';
  const filename = path.resolve(options.file);
  const bytes = await fs.readFile(filename);
  const extension = path.extname(filename).toLowerCase();
  const mimeType = MIME_BY_EXTENSION[extension];
  if (!mimeType) throw new Error('Unsupported image type. Use AVIF, BMP, JPEG, PNG, SVG, or WebP.');
  const media = await mediaClient.upload({ bytes, mimeType, blogId: options.blog, mediaType: type, uploadId: options['upload-id'] || randomUUID() });
  const blog = options.attach ? await attachMediaToBlog({ blogClient, blogId: options.blog, media, type, caption: options.caption }) : null;
  return { media, blog };
}

export async function mediaDelete({ mediaClient, id, options }) {
  if (!id) throw new Error('A media ID is required.');
  requireConfirmation(options, 'Deleting this media asset from its storage provider');
  const response = await mediaClient.delete(id);
  return response?.data || response;
}
