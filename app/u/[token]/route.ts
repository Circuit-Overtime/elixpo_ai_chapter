export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { productNameById, suppress, verifyUnsub } from "@/lib/suppressions";
import type { NextRequest } from "next/server";

function page(title: string, body: string, status = 200): Response {
    const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:#0b0d12;
         font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:#e7e5e4; }
  .card { max-width:440px; width:90%; padding:36px 32px; background:#15161c; border:1px solid rgba(255,255,255,0.08);
          border-radius:16px; text-align:center; }
  h1 { font-size:1.25rem; margin:0 0 10px; color:#f5f5f4; }
  p { color:rgba(245,245,244,0.6); font-size:0.95rem; line-height:1.6; margin:0 0 22px; }
  button { font:inherit; font-weight:700; color:#fff; border:0; cursor:pointer; padding:12px 26px; border-radius:11px;
           background:linear-gradient(135deg,#9b7bf7,#7c5cff); }
  .muted { color:rgba(245,245,244,0.4); font-size:0.82rem; margin-top:18px; }
</style></head><body><div class="card">${body}</div></body></html>`;
    return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

/** GET /u/:token — confirmation page with a one-click Unsubscribe button. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    const data = await verifyUnsub(token);
    if (!data)
        return page(
            "Invalid link",
            "<h1>Link not valid</h1><p>This unsubscribe link is invalid or has been tampered with.</p>",
            400,
        );

    const db = await getDatabase();
    const product = await productNameById(db, data.productId);
    const name = product?.name ? product.name : "this sender";
    return page(
        "Unsubscribe",
        `<h1>Unsubscribe?</h1>
         <p>Stop emails to <strong>${escapeHtml(data.email)}</strong> from <strong>${escapeHtml(name)}</strong>.</p>
         <form method="POST"><button type="submit">Unsubscribe</button></form>
         <div class="muted">You can be re-added by ${escapeHtml(name)} if you opt back in.</div>`,
    );
}

/** POST /u/:token — performs the unsubscribe (browser form + RFC 8058 one-click). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    const data = await verifyUnsub(token);
    if (!data)
        return page(
            "Invalid link",
            "<h1>Link not valid</h1><p>This unsubscribe link is invalid.</p>",
            400,
        );

    const db = await getDatabase();
    await suppress(db, data.productId, data.email, "unsubscribe");
    return page(
        "Unsubscribed",
        `<h1>You're unsubscribed</h1><p><strong>${escapeHtml(data.email)}</strong> won't receive further emails from this sender.</p>`,
    );
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
