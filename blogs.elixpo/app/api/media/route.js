export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { getCloudinaryUrl } from '../../../lib/cloudinary';
import { kvCache, mediaInventoryCacheKey } from '../../../lib/cache';

const MEDIA_INVENTORY_TTL_SECONDS = 60 * 60;

export async function GET() {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { getDB } = await import('../../../lib/cloudflare');
  const db = getDB();
  const inventory = await kvCache(
    mediaInventoryCacheKey(session.userId),
    MEDIA_INVENTORY_TTL_SECONDS,
    async () => {
      const aggregate = async (join, id, name, scope = '1 = 1') => {
        const { results: rows = [] } = await db.prepare(`
          SELECT ${id} AS id, ${name} AS name, SUM(m.size_bytes) AS bytes, COUNT(*) AS count
          FROM media_uploads m
          JOIN blogs b ON b.id = m.blog_id
          ${join}
          WHERE m.user_id = ? AND ${id} IS NOT NULL AND ${scope}
          GROUP BY ${id}, ${name}
          ORDER BY bytes DESC
          LIMIT 100
        `).bind(session.userId).all();
        return rows;
      };

      const [mediaResult, total, personal, organisations, collections, storageResult] = await Promise.all([
        db.prepare(`
          SELECT m.id, m.size_bytes, m.media_type, m.created_at, m.cloudinary_public_id,
            m.storage_provider, m.storage_cloud_name, m.secure_url,
            b.id AS blog_id, b.title AS blog_title, b.published_as, b.collection_id,
            c.name AS collection_name, o.id AS org_id, o.name AS org_name
          FROM media_uploads m
          LEFT JOIN blogs b ON b.id = m.blog_id
          LEFT JOIN collections c ON c.id = b.collection_id
          LEFT JOIN orgs o ON b.published_as = ('org:' || o.id)
          WHERE m.user_id = ?
          ORDER BY m.created_at DESC
          LIMIT 200
        `).bind(session.userId).all(),
        db.prepare('SELECT COALESCE(SUM(size_bytes), 0) AS bytes, COUNT(*) AS count FROM media_uploads WHERE user_id = ?')
          .bind(session.userId).first(),
        db.prepare(`
          SELECT COALESCE(SUM(m.size_bytes), 0) AS bytes, COUNT(*) AS count
          FROM media_uploads m
          LEFT JOIN blogs b ON b.id = m.blog_id
          WHERE m.user_id = ?
            AND (m.blog_id IS NULL OR (COALESCE(b.published_as, '') NOT LIKE 'org:%' AND b.collection_id IS NULL))
        `).bind(session.userId).first(),
        aggregate("JOIN orgs o ON b.published_as = ('org:' || o.id)", 'o.id', 'o.name'),
        aggregate(
          'JOIN collections c ON c.id = b.collection_id',
          'c.id',
          'c.name',
          "COALESCE(b.published_as, '') NOT LIKE 'org:%'",
        ),
        db.prepare(`
          SELECT storage_provider AS provider, storage_cloud_name AS cloudName,
            COALESCE(SUM(size_bytes), 0) AS bytes, COUNT(*) AS count
          FROM media_uploads WHERE user_id = ?
          GROUP BY storage_provider, storage_cloud_name
          ORDER BY bytes DESC
        `).bind(session.userId).all(),
      ]);

      const items = (mediaResult.results || []).map((item) => ({
        ...item,
        url: item.secure_url || getCloudinaryUrl(item.cloudinary_public_id, '', item.storage_cloud_name),
      }));
      const storageSpaces = storageResult.results || [];
      return {
        totalBytes: Number(total?.bytes || 0),
        count: Number(total?.count || 0),
        personal: {
          bytes: Number(personal?.bytes || 0),
          count: Number(personal?.count || 0),
        },
        organisations,
        collections,
        storageSpaces: storageSpaces.map((space) => ({
          ...space,
          bytes: Number(space.bytes || 0),
          count: Number(space.count || 0),
        })),
        items,
      };
    },
  );

  return NextResponse.json(inventory, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
