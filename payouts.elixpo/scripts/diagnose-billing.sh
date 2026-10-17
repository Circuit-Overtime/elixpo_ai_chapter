#!/usr/bin/env bash
#
# diagnose-billing.sh — end-to-end probe of the autopay webhook chain.
#
# Walks Razorpay → payouts → accounts and reports where (if anywhere)
# the chain breaks. Reads keys from .env.local; doesn't print them.
#
# Usage:
#   bash scripts/diagnose-billing.sh sub_T4hf5bWkNaTArl
#   bash scripts/diagnose-billing.sh        # picks the most-recent sub
#
# Requires: curl + jq.

set -euo pipefail

ENV_FILE="${ENV_FILE:-./.env.local}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "✗ Missing $ENV_FILE. Run this from the payouts.elixpo repo root." >&2
  exit 2
fi

# Quote-strip + load just the keys we need (no `source` — avoids
# accidentally exporting unrelated vars from the file).
read_env() {
  local k="$1"
  local v
  v=$(grep -E "^${k}=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/')
  printf '%s' "$v"
}

MODE=$(read_env RAZORPAY_MODE)
MODE="${MODE:-test}"
M=$(printf '%s' "$MODE" | tr '[:lower:]' '[:upper:]')

KEY_ID=$(read_env "RAZORPAY_${M}_KEY_ID")
[[ -z "$KEY_ID" ]] && KEY_ID=$(read_env "RAZORPAY_KEY_ID")

KEY_SECRET=$(read_env "RAZORPAY_${M}_KEY_SECRET")
[[ -z "$KEY_SECRET" ]] && KEY_SECRET=$(read_env "RAZORPAY_KEY_SECRET")

WEBHOOK_SECRET=$(read_env "RAZORPAY_${M}_WEBHOOK_SECRET")
[[ -z "$WEBHOOK_SECRET" ]] && WEBHOOK_SECRET=$(read_env "RAZORPAY_WEBHOOK_SECRET")

if [[ -z "$KEY_ID" || -z "$KEY_SECRET" ]]; then
  echo "✗ Razorpay $MODE keys not found in $ENV_FILE" >&2
  exit 2
fi

echo "═══════════════════════════════════════════════════════════════════"
echo " Autopay diagnostic — mode: $MODE"
echo "═══════════════════════════════════════════════════════════════════"
echo

# ── Probe 1: Razorpay subscription state ────────────────────────────────
SUB_ID="${1:-}"
if [[ -z "$SUB_ID" ]]; then
  echo "─ Probe 0: latest subscription ──────────────────────────────────"
  SUB_ID=$(curl -s -u "$KEY_ID:$KEY_SECRET" \
    "https://api.razorpay.com/v1/subscriptions?count=1" \
    | jq -r '.items[0].id // empty')
  if [[ -z "$SUB_ID" ]]; then
    echo "  ⚠ No subscriptions on this merchant."
    exit 0
  fi
  echo "  Using most-recent: $SUB_ID"
  echo
fi

echo "─ Probe 1: subscription state (Razorpay GET) ─────────────────────"
SUB_JSON=$(curl -s -u "$KEY_ID:$KEY_SECRET" \
  "https://api.razorpay.com/v1/subscriptions/$SUB_ID")
SUB_STATUS=$(printf '%s' "$SUB_JSON" | jq -r '.status // "unknown"')
SUB_PLAN=$(printf '%s' "$SUB_JSON" | jq -r '.plan_id // "?"')
SUB_CUST=$(printf '%s' "$SUB_JSON" | jq -r '.customer_id // "none"')
SUB_CHARGE_AT=$(printf '%s' "$SUB_JSON" | jq -r '.charge_at // empty')
SUB_PAID=$(printf '%s' "$SUB_JSON" | jq -r '.paid_count // 0')
SUB_NOTES_APP=$(printf '%s' "$SUB_JSON" | jq -r '.notes.app // "?"')
SUB_NOTES_UID=$(printf '%s' "$SUB_JSON" | jq -r '.notes.uid // "?"')

echo "  id           $SUB_ID"
echo "  status       $SUB_STATUS"
echo "  plan_id      $SUB_PLAN"
echo "  customer_id  $SUB_CUST"
echo "  paid_count   $SUB_PAID"
echo "  charge_at    ${SUB_CHARGE_AT:-<null>}"
echo "  notes.app    $SUB_NOTES_APP"
echo "  notes.uid    $SUB_NOTES_UID"

case "$SUB_STATUS" in
  created)
    echo "  ⚠ Mandate not yet collected. Open the short_url to complete."
    ;;
  authenticated|active)
    echo "  ✓ Mandate collected. Razorpay considers this active."
    ;;
  cancelled|completed|expired|halted)
    echo "  ⚠ Subscription is $SUB_STATUS — winding down."
    ;;
esac
echo

# ── Probe 2: Razorpay invoices on this sub ──────────────────────────────
echo "─ Probe 2: invoices on this subscription ─────────────────────────"
INV_JSON=$(curl -s -u "$KEY_ID:$KEY_SECRET" \
  "https://api.razorpay.com/v1/invoices?subscription_id=$SUB_ID&count=5")
INV_COUNT=$(printf '%s' "$INV_JSON" | jq -r '.count // 0')
echo "  total invoices  $INV_COUNT"
printf '%s' "$INV_JSON" | jq -r '.items[]? | "    \(.id) | status=\(.status) | paid=\(.amount_paid // 0) of \(.amount) | created \(.date)"'
if [[ "$INV_COUNT" == "0" && "$SUB_PAID" != "0" ]]; then
  echo "  ⚠ paid_count > 0 but no invoices listed — odd state, check Razorpay support."
fi
echo

# ── Probe 3: webhook deliveries on this account ─────────────────────────
echo "─ Probe 3: webhook deliveries (last 5) ───────────────────────────"
WH_JSON=$(curl -s -u "$KEY_ID:$KEY_SECRET" \
  "https://api.razorpay.com/v1/webhook_deliveries?count=5" || true)
# `webhook_deliveries` is a paid-plan endpoint; soft-fail if 403.
WH_ERR=$(printf '%s' "$WH_JSON" | jq -r '.error.description // empty' 2>/dev/null || true)
if [[ -n "$WH_ERR" ]]; then
  echo "  ⚠ Can't read webhook delivery log via API: $WH_ERR"
  echo "    → check Razorpay Dashboard → Settings → Webhooks → Recent Deliveries manually."
else
  printf '%s' "$WH_JSON" | jq -r '.items[]? | "    \(.created_at) | \(.event) → \(.url) | http=\(.response.http_status_code // "—")"'
fi
echo

# ── Probe 4: payouts.elixpo subscription row ────────────────────────────
echo "─ Probe 4: payouts.elixpo subscription mirror ────────────────────"
PAYOUTS_BASE=$(read_env "PAYOUTS_API_BASE")
PAYOUTS_BASE="${PAYOUTS_BASE:-https://payouts.elixpo.com}"
# We don't have a server-to-server endpoint to introspect subs; use D1.
if command -v npx >/dev/null 2>&1; then
  ROW=$(npx wrangler d1 execute elixpo_pay --remote --json \
    --command="SELECT id, status, billing_mode, current_period_end, provider_subscription_id FROM subscriptions WHERE provider_subscription_id='$SUB_ID' LIMIT 1" 2>/dev/null \
    || true)
  if [[ -n "$ROW" ]]; then
    printf '%s' "$ROW" | jq -r '.[0].results[]? | "  status=\(.status) billing_mode=\(.billing_mode) period_end=\(.current_period_end // "—")"'
    if [[ -z $(printf '%s' "$ROW" | jq -r '.[0].results[]? | .status // empty') ]]; then
      echo "  ⚠ No subscriptions row in payouts D1 for this Razorpay sub."
      echo "    → Razorpay → payouts webhook never landed, or signature failed."
    fi
  else
    echo "  ⚠ wrangler d1 read failed — run manually:"
    echo "    npx wrangler d1 execute elixpo_pay --remote --command=\"SELECT * FROM subscriptions WHERE provider_subscription_id='$SUB_ID'\""
  fi
else
  echo "  ⚠ wrangler not available; skipping D1 read."
fi
echo

# ── Probe 5: payouts → accounts outbound webhook deliveries ─────────────
echo "─ Probe 5: outbound entitlement.updated deliveries from payouts ──"
if command -v npx >/dev/null 2>&1; then
  DELIV=$(npx wrangler d1 execute elixpo_pay --remote --json \
    --command="SELECT wd.id, wd.event_type, wd.status, wd.response_status, wd.last_attempt_at FROM webhook_deliveries wd JOIN subscriptions s ON 1=1 WHERE wd.app_id = (SELECT app_id FROM subscriptions WHERE provider_subscription_id='$SUB_ID' LIMIT 1) AND wd.event_type='entitlement.updated' ORDER BY wd.last_attempt_at DESC LIMIT 5" 2>/dev/null \
    || true)
  if [[ -n "$DELIV" ]]; then
    HAS=$(printf '%s' "$DELIV" | jq -r '.[0].results | length')
    if [[ "$HAS" == "0" ]]; then
      echo "  ⚠ No outbound entitlement.updated deliveries for this app."
      echo "    → fulfillPayment ran (or didn't); webhook endpoint not registered on the app?"
    else
      printf '%s' "$DELIV" | jq -r '.[0].results[]? | "    \(.last_attempt_at) | \(.event_type) | status=\(.status) http=\(.response_status // "—")"'
    fi
  fi
fi
echo

# ── Probe 6: accounts.elixpo user.tier ──────────────────────────────────
echo "─ Probe 6: accounts.elixpo user.tier mirror ──────────────────────"
if [[ "$SUB_NOTES_UID" != "?" ]] && command -v npx >/dev/null 2>&1; then
  # Switch to accounts repo's wrangler context. Hard-coded path is OK
  # for a diagnostic script that lives alongside the workspace.
  ACCOUNTS_DIR="../accounts.elixpo"
  if [[ -d "$ACCOUNTS_DIR" ]]; then
    USER_ROW=$(cd "$ACCOUNTS_DIR" && npx wrangler d1 execute elixpo_accounts --remote --json \
      --command="SELECT id, email, tier, tier_renews_at, tier_provider_subscription_id FROM users WHERE id='$SUB_NOTES_UID' LIMIT 1" 2>/dev/null \
      || true)
    if [[ -n "$USER_ROW" ]]; then
      printf '%s' "$USER_ROW" | jq -r '.[0].results[]? | "  email=\(.email) tier=\(.tier) renews_at=\(.tier_renews_at // "—") provider_sub=\(.tier_provider_subscription_id // "—")"'
      MIRRORED_SUB=$(printf '%s' "$USER_ROW" | jq -r '.[0].results[]? | .tier_provider_subscription_id // empty')
      MIRRORED_TIER=$(printf '%s' "$USER_ROW" | jq -r '.[0].results[]? | .tier // empty')
      if [[ -z "$MIRRORED_SUB" || "$MIRRORED_TIER" == "hobby" ]]; then
        echo "  ✗ accounts.elixpo never received entitlement.updated for this sub."
      else
        echo "  ✓ accounts.elixpo mirrored the entitlement."
      fi
    fi
  else
    echo "  ⚠ accounts.elixpo workspace not found at $ACCOUNTS_DIR — skipping."
  fi
fi
echo

# ── Summary ─────────────────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════════════════"
echo " Done. To force a redelivery of the most-recent Razorpay event:"
echo "   Razorpay Dashboard → Settings → Webhooks → (endpoint)"
echo "   → Recent Deliveries → Resend on the latest 'subscription.charged'."
echo "═══════════════════════════════════════════════════════════════════"
