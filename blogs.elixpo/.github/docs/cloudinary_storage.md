# Creator-owned Cloudinary storage

LixBlogs keeps its platform Cloudinary environment as the default. A creator can
optionally connect a Cloudinary product environment from **Settings → Integrations**
and choose it for future blog covers and editor images.

## Deployment setup

1. Generate an independent encryption key:

   ```bash
   openssl rand -base64 32
   ```

2. Store it as the Cloudflare Pages secret
   `CLOUDINARY_CONNECTION_ENCRYPTION_KEY`. Do not reuse `SESSION_SECRET` or commit
   the plaintext value. Keep this key stable: rotating it without first
   re-encrypting stored connections makes those connections unreadable.
3. Create the LixBlogs app under Cloudinary **Settings → Developers → OAuth Apps**:
   - Token authentication: **Client secret basic**
   - Redirect URI: `https://blogs.elixpo.com/api/integrations/cloudinary/callback`
   - Post logout URI: `https://blogs.elixpo.com/settings?tab=integrations`
   - Scopes: **Upload**, **Asset Management**, **Offline Access**
4. Store its credentials as `CLOUDINARY_OAUTH_CLIENT_ID` and
   `CLOUDINARY_OAUTH_CLIENT_SECRET` Cloudflare Pages secrets.
5. Apply D1 migrations `0041_cloudinary_connections.sql` and
   `0042_cloudinary_oauth.sql` before deploying code that uses the new columns:

   ```bash
   npm run db:migrate
   ```

Creators connect through Cloudinary's authorization page and select their product
environment. LixBlogs encrypts both tokens with AES-GCM and never receives the
environment's API secret. Access tokens are refreshed shortly before their
five-minute expiry; Cloudinary's replacement refresh token is persisted on every
refresh because refresh tokens are single-use.

## Storage behavior

- Existing media remains in its original Cloudinary environment.
- Changing the preference affects only future blog media.
- Profile and organization identity artwork remains in the LixBlogs-managed
  environment so canonical avatar and banner URLs stay stable.
- Platform quota accounting includes only `platform_cloudinary` media.
- The Media tab labels every asset with its owning storage space.
- A personal connection cannot be removed while tracked media still depends on
  it. Creators can switch future uploads back to LixBlogs without removing it.
- Deletes and account purges use the provider recorded on each media row.

## Authentication compatibility

Connections saved with the earlier API-environment URL flow continue to work and
are marked as `api_secret`. New connections use `oauth`. Reconnecting replaces a
legacy credential only when doing so cannot orphan media in another product
environment.
