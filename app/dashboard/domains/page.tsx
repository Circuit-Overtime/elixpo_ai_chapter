import { getCurrentUser } from '@/lib/auth';
import { getDB } from '@/lib/db';
import { publicSubdomain } from '@/lib/subdomain-control';
import { subdomainEntitlement } from '@/lib/subdomains';
import type { SubdomainRecord } from '@/lib/types';
import DomainsClient, { type DomainLinkView } from './DomainsClient';

export const runtime = 'edge';

export default async function DomainsPage() {
  const user = (await getCurrentUser())!;
  const db = getDB();
  const [{ results: domains }, { results: urls }, { results: links }] = await Promise.all([
    db.prepare(
      `SELECT * FROM subdomains WHERE user_id = ? AND status != 'removed'
       ORDER BY is_default DESC, created_at ASC`,
    ).bind(user.id).all<SubdomainRecord>(),
    db.prepare('SELECT short_code, title, original_url FROM urls WHERE user_id = ? ORDER BY created_at DESC LIMIT 250')
      .bind(user.id).all<{ short_code: string; title: string | null; original_url: string }>(),
    db.prepare(
      `SELECT dl.subdomain_id, dl.short_code, u.short_code AS fallback_code,
              u.title, u.original_url
       FROM subdomain_links dl
       JOIN subdomains s ON s.id = dl.subdomain_id
       JOIN urls u ON u.id = dl.url_id
       WHERE s.user_id = ? AND s.status != 'removed'
       ORDER BY dl.created_at DESC`,
    ).bind(user.id).all<DomainLinkView>(),
  ]);

  return (
    <DomainsClient
      tier={user.tier}
      allowance={subdomainEntitlement(user.tier)}
      domains={(domains || []).map(publicSubdomain)}
      urls={urls || []}
      links={links || []}
    />
  );
}
