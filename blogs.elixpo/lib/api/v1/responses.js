import { NextResponse } from 'next/server';

export function requestContext() {
  return { requestId: crypto.randomUUID() };
}

function baseHeaders(context, headers = {}) {
  return {
    'Cache-Control': 'no-store',
    'X-LixBlogs-API-Version': '1',
    'X-Request-ID': context.requestId,
    ...headers,
  };
}

export function apiSuccess(context, data, { status = 200, meta, headers } = {}) {
  return NextResponse.json(
    { data, ...(meta ? { meta } : {}) },
    { status, headers: baseHeaders(context, headers) },
  );
}

export function apiError(context, code, message, status, { details, headers } = {}) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        requestId: context.requestId,
        ...(details ? { details } : {}),
      },
    },
    { status, headers: baseHeaders(context, headers) },
  );
}

export function authErrorResponse(context, error) {
  const status = Number.isInteger(error?.status) ? error.status : 401;
  const headers = status === 401
    ? { 'WWW-Authenticate': `Bearer realm="lixblogs", error="${error?.code || 'invalid_token'}"` }
    : undefined;
  return apiError(
    context,
    error?.code || 'invalid_token',
    error?.message || 'Authentication failed.',
    status,
    { headers },
  );
}
