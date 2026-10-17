export function buildOAuthAuthorizeUrl({ origin, state, config }) {
  if (!config?.clientId) throw new Error('oauth_not_configured');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: `${origin}/api/auth/callback`,
    state,
    scope: config.scope,
  });
  return `${config.authorizeUrl}?${params}`;
}
