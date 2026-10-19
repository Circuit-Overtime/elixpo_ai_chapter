export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { pricingForCountry } from '../../../lib/pricing';

// Returns PPP-adjusted prices for the visitor's country (Cloudflare geo header).
export async function GET(request) {
  let cc = request.headers.get('cf-ipcountry') || '';
  if (!cc) { try { cc = request.cf?.country || ''; } catch {} }
  return NextResponse.json(pricingForCountry(cc), {
    headers: { 'cache-control': 'public, max-age=300' },
  });
}
