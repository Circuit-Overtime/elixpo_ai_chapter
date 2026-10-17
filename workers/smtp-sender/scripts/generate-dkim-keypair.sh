#!/usr/bin/env bash
#
# generate-dkim-keypair.sh — mint a DKIM-2048 keypair for mail.elixpo.
#
# Usage:
#   bash workers/smtp-sender/scripts/generate-dkim-keypair.sh elixpo1 mails.elixpo.com
#
#   $1 = selector  (e.g. "elixpo1"; rotate to "elixpo2" later)
#   $2 = domain    (e.g. "mails.elixpo.com")
#
# Outputs:
#   workers/smtp-sender/keys/<selector>.key.pem      — PRIVATE, .gitignore
#   workers/smtp-sender/keys/<selector>.dns.txt      — DNS TXT to publish
#
# After running:
#   1. Publish the DNS record (see <selector>.dns.txt) on the domain's
#      Cloudflare DNS zone. Wait ~5 min for propagation.
#   2. Upload the private key as Worker secrets:
#        npx wrangler secret put DKIM_PRIVATE_KEY  --name=smtp-sender
#        npx wrangler secret put DKIM_DOMAIN       --name=smtp-sender
#        npx wrangler secret put DKIM_SELECTOR     --name=smtp-sender
#      (Paste the contents of <selector>.key.pem when wrangler prompts.)
#   3. Redeploy the worker. Subsequent sends are DKIM-signed.
#
# Verifying after rollout (run from any machine with dig):
#   dig +short TXT <selector>._domainkey.<domain>
#   → should show: "v=DKIM1; k=rsa; p=<base64 public key>"
#
# Headers on a received mail should now include
#   DKIM-Signature: v=1; a=rsa-sha256; ... d=<domain>; s=<selector>; b=...
#   Authentication-Results: ...; dkim=pass header.d=<domain>; ...

set -euo pipefail

SELECTOR="${1:?selector required, e.g. elixpo1}"
DOMAIN="${2:?domain required, e.g. mails.elixpo.com}"

# Path layout — keys live next to the worker source, ignored by git.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEYDIR="$HERE/keys"
mkdir -p "$KEYDIR"
KEY="$KEYDIR/${SELECTOR}.key.pem"
PUB="$KEYDIR/${SELECTOR}.pub.pem"
DNS="$KEYDIR/${SELECTOR}.dns.txt"

if [[ -e "$KEY" ]]; then
  echo "✗ $KEY already exists — refusing to overwrite. Pick a new selector." >&2
  exit 1
fi

echo "→ Generating RSA-2048 keypair..."
openssl genpkey -algorithm RSA -out "$KEY" -pkeyopt rsa_keygen_bits:2048 2>/dev/null
openssl rsa -in "$KEY" -pubout -out "$PUB" 2>/dev/null

# Extract just the base64 body of the public key for the DNS TXT record.
PUB_B64=$(openssl pkey -in "$KEY" -pubout -outform DER 2>/dev/null | base64 -w 0)

# DNS TXT records are limited to 255 chars per string — long DKIM keys
# need to be split into multiple quoted strings concatenated by the
# resolver. Cloudflare's DNS UI handles this automatically when you paste
# the full string; we emit both forms below for clarity.
{
  echo "# Publish this TXT record on your domain's DNS zone:"
  echo "#"
  echo "# Name:  ${SELECTOR}._domainkey.${DOMAIN}"
  echo "# Type:  TXT"
  echo "# TTL:   3600 (1 hour)"
  echo "# Value:"
  echo ""
  echo "v=DKIM1; k=rsa; p=${PUB_B64}"
  echo ""
  echo "# Cloudflare DNS UI: paste the value above as-is into the Content"
  echo "# field. The dashboard handles the 255-char split automatically."
} > "$DNS"

# Permissions: private key must NOT be world-readable.
chmod 600 "$KEY"

echo ""
echo "✓ Done."
echo ""
echo "  Private key:  $KEY  (chmod 600)"
echo "  Public key:   $PUB"
echo "  DNS record:   $DNS"
echo ""
echo "Next steps:"
echo "  1. Publish the TXT record from $DNS on Cloudflare DNS."
echo "  2. Set Worker secrets:"
echo "       cd workers/smtp-sender"
echo "       cat $KEY | npx wrangler secret put DKIM_PRIVATE_KEY"
echo "       echo -n '$DOMAIN' | npx wrangler secret put DKIM_DOMAIN"
echo "       echo -n '$SELECTOR' | npx wrangler secret put DKIM_SELECTOR"
echo "  3. Redeploy: npx wrangler deploy"
