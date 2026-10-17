// THROWAWAY VERIFICATION SPIKE — mail.elixpo MVP step 0.
// Question: can a Cloudflare Worker open an authenticated SMTP connection
// (user's own Gmail/SMTP + app password) over the cloudflare:sockets TCP API
// and actually deliver a message? Pages edge routes can't do raw TCP; Workers can.
//
// This is NOT product code. It hand-rolls a minimal SMTP client so the HTTP
// response is the full wire transcript — maximally debuggable. If this lands a
// real email, we build the real send path on `cloudflare:sockets` (worker-mailer
// in the Queue consumer). If it can't, we fall back to a Node sender service.
//
// Creds come ONLY from env (.dev.vars locally / `wrangler secret` in prod).
// Nothing is hardcoded. Port 465 = implicit TLS (secureTransport: "on").

import { connect } from "cloudflare:sockets";

const enc = new TextEncoder();
const dec = new TextDecoder();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/") {
      return new Response("POST or GET / to run the SMTP spike\n", { status: 404 });
    }

    const cfg = {
      host: env.SMTP_HOST || "smtp.gmail.com",
      port: Number(env.SMTP_PORT || 465),
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.SMTP_FROM || env.SMTP_USER,
      to: env.MAIL_TO,
    };

    const missing = ["user", "pass", "to"].filter((k) => !cfg[k]);
    if (missing.length) {
      return json(
        { ok: false, error: `missing env: ${missing.map((m) => `SMTP_${m.toUpperCase()}`).join(", ")}` },
        500
      );
    }

    const transcript = [];
    try {
      await sendMail(cfg, transcript);
      return json({ ok: true, host: cfg.host, port: cfg.port, to: cfg.to, transcript }, 200);
    } catch (err) {
      return json({ ok: false, error: String(err && err.message || err), transcript }, 502);
    }
  },
};

async function sendMail(cfg, transcript) {
  // Implicit TLS on 465. (For 587 we'd connect plaintext then startTls() — out of
  // scope for this first proof; 465 is the simpler, more reliable path on Workers.)
  const socket = connect(
    { hostname: cfg.host, port: cfg.port },
    { secureTransport: "on", allowHalfOpen: false }
  );

  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  let buf = "";

  // Read one full SMTP reply (handles multiline: continues until "NNN " not "NNN-").
  async function read() {
    while (true) {
      const completeAt = completeReply(buf);
      if (completeAt >= 0) {
        const reply = buf.slice(0, completeAt);
        buf = buf.slice(completeAt);
        transcript.push("S: " + reply.trimEnd());
        return reply;
      }
      const { value, done } = await reader.read();
      if (done) {
        if (buf) { transcript.push("S: " + buf.trimEnd()); return buf; }
        throw new Error("socket closed before reply completed");
      }
      buf += dec.decode(value, { stream: true });
    }
  }

  async function send(line, redact) {
    transcript.push("C: " + (redact ? "***" : line));
    await writer.write(enc.encode(line + "\r\n"));
  }

  function expect(reply, code) {
    const got = reply.slice(0, 3);
    if (got !== String(code)) {
      throw new Error(`expected ${code}, got: ${reply.trim()}`);
    }
  }

  try {
    expect(await read(), 220); // server greeting

    await send(`EHLO mail.elixpo`);
    expect(await read(), 250);

    await send("AUTH LOGIN");
    expect(await read(), 334);
    await send(b64(cfg.user), true);
    expect(await read(), 334);
    await send(b64(cfg.pass), true);
    expect(await read(), 235); // auth accepted

    await send(`MAIL FROM:<${cfg.from}>`);
    expect(await read(), 250);
    await send(`RCPT TO:<${cfg.to}>`);
    expect(await read(), 250);

    await send("DATA");
    expect(await read(), 354);

    const body = buildMessage(cfg);
    await writer.write(enc.encode(body + "\r\n.\r\n"));
    transcript.push("C: <message body> + .");
    expect(await read(), 250); // queued

    await send("QUIT");
    try { expect(await read(), 221); } catch { /* some servers drop before 221 */ }
  } finally {
    try { await writer.close(); } catch {}
    try { reader.releaseLock(); } catch {}
    try { await socket.close(); } catch {}
  }
}

// Returns index just past the end of the first complete reply, or -1.
function completeReply(s) {
  let i = 0;
  while (true) {
    const nl = s.indexOf("\n", i);
    if (nl < 0) return -1;
    const line = s.slice(i, nl);
    // Final line of a reply has a space (not a hyphen) at position 3.
    if (line.length >= 4 && line[3] === " ") return nl + 1;
    if (line.length === 3) return nl + 1; // bare "NNN\r"
    i = nl + 1;
  }
}

function buildMessage(cfg) {
  const date = new Date().toUTCString();
  return [
    `From: mail.elixpo spike <${cfg.from}>`,
    `To: <${cfg.to}>`,
    `Subject: [mail.elixpo] cloudflare:sockets SMTP verification`,
    `Date: ${date}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    `If you are reading this, a Cloudflare Worker opened a TCP socket to`,
    `${cfg.host}:${cfg.port}, authenticated, and delivered mail. Step 0 settled.`,
    ``,
    `— mail.elixpo SMTP-on-edge spike`,
  ].join("\r\n");
}

function b64(s) {
  return btoa(unescape(encodeURIComponent(s)));
}

function json(obj, status) {
  return new Response(JSON.stringify(obj, null, 2) + "\n", {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
