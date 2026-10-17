// DKIM-Signature generator for the SMTP sender Worker.
//
// Why this exists:
//   smtp.gmail.com (or any SMTP relay that authenticates as a domain
//   different from our From: header) signs outbound mail with d=relay-
//   domain, not d=mails.elixpo.com. DMARC requires the d= domain to
//   align with From:; without that, Gmail/Outlook/Apple spam-folder
//   transactional mail. By signing OURSELVES with d=<our domain> BEFORE
//   handing the bytes to the relay, the recipient's MTA finds an
//   aligned signature, DMARC passes, and the mail lands in inbox.
//
// RFC 6376, simple/relaxed canonicalization. relaxed-relaxed is the
// industry standard for transactional mail — it tolerates the small
// whitespace mutations relays sometimes introduce.
//
// No deps. RSA-SHA256 via Web Crypto, available in the Workers runtime.
//
// Environment variables consumed (set as Worker secrets):
//   DKIM_PRIVATE_KEY  PKCS#8 PEM block, RSA 2048-bit recommended.
//                     Carriage returns OR literal "\n" both accepted.
//   DKIM_DOMAIN       e.g. "mails.elixpo.com" — the domain in `d=`.
//   DKIM_SELECTOR     e.g. "elixpo1" — the selector in `s=`. The matching
//                     public key MUST be published at
//                     <selector>._domainkey.<domain> as a TXT record:
//                     "v=DKIM1; k=rsa; p=<base64 public key>"
//
// When any of these are missing the worker skips DKIM and falls back to
// the unsigned send path — useful for local dev and the gradual rollout.

const enc = new TextEncoder();

/**
 * Returns true iff the env carries enough to sign. Cheap; safe to call
 * on every send.
 */
export function isDkimConfigured(env) {
    return !!(env?.DKIM_PRIVATE_KEY && env?.DKIM_DOMAIN && env?.DKIM_SELECTOR);
}

/**
 * Sign `message` (the full RFC 5322 message bytes: headers \r\n\r\n body)
 * and return the same message with a `DKIM-Signature:` header prepended
 * to the header block.
 *
 * Throws on unsigned-message validation issues. Caller should catch and
 * fall back to sending the unsigned message — a missing DKIM signature
 * is worse UX than a delivery failure.
 */
export async function signMessage(message, env) {
    if (!isDkimConfigured(env)) return message;

    const split = message.indexOf("\r\n\r\n");
    if (split < 0) throw new Error("dkim: message missing header/body separator");
    const headerBlock = message.slice(0, split);
    const body = message.slice(split + 4);

    // Headers we'll sign. RFC 6376 §5.4 recommends From + at minimum;
    // include the standard transactional set so receivers can't trivially
    // replay-attack by stripping signed fields.
    const headerNames = [
        "From",
        "To",
        "Subject",
        "Date",
        "MIME-Version",
        "Content-Type",
        "List-Unsubscribe",
        "List-Unsubscribe-Post",
    ];

    const parsed = parseHeaders(headerBlock);
    const signedHeaderList = [];
    const canonicalSignedHeaders = [];
    for (const name of headerNames) {
        const idx = parsed.findIndex((h) => h.name.toLowerCase() === name.toLowerCase());
        if (idx < 0) continue;
        signedHeaderList.push(parsed[idx].name);
        canonicalSignedHeaders.push(canonicalizeHeaderRelaxed(parsed[idx]));
    }
    if (signedHeaderList.length === 0) {
        throw new Error("dkim: no signable headers present");
    }

    // Body canonicalization (relaxed): collapse runs of WSP, strip
    // trailing WSP per line, then remove trailing empty lines.
    const canonBody = canonicalizeBodyRelaxed(body);
    const bodyHashBuf = await crypto.subtle.digest("SHA-256", enc.encode(canonBody));
    const bh = b64(new Uint8Array(bodyHashBuf));

    const timestamp = Math.floor(Date.now() / 1000);
    // RFC 6376 §3.5: signature header without `b=` value, then the
    // value is appended after signing. Use the relaxed canonical form
    // for THIS header too.
    const dkimHeaderUnsigned = `v=1; a=rsa-sha256; c=relaxed/relaxed; d=${env.DKIM_DOMAIN}; s=${env.DKIM_SELECTOR}; t=${timestamp}; h=${signedHeaderList.join(":")}; bh=${bh}; b=`;

    // The signed string = canonical signed-headers + canonical
    // DKIM-Signature header (with empty b=).
    const dkimAsCanonHeader = canonicalizeHeaderRelaxed({
        name: "DKIM-Signature",
        value: dkimHeaderUnsigned,
    });
    const toSign = `${canonicalSignedHeaders.join("\r\n")}\r\n${dkimAsCanonHeader}`;

    const key = await importPrivateKey(env.DKIM_PRIVATE_KEY);
    const sig = await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, key, enc.encode(toSign));
    const b = b64(new Uint8Array(sig));

    // Final signature header (with b=). Insert as the FIRST header so
    // verifiers see it before relay-added Received headers.
    const finalHeader = `DKIM-Signature: ${dkimHeaderUnsigned}${b}`;
    return `${finalHeader}\r\n${message}`;
}

// ── canonicalization helpers (RFC 6376 §3.4) ─────────────────────────

function parseHeaders(headerBlock) {
    // Unfold folded headers (continuation lines start with WSP) then
    // split on the first ":".
    const lines = headerBlock.split(/\r?\n/);
    const unfolded = [];
    for (const line of lines) {
        if (/^[ \t]/.test(line) && unfolded.length > 0) {
            unfolded[unfolded.length - 1] += line;
        } else {
            unfolded.push(line);
        }
    }
    return unfolded.filter(Boolean).map((line) => {
        const colon = line.indexOf(":");
        if (colon < 0) return { name: line, value: "" };
        return {
            name: line.slice(0, colon),
            value: line.slice(colon + 1),
        };
    });
}

function canonicalizeHeaderRelaxed({ name, value }) {
    // - lowercase header name
    // - collapse internal WSP runs to a single space
    // - strip trailing WSP
    // - strip leading WSP from value
    const lname = name.toLowerCase();
    const cvalue = String(value)
        .replace(/\r?\n/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/[ \t]+$/, "")
        .replace(/^[ \t]+/, "");
    return `${lname}:${cvalue}`;
}

function canonicalizeBodyRelaxed(body) {
    // Normalize line endings to CRLF.
    let s = body.replace(/\r?\n/g, "\r\n");
    // Replace runs of WSP with a single SP, strip trailing WSP per line.
    s = s
        .split("\r\n")
        .map((line) => line.replace(/[ \t]+/g, " ").replace(/[ \t]+$/, ""))
        .join("\r\n");
    // Remove trailing empty lines (RFC 6376: ignore trailing CRLFs but
    // a non-empty body MUST end with a single CRLF).
    s = s.replace(/(\r\n)+$/, "");
    if (s.length > 0) s += "\r\n";
    return s;
}

// ── crypto helpers ───────────────────────────────────────────────────

async function importPrivateKey(pem) {
    // Accept PEM with real newlines OR escaped \n (we sometimes paste
    // env values with the latter).
    const normalized = pem.replace(/\\n/g, "\n").trim();
    const base64 = normalized
        .replace(/-----BEGIN PRIVATE KEY-----/g, "")
        .replace(/-----END PRIVATE KEY-----/g, "")
        .replace(/\s+/g, "");
    const der = base64ToBytes(base64);
    return crypto.subtle.importKey(
        "pkcs8",
        der,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"],
    );
}

function base64ToBytes(b64str) {
    const bin = atob(b64str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function b64(bytes) {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
}
