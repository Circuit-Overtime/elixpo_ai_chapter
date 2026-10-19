export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getSession } from '../../../../../lib/auth';
import {
  buildCloudinaryAuthorizationUrl,
  isValidCloudinaryCloudName,
} from '../../../../../lib/cloudinaryOAuth';

export async function GET(request) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.redirect(new URL('/sign-in?next=/settings?tab=integrations', request.url));
  }

  try {
    const state = crypto.randomUUID();
    const requestUrl = new URL(request.url);
    const origin = requestUrl.origin;
    const requestedNext = requestUrl.searchParams.get('next') || '';
    const requestedCloudName = requestUrl.searchParams.get('cloud_name')?.trim() || '';
    if (requestedCloudName && !isValidCloudinaryCloudName(requestedCloudName)) {
      return NextResponse.redirect(new URL('/settings?tab=integrations&cloudinary=invalid_environment', request.url));
    }
    const safeNext = requestedNext.startsWith('/') && !requestedNext.startsWith('//')
      ? requestedNext
      : '/settings?tab=integrations';
    const response = NextResponse.redirect(buildCloudinaryAuthorizationUrl({ origin, state }));
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    };
    response.cookies.set('cloudinary_oauth_state', state, cookieOptions);
    response.cookies.set('cloudinary_oauth_next', safeNext, cookieOptions);
    if (requestedCloudName) {
      response.cookies.set('cloudinary_oauth_cloud_name', requestedCloudName, cookieOptions);
    } else {
      response.cookies.delete('cloudinary_oauth_cloud_name');
    }
    return response;
  } catch (error) {
    console.error('[cloudinary/oauth] Could not start authorization:', error?.message || error);
    return NextResponse.redirect(new URL('/settings?tab=integrations&cloudinary=config_error', request.url));
  }
}
