// SMTP-over-sockets client for the Cloudflare Workers runtime.
// Promoted from spike/smtp-edge after it proved an authenticated Gmail send
// works over cloudflare:sockets. Supports implicit TLS (port 465, secure:"tls")
// and STARTTLS (port 587, secure:"starttls"). Returns a wire transcript for
// debugging (credentials redacted).

import { connect } from "cloudflare:sockets";
import { isDkimConfigured, signMessage } from "./dkim.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

export async function sendMail(opts) {
    const {
        host,
        port = 465,
        secure = "tls", // "tls" (implicit) | "starttls"
        user,
        pass,
        from,
        fromName,
        to,
        subject = "",
        html,
        text,
    } = opts;

    const transcript = [];
    const starttls = secure === "starttls";

    const socket = connect(
        { hostname: host, port: Number(port) },
        starttls
            ? { secureTransport: "starttls", allowHalfOpen: false }
            : { secureTransport: "on", allowHalfOpen: false },
    );

    let writer = socket.writable.getWriter();
    let reader = socket.readable.getReader();
    let buf = "";

    async function read() {
        while (true) {
            const at = completeReply(buf);
            if (at >= 0) {
                const reply = buf.slice(0, at);
                buf = buf.slice(at);
                transcript.push(`S: ${reply.trimEnd()}`);
                return reply;
            }
            const { value, done } = await reader.read();
            if (done) {
                if (buf) {
                    transcript.push(`S: ${buf.trimEnd()}`);
                    return buf;
                }
                throw new Error("connection closed before reply completed");
            }
            buf += dec.decode(value, { stream: true });
        }
    }

    async function send(line, redact) {
        transcript.push(`C: ${redact ? "***" : line}`);
        await writer.write(enc.encode(`${line}\r\n`));
    }

    function expect(reply, code) {
        if (reply.slice(0, 3) !== String(code)) {
            throw new Error(`expected ${code}, got: ${reply.trim()}`);
        }
    }

    try {
        expect(await read(), 220);
        await send("EHLO mail.elixpo");
        expect(await read(), 250);

        if (starttls) {
            await send("STARTTLS");
            expect(await read(), 220);
            // Upgrade the connection, then re-handshake on the secure channel.
            const secureSocket = socket.startTls();
            writer = secureSocket.writable.getWriter();
            reader = secureSocket.readable.getReader();
            buf = "";
            await send("EHLO mail.elixpo");
            expect(await read(), 250);
        }

        await send("AUTH LOGIN");
        expect(await read(), 334);
        await send(b64(user), true);
        expect(await read(), 334);
        await send(b64(pass), true);
        expect(await read(), 235);

        await send(`MAIL FROM:<${from}>`);
        expect(await read(), 250);
        await send(`RCPT TO:<${to}>`);
        expect(await read(), 250);

        await send("DATA");
        expect(await read(), 354);

        const rawMessage = buildMessage({
            from,
            fromName,
            to,
            subject,
            html,
            text,
            attachments: opts.attachments,
            listUnsubscribe: opts.listUnsubscribe,
        });
        // DKIM signing — prepends a `DKIM-Signature:` header to the
        // message before transmission. Skipped (returns rawMessage
        // unchanged) when DKIM_DOMAIN / DKIM_SELECTOR / DKIM_PRIVATE_KEY
        // aren't configured on the Worker env. We swallow signing errors
        // and fall back to the unsigned message — a missing signature
        // costs deliverability, but a hard fail at this point costs the
        // delivery entirely.
        let message = rawMessage;
        if (opts.env && isDkimConfigured(opts.env)) {
            try {
                message = await signMessage(rawMessage, opts.env);
                transcript.push(
                    `C: <DKIM-Signature d=${opts.env.DKIM_DOMAIN} s=${opts.env.DKIM_SELECTOR}>`,
                );
            } catch (err) {
                transcript.push(`! dkim signing skipped: ${err?.message || String(err)}`);
            }
        }
        await writer.write(enc.encode(`${message}\r\n.\r\n`));
        transcript.push("C: <message body> + .");
        const queued = await read();
        expect(queued, 250);

        await send("QUIT");
        try {
            await read();
        } catch {
            /* some servers drop before 221 */
        }

        return { ok: true, response: queued.trim(), transcript };
    } finally {
        try {
            await writer.close();
        } catch {}
        try {
            reader.releaseLock();
        } catch {}
        try {
            await socket.close();
        } catch {}
    }
}

// Index just past the first complete reply, or -1.
function completeReply(s) {
    let i = 0;
    while (true) {
        const nl = s.indexOf("\n", i);
        if (nl < 0) return -1;
        const line = s.slice(i, nl);
        if (line.length >= 4 && line[3] === " ") return nl + 1;
        if (line.length === 3) return nl + 1;
        i = nl + 1;
    }
}

function buildMessage({ from, fromName, to, subject, html, text, attachments, listUnsubscribe }) {
    const date = new Date().toUTCString();
    const fromHeader = fromName ? `${encodeHeaderWord(fromName)} <${from}>` : `<${from}>`;
    const headers = [
        `From: ${fromHeader}`,
        `To: <${to}>`,
        `Subject: ${encodeHeaderWord(subject)}`,
        `Date: ${date}`,
        "MIME-Version: 1.0",
    ];

    // RFC 8058 one-click unsubscribe.
    if (listUnsubscribe) {
        const url = String(listUnsubscribe).replace(/[\r\n<>]/g, "");
        headers.push(`List-Unsubscribe: <${url}>`);
        headers.push("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
    }

    const files = Array.isArray(attachments) ? attachments.filter((a) => a?.contentBase64) : [];

    // The body (text/html) as a self-contained content block — multipart/
    // alternative when we have both, else a single text/html or text/plain.
    function contentBlock() {
        if (html && text) {
            const b = `=_alt_${randomToken()}`;
            return {
                header: `Content-Type: multipart/alternative; boundary="${b}"`,
                body: [
                    `--${b}`,
                    "Content-Type: text/plain; charset=utf-8",
                    "",
                    dotStuff(text),
                    `--${b}`,
                    "Content-Type: text/html; charset=utf-8",
                    "",
                    dotStuff(html),
                    `--${b}--`,
                ].join("\r\n"),
            };
        }
        if (html) return { header: "Content-Type: text/html; charset=utf-8", body: dotStuff(html) };
        return { header: "Content-Type: text/plain; charset=utf-8", body: dotStuff(text || "") };
    }

    if (files.length === 0) {
        const c = contentBlock();
        headers.push(c.header);
        return `${headers.join("\r\n")}\r\n\r\n${c.body}`;
    }

    // multipart/mixed: the content block, then one part per attachment.
    const mixed = `=_mixed_${randomToken()}`;
    headers.push(`Content-Type: multipart/mixed; boundary="${mixed}"`);
    const c = contentBlock();
    const parts = [`--${mixed}`, c.header, "", c.body];
    for (const a of files) {
        const name = encodeHeaderWord(a.filename || "attachment");
        const type = (a.contentType || "application/octet-stream").replace(/[\r\n"]/g, "");
        parts.push(
            `--${mixed}`,
            `Content-Type: ${type}; name="${name}"`,
            "Content-Transfer-Encoding: base64",
            `Content-Disposition: attachment; filename="${name}"`,
            "",
            wrap76(String(a.contentBase64).replace(/[^A-Za-z0-9+/=]/g, "")),
        );
    }
    parts.push(`--${mixed}--`);
    return `${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}`;
}

// Base64 bodies must be wrapped to <=76 chars per line (RFC 2045).
function wrap76(b64) {
    return b64.replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

// RFC 5321 dot-stuffing: a line starting with "." must be escaped to "..".
function dotStuff(s) {
    return s
        .replace(/\r?\n/g, "\r\n")
        .replace(/\r\n\./g, "\r\n..")
        .replace(/^\./, "..");
}

// Encode a header value as RFC 2047 if it contains non-ASCII; else pass through.
function encodeHeaderWord(s) {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ASCII range check
    if (/^[\x00-\x7F]*$/.test(s)) return s;
    return `=?UTF-8?B?${btoa(unescape(encodeURIComponent(s)))}?=`;
}

function b64(s) {
    return btoa(unescape(encodeURIComponent(s)));
}

function randomToken() {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}
