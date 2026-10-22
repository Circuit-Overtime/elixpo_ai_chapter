export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { getDB } from '../../../../lib/cloudflare';
import {
  PERSONAL_ACCESS_TOKEN_SCOPES,
  MAX_ACTIVE_PERSONAL_ACCESS_TOKENS,
  createPersonalAccessToken,
  serializePersonalAccessToken,
} from '../../../../lib/api/v1/personalAccessTokens';

export async function GET() {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const db = getDB();
    const [tokens, organizations] = await Promise.all([
      db.prepare(`
        SELECT t.*, o.name AS organization_name
        FROM api_personal_access_tokens t
        LEFT JOIN orgs o ON o.id = t.organization_id
        WHERE t.user_id = ?
        ORDER BY t.created_at DESC LIMIT 100
      `).bind(session.userId).all(),
      db.prepare(`
        SELECT o.id, o.name, o.slug
        FROM orgs o LEFT JOIN org_members m ON m.org_id = o.id AND m.user_id = ?
        WHERE o.owner_id = ? OR m.user_id IS NOT NULL
        ORDER BY o.name LIMIT 100
      `).bind(session.userId, session.userId).all(),
    ]);
    return NextResponse.json({
      tokens: (tokens?.results || []).map(serializePersonalAccessToken),
      organizations: organizations?.results || [],
      scopes: PERSONAL_ACCESS_TOKEN_SCOPES,
      maxActiveTokens: MAX_ACTIVE_PERSONAL_ACCESS_TOKENS,
    });
  } catch (error) {
    console.error('[settings/tokens] list failed:', error?.message || error);
    return NextResponse.json({ error: 'API tokens could not be loaded' }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const result = await createPersonalAccessToken(getDB(), session.userId, await request.json());
    return NextResponse.json({ token: result.token, record: result.record }, { status: 201 });
  } catch (error) {
    const messages = {
      invalid_name: 'Give this token a name between 1 and 80 characters.',
      scopes_required: 'Select at least one scope.',
      invalid_scopes: 'One or more selected scopes are not supported.',
      organization_required: 'Select an organization for this token.',
      organization_forbidden: 'You no longer have access to that organization.',
      invalid_expiry: 'Token expiry must be between 1 and 365 days.',
      token_limit: `You can have up to ${MAX_ACTIVE_PERSONAL_ACCESS_TOKENS} active API tokens. Revoke one before creating another.`,
    };
    if (messages[error?.message]) {
      const status = error.message === 'organization_forbidden' ? 403 : error.message === 'token_limit' ? 409 : 400;
      return NextResponse.json({ error: messages[error.message] }, { status });
    }
    console.error('[settings/tokens] create failed:', error?.message || error);
    return NextResponse.json({ error: 'The API token could not be created' }, { status: 500 });
  }
}
