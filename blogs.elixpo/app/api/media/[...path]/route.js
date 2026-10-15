export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getCloudinaryUrl } from '../../../../lib/cloudinary';

// Serve a stored media reference (Cloudinary public_id) by redirecting to its
// CDN delivery URL. Profile banners/avatars are stored as `*_r2_key` public_ids
// and referenced as /api/media/<public_id> — this route resolves them.
//
// The public_id contains slashes (e.g. lixblogs/users/<id>/banner), captured by
// the catch-all [...path] segment.
export async function GET(request, { params }) {
  const { path } = await params;
  const publicId = Array.isArray(path) ? path.join('/') : path;
  if (!publicId) {
    return NextResponse.json({ error: 'Missing media id' }, { status: 400 });
  }

  // Only stored public_ids are valid here. A full URL in the path is rejected
  // instead of passed through, so this endpoint can never bounce to an
  // external origin.
  if (/^https?:\/\//i.test(publicId)) {
    return NextResponse.json({ error: 'Invalid media id' }, { status: 400 });
  }

  const version = new URL(request.url).searchParams.get('v');
  const url = getCloudinaryUrl(publicId) + (version ? `?v=${encodeURIComponent(version)}` : '');
  return NextResponse.redirect(url, {
    status: 302,
    headers: {
      'Cache-Control': version
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600, s-maxage=86400',
    },
  });
}
