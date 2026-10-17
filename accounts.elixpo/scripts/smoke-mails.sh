#!/usr/bin/env bash
# Smoke-test every mails.elixpo template configured in .env.local.
# Each fires ONE email with realistic variables to the test address.
#
# Usage:
#   bash scripts/smoke-mails.sh                  # all 7 templates
#   bash scripts/smoke-mails.sh user_verify_otp  # single template
#
# Requires: curl, openssl. Reads MAILS_SHARED_SECRET + MAILS_HOOK_* from
# .env.local (or the current shell env if already exported).

set -euo pipefail

ENV_FILE=".env.local"
TO="${SMOKE_MAILS_TO:-ayushbhatt633@gmail.com}"

if [[ -f "$ENV_FILE" ]]; then
  # Export every KEY=VALUE line from .env.local without sourcing JWT keys
  # (the multi-line PEMs break naive set -a parsing).
  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" =~ ^# ]] && continue
    [[ "$key" == JWT_* ]] && continue
    export "$key=$value"
  done < "$ENV_FILE"
fi

if [[ -z "${MAILS_SHARED_SECRET:-}" ]]; then
  echo "MAILS_SHARED_SECRET is not set" >&2
  exit 1
fi

fire() {
  local template="$1"
  local hook_var="$2"
  local payload="$3"

  local endpoint="${!hook_var:-}"
  if [[ -z "$endpoint" ]]; then
    echo "✗ $template: $hook_var not set"
    return
  fi

  local t
  t=$(date +%s)
  local signed="${t}.${payload}"
  local v1
  v1=$(printf '%s' "$signed" | openssl dgst -sha256 -hmac "$MAILS_SHARED_SECRET" -hex | awk '{print $NF}')

  local response
  response=$(curl -sS -w "\n__HTTP__%{http_code}" \
    -X POST "https://mails.elixpo.com/v1/hooks/${endpoint}" \
    -H "Content-Type: application/json" \
    -H "X-Elixpo-Signature: t=${t},v1=${v1}" \
    --data-binary "$payload")

  local code="${response##*__HTTP__}"
  local body="${response%__HTTP__*}"

  if [[ "$code" == "200" ]]; then
    echo "✓ $template -> HTTP 200"
  else
    echo "✗ $template -> HTTP $code"
    echo "    $body"
  fi
}

# Each payload uses the exact variables the matching template expects.
PAYLOADS_user_verify_otp=$(cat <<JSON
{"to":"${TO}","variables":{"name":"Ayush","otp_code":"482919","expiry_minutes":10,"verify_link":"https://accounts.elixpo.com/verify?token=smoke"}}
JSON
)
PAYLOADS_password_reset=$(cat <<JSON
{"to":"${TO}","variables":{"name":"Ayush","otp_code":"715240","expiry_minutes":10}}
JSON
)
PAYLOADS_login_otp=$(cat <<JSON
{"to":"${TO}","variables":{"name":"Ayush","otp_code":"841726","expiry_minutes":5,"device":"Chrome on macOS","ip_address":"203.0.113.42"}}
JSON
)
PAYLOADS_mfa_email=$(cat <<JSON
{"to":"${TO}","variables":{"name":"Ayush","otp_code":"395184","expiry_minutes":10,"device":"Chrome on macOS","ip_address":"203.0.113.42"}}
JSON
)
PAYLOADS_oauth_app_register=$(cat <<JSON
{"to":"${TO}","variables":{"name":"Ayush","app_name":"Smoke Test App","client_id_short":"cli_18663415f00aed03bea1","dashboard_url":"https://accounts.elixpo.com/dashboard/oauth-apps/cli_smoke"}}
JSON
)
PAYLOADS_oauth_app_delete=$(cat <<JSON
{"to":"${TO}","variables":{"name":"Ayush","app_name":"Smoke Test App","client_id_short":"cli_18663415f00aed03bea1","dashboard_url":"https://accounts.elixpo.com/dashboard/oauth-apps"}}
JSON
)
PAYLOADS_account_suspended=$(cat <<JSON
{"to":"${TO}","variables":{"name":"Ayush","reason":"Smoke test — automated verification of mails.elixpo wiring.","support_email":"support@elixpo.com"}}
JSON
)
PAYLOADS_sign_in_device=$(cat <<JSON
{"to":"${TO}","variables":{"name":"Ayush","device":"Chrome on macOS","location":"Bengaluru, IN","ip_address":"203.0.113.42","time":"$(date -u +'%a, %d %b %Y %H:%M:%S GMT')","dashboard_url":"https://accounts.elixpo.com/dashboard/profile"}}
JSON
)
PAYLOADS_webhook_fail=$(cat <<JSON
{"to":"${TO}","variables":{"name":"Ayush","app_name":"ElixpoURL","endpoint_url":"https://url.elixpo.com/api/webhooks/elixpo","failure_count":5,"last_status_code":502,"last_error":"connect ETIMEDOUT","manage_url":"https://accounts.elixpo.com/dashboard/oauth-apps/cli_smoke"}}
JSON
)

# Billing templates — variables must match the mails.elixpo template
# declaration. Keep this set in sync with src/lib/mails.ts (MailTemplate
# union) and the templates you've registered on mails.elixpo.
PAYLOADS_billing_subscription_activated=$(cat <<JSON
{"to":"${TO}","variables":{"name":"Ayush","plan_name":"Indie","amount":"1.00","currency":"INR","renews_at":"22 July 2026","manage_url":"https://accounts.elixpo.com/dashboard/subscriptions"}}
JSON
)
PAYLOADS_billing_payment_failed=$(cat <<JSON
{"to":"${TO}","variables":{"name":"Ayush","plan_name":"Indie","update_payment_url":"https://accounts.elixpo.com/dashboard/subscriptions","grace_until":"22 July 2026"}}
JSON
)
PAYLOADS_billing_subscription_cancelled=$(cat <<JSON
{"to":"${TO}","variables":{"name":"Ayush","plan_name":"Indie","access_until":"22 July 2026","restart_url":"https://accounts.elixpo.com/pricing"}}
JSON
)

ALL=(user_verify_otp password_reset login_otp mfa_email oauth_app_register oauth_app_delete account_suspended sign_in_device webhook_fail billing_subscription_activated billing_payment_failed billing_subscription_cancelled)

if [[ $# -gt 0 ]]; then
  TARGETS=("$@")
else
  TARGETS=("${ALL[@]}")
fi

for t in "${TARGETS[@]}"; do
  hook_var="MAILS_HOOK_$(echo "$t" | tr '[:lower:]' '[:upper:]')"
  payload_var="PAYLOADS_${t}"
  # Soft-check: if a caller asks for a template we don't have a payload
  # for, fail with a clear message instead of bash's unbound-variable
  # error (which is opaque under `set -u`).
  if ! declare -p "$payload_var" >/dev/null 2>&1; then
    echo "✗ No PAYLOADS_${t} payload defined in this script." >&2
    echo "  Known: ${ALL[*]}" >&2
    exit 1
  fi
  fire "$t" "$hook_var" "${!payload_var}"
done
