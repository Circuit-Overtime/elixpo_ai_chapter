// Base URL of the central payments service (Elixpo Pay, payouts.elixpo.com).
//
// Checkout no longer uses a signed handoff token — the server route calls
// POST /v1/checkout/sessions with our secret key and Elixpo Pay resolves the
// price from its catalog. This module is just the base-URL resolver now.

// Override locally via PAYOUTS_URL to point at a dev payouts instance.
export function payoutsBase() {
  return (process.env.PAYOUTS_URL || 'https://payouts.elixpo.com').replace(/\/$/, '');
}
