import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import LandingPageClient from './LandingPageClient';

export const runtime = 'edge';

export const metadata: Metadata = {
  title: { absolute: 'Lixrl — URL Shortener & Quick QR Code Generator' },
  description:
    'Shorten a URL in one click, generate a QR code for any link, and unlock branded links, custom QR styles, and analytics when you need them.',
  alternates: { canonical: '/' },
};

/**
 * Landing-page entry point.
 *
 * Server-side auth check before rendering the marketing surface — signed-in
 * users are sent straight to `/dashboard` so they don't have to click
 * through the hero. `?noredirect=1` is the explicit escape hatch used by
 * authenticated navigation when someone chooses to explore the homepage.
 *
 * `getCurrentUser()` is cheap (KV session lookup → D1 fallback) and runs
 * at the edge, so the redirect adds no perceptible latency.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ noredirect?: string | string[] }>;
}) {
  const params = await searchParams;
  const noRedirect = Array.isArray(params.noredirect)
    ? params.noredirect.includes('1')
    : params.noredirect === '1';
  const user = await getCurrentUser();
  if (user && !noRedirect) {
    redirect('/dashboard');
  }
  return <LandingPageClient />;
}
