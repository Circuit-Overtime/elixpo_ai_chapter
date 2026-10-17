import type { SubdomainRecord } from './types';

export type PublicSubdomain = Omit<SubdomainRecord, 'verification_token'>;

export function publicSubdomain(record: SubdomainRecord): PublicSubdomain {
  const { verification_token: _verificationToken, ...safe } = record;
  return safe;
}

export async function bumpSubdomainRevision(
  db: D1Database,
  subdomainId: number,
): Promise<number> {
  const row = await db
    .prepare(
      `UPDATE subdomains
       SET revision = revision + 1, updated_at = datetime('now')
       WHERE id = ? RETURNING revision`,
    )
    .bind(subdomainId)
    .first<{ revision: number }>();
  return row?.revision ?? 1;
}

export async function bumpSubdomainRevisionsForUrl(
  db: D1Database,
  urlId: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE subdomains
       SET revision = revision + 1, updated_at = datetime('now')
       WHERE id IN (SELECT subdomain_id FROM subdomain_links WHERE url_id = ?)`,
    )
    .bind(urlId)
    .run();
}
