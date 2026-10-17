import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/db';

export const runtime = 'edge';

export async function GET() {
  return NextResponse.json({
    client_id: getEnv().ELIXPO_LIXRL_CLI_CLIENT_ID,
    accounts_origin: 'https://accounts.elixpo.com',
    audience: 'lixrl.com',
  }, {
    headers: {
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
}
