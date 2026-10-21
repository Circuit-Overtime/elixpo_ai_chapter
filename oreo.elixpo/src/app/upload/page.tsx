"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, ShieldCheck, Wifi, RefreshCw, Lock, Loader2,
} from "lucide-react";
import { Reveal } from "@/components/MotionWrap";

/* The /upload route is the public on-ramp to the badge's local file
 * transfer flow. Browsers block HTTPS → HTTP fetches (mixed content),
 * and the badge speaks HTTP only — so this page collects the 6-char
 * code shown on the badge, then hands the user off to
 * http://oreo.local/?prefill=<code> in a new tab where the badge's
 * own gated upload page picks up from there.
 *
 * The UI mirrors the badge's local page: six independent code cells
 * with auto-advance, paste-friendly behaviour, and ambiguous-character
 * filtering. The Open button sits below the cells (not beside them)
 * so the card stays balanced at every viewport width.
 */

const CODE_LEN     = 6;
const CODE_CELL_OK = /^[A-HJ-NP-Z2-9]$/i;   // single char accepted into a cell

// mDNS on ESP32 MicroPython is unreliable in the wild (depends on IDF
// build flags, router multicast forwarding, and the client OS's
// happiness with multicast DNS). We default the badge address to
// `oreo.local` for the lucky case but let the user type the raw IP
// the badge prints on its own Send Files screen as a fallback.
const DEFAULT_HOST = "oreo.local";

// Accept hostnames OR bare IPv4 addresses with an optional port.
// Examples that match: `oreo.local`, `192.168.1.42`, `192.168.1.42:80`.
const ADDR_OK = /^[A-Za-z0-9.-]+(:\d{1,5})?$/;

// The badge derives a short hash from its current rotating code and
// expects `?prefill=<hash>` (NOT the raw code) on the local page.
// Keeping the raw code out of the URL means it never lands in browser
// history, referer headers, or shared screenshots. The hash is the
// first 4 bytes of SHA-256(code.toUpperCase()), hex-encoded — matches
// `code_hash()` in oreoOS/http_server.py exactly.
async function codeHash(code: string): Promise<string> {
  const buf = new TextEncoder().encode(code.toUpperCase());
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash).slice(0, 4))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function UploadPage() {
  const [cells, setCells] = useState<string[]>(() => Array(CODE_LEN).fill(""));
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"enter" | "loading" | "handoff">("enter");
  const [host,  setHost]  = useState<string>(DEFAULT_HOST);
  const [hash,  setHash]  = useState<string>("");
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  refs.current = refs.current.slice(0, CODE_LEN);

  // Pull a last-used host from localStorage on first render so a
  // returning user doesn't have to re-type their badge's IP every
  // session. Only restored on the client; SSR sees DEFAULT_HOST.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("oreo-badge-host");
      if (saved) setHost(saved);
    } catch { /* private mode — fine */ }
  }, []);

  const code = cells.join("").toUpperCase();
  const complete = code.length === CODE_LEN;
  const hostValid = ADDR_OK.test(host.trim());

  // Focus the first cell on mount.
  useEffect(() => { refs.current[0]?.focus(); }, []);

  // Pre-compute the hash whenever the code is complete so the click
  // handler can use it synchronously — crypto.subtle.digest is async,
  // and awaiting it inside handoff() would break the user-gesture
  // flag that popup blockers rely on.
  useEffect(() => {
    if (!complete) { setHash(""); return; }
    let cancelled = false;
    codeHash(code).then((h) => { if (!cancelled) setHash(h); });
    return () => { cancelled = true; };
  }, [code, complete]);

  function setCell(i: number, raw: string) {
    const v = (raw || "").toUpperCase();

    // Paste of multiple chars — distribute across cells starting at i.
    if (v.length > 1) {
      const parts = v.replace(/[^A-HJ-NP-Z2-9]/g, "").split("").slice(0, CODE_LEN - i);
      const next = [...cells];
      parts.forEach((c, k) => { next[i + k] = c; });
      setCells(next);
      const last = Math.min(CODE_LEN - 1, i + parts.length);
      refs.current[last]?.focus();
      setError("");
      return;
    }

    // Single char — filter then auto-advance.
    if (v && !CODE_CELL_OK.test(v)) return;
    const next = [...cells];
    next[i] = v;
    setCells(next);
    if (v && i < CODE_LEN - 1) refs.current[i + 1]?.focus();
    setError("");
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !cells[i] && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowLeft"  && i > 0)             refs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < CODE_LEN - 1)  refs.current[i + 1]?.focus();
    if (e.key === "Enter" && complete) handoff();
  }

  // Computed once per render so the visible "Open transfer" link
  // ALSO points at the live URL — that way if window.open is
  // blocked, the user can right-click → "open in new tab" on the
  // anchor we render.
  const rawHost = host.trim();
  const safeHost = ADDR_OK.test(rawHost) ? rawHost : DEFAULT_HOST;
  const targetUrl = `http://${safeHost}/?prefill=${encodeURIComponent(hash)}`;

  function handoff(e?: React.SyntheticEvent) {
    // Prevent the default form submit so the page doesn't reload
    // (which would otherwise wipe our state mid-handoff).
    e?.preventDefault();
    if (!complete) {
      setError(`Code must be ${CODE_LEN} characters.`);
      return;
    }
    if (!hash) {
      // Hash hasn't finished computing yet — extremely unlikely since
      // SHA-256 of 6 bytes is sub-millisecond, but guard anyway so we
      // never open a URL with an empty prefill.
      setError("Hashing code… try again.");
      return;
    }
    const h = host.trim() || DEFAULT_HOST;
    if (!ADDR_OK.test(h)) {
      setError(`"${h}" isn't a valid hostname or IP.`);
      return;
    }
    try { localStorage.setItem("oreo-badge-host", h); } catch {}

    // Canonicalize the destination URL from a strictly validated host.
    const normalizedHost = host.trim().toLowerCase();
    if (!ADDR_OK.test(normalizedHost)) {
      setError("Enter a valid badge address (hostname or IPv4, optional :port).");
      return;
    }
    const url = new URL(`http://${normalizedHost}/`);
    url.searchParams.set("prefill", hash);
    const safeTargetUrl = url.toString();

    // ── Fire window.open SYNCHRONOUSLY inside the user gesture ──
    // Wrapping it in setTimeout (even with a tiny delay) makes
    // browsers treat the call as scripted and block the popup. We
    // open the new tab first; the "loading" UI is rendered after.
    const opened = window.open(safeTargetUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      // Popup blocked anyway. Fall back to a top-level navigation —
      // this loses the website tab but at least gets the user to
      // the badge. They can use the browser's back button to return.
      window.location.href = safeTargetUrl;
      return;
    }
    // Show the loading state while the new tab is spinning up the
    // FTP-style transfer on the badge. After a brief delay we clear
    // the code cells and return to the empty entry form so the user
    // can start a fresh transfer without manually wiping the input.
    setPhase("loading");
    window.setTimeout(() => {
      setCells(Array(CODE_LEN).fill(""));
      setHash("");
      setError("");
      setPhase("enter");
      // Re-focus the first cell so the user can immediately type the
      // next code if they're sending a second file.
      refs.current[0]?.focus();
    }, 1400);
  }

  return (
    <div className="container-page pt-16 pb-28">
      <Reveal>
        <div className="mx-auto max-w-2xl">
          <span className="chip mb-6">
            <Lock className="h-3 w-3" /> peer-to-peer · local network only
          </span>
          <h1 className="font-display text-4xl leading-[1.05] tracking-tight
                         sm:text-5xl">
            Send to your badge.
            <br /><span className="text-primary">No accounts. No cloud.</span>
          </h1>
          <p className="mt-5 max-w-xl text-text-dim">
            Open <span className="text-text">Settings → WiFi → Send files</span> on
            the badge. Enter the 6-character code shown there to start a
            gated, same-network transfer. Files never leave your LAN.
          </p>
        </div>
      </Reveal>

      <div className="mx-auto mt-12 max-w-2xl">
        <AnimatePresence mode="wait">
          {phase === "enter" ? (
            <motion.form
              key="enter"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0  }}
              exit={{    opacity: 0, y:-10 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              onSubmit={handoff}
              className="card-surface p-8 sm:p-10"
            >
              <label className="block text-center text-xs uppercase tracking-widest
                                text-muted">
                Badge code
              </label>

              {/* Six code cells — independent inputs so the user can't
                  fat-finger more than one char per slot. Auto-advance
                  + paste-distribute logic lives in setCell(). */}
              <div className="mt-4 flex flex-wrap justify-center gap-2 sm:gap-3">
                {cells.map((v, i) => (
                  <input
                    key={i}
                    ref={(el) => { refs.current[i] = el; }}
                    value={v}
                    onChange={(e) => setCell(i, e.target.value)}
                    onKeyDown={(e) => onKeyDown(i, e)}
                    onFocus={(e) => e.target.select()}
                    maxLength={2}
                    inputMode="text"
                    autoComplete="off"
                    spellCheck={false}
                    aria-label={`Code character ${i + 1}`}
                    className="h-16 w-12 rounded-md border border-border bg-bg
                               text-center font-mono text-3xl font-semibold uppercase
                               text-primary outline-none transition-colors
                               placeholder:text-muted-deep
                               focus:border-primary focus:ring-2 focus:ring-primary/30
                               sm:h-20 sm:w-14 sm:text-4xl"
                  />
                ))}
              </div>

              {/* Helper / error line — fixed-height so the layout
                  doesn't jump as the message changes. */}
              <div className="mt-4 min-h-[20px] text-center text-xs">
                {error ? (
                  <motion.span
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y:  0 }}
                    className="text-primary"
                  >
                    {error}
                  </motion.span>
                ) : (
                  <span className="text-muted-deep">
                    Six characters · skips ambiguous shapes (no 0/O/1/I/L)
                  </span>
                )}
              </div>

              {/* Badge address. Default `oreo.local` works on networks
                  where multicast DNS resolves; otherwise the user
                  types the IP printed on the badge's Send Files page. */}
              <div className="mt-6">
                <label htmlFor="badge-host"
                       className="block text-center text-xs uppercase
                                  tracking-widest text-muted">
                  Badge address
                </label>
                <input
                  id="badge-host"
                  value={host}
                  onChange={(e) => { setHost(e.target.value); setError(""); }}
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="off"
                  inputMode="url"
                  placeholder="oreo.local"
                  className={`mx-auto mt-2 block w-full max-w-xs rounded-md
                              border bg-bg px-3 py-2.5 text-center
                              font-mono text-base text-text outline-none
                              transition-colors placeholder:text-muted-deep
                              ${hostValid
                                  ? "border-border focus:border-primary/70"
                                  : "border-primary/50 focus:border-primary"}`}
                />
                <p className="mt-2 text-center text-xs text-muted-deep">
                  Default <span className="text-muted">oreo.local</span> works
                  on networks where mDNS resolves. Otherwise type the IP
                  shown on the badge's Send Files page (e.g.{" "}
                  <span className="text-muted">192.168.1.42</span>).
                </p>
              </div>

              <button
                type="submit"
                disabled={!complete || !hostValid || !hash}
                className="btn-primary mt-6 w-full justify-center
                           disabled:cursor-not-allowed disabled:opacity-50"
              >
                Open transfer <ArrowRight className="h-4 w-4" />
              </button>

              {/* Backup link — visible only after the form is valid.
                  Lets the user right-click → "open in new tab" if the
                  Submit button's window.open got blocked by their
                  browser (most common on iOS Safari + Firefox
                  strict-popup-blocking modes). */}
              {complete && hostValid && hash && (
                <p className="mt-3 text-center text-xs text-muted">
                  Button blocked?{" "}
                  <a
                    href={targetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline decoration-primary/40
                               underline-offset-2 hover:decoration-primary"
                  >
                    Open this link manually
                  </a>.
                </p>
              )}

              {/* Three info tiles below — explain the model without
                  making the user read paragraphs. */}
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <Tile Icon={Wifi}        title="Same WiFi"
                      body="Phone and badge on one network." />
                <Tile Icon={ShieldCheck} title="Tap to allow"
                      body="Each session waits for badge approval." />
                <Tile Icon={RefreshCw}   title="Auto cleanup"
                      body="Codes expire in 5 min." />
              </div>
            </motion.form>
          ) : phase === "loading" ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0  }}
              exit={{    opacity: 0, y:-10 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="card-surface flex flex-col items-center gap-4 p-10
                         text-center"
            >
              <div className="grid h-14 w-14 place-items-center rounded-pill
                              bg-primary/15 text-primary">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
              <h2 className="font-display text-2xl">
                Opening local page for FTP transfer…
              </h2>
              <p className="max-w-md text-sm text-text-dim">
                A new tab is loading{" "}
                <code className="text-text">http://{host || DEFAULT_HOST}</code>.
                Approve the session on the badge to start sending files.
              </p>
              <div className="mt-2 h-1 w-40 overflow-hidden rounded-pill
                              bg-bg-raised">
                <motion.div
                  className="h-full bg-primary"
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 1.4, ease: "easeInOut" }}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="handoff"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0  }}
              exit={{    opacity: 0, y:-10 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="card-surface flex flex-col items-center gap-4 p-10
                         text-center"
            >
              <div className="grid h-14 w-14 place-items-center rounded-pill
                              bg-primary/15 text-primary">
                <ArrowRight className="h-6 w-6 animate-pulse-soft" />
              </div>
              <h2 className="font-display text-2xl">
                Transfer tab opened.
              </h2>
              <p className="max-w-md text-sm text-text-dim">
                Make sure your device is on the same WiFi as the badge,
                approve the session, and pick a file.
              </p>
              <button
                onClick={() => { setPhase("enter"); setCells(Array(CODE_LEN).fill("")); }}
                className="btn-ghost mt-4"
              >
                Send another
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <Reveal delay={0.15}>
          <div className="mt-12 rounded-md border border-border/60 bg-bg-raised/40 p-6
                          text-sm leading-relaxed text-text-dim">
            <p className="text-text">Why two pages?</p>
            <p className="mt-2">
              Browsers block HTTPS pages from talking to plain-HTTP
              endpoints. Cloudflare serves this page over HTTPS; the
              badge speaks HTTP on your LAN. The handoff puts you on
              the badge's own page so the upload itself stays on the
              local network — no cloud, no proxy, no metadata leakage.
            </p>
          </div>
        </Reveal>
      </div>
    </div>
  );
}

function Tile({
  Icon, title, body,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-md border border-border bg-bg-raised/50 p-4">
      <Icon className="mb-2 h-4 w-4 text-primary" />
      <p className="text-sm font-semibold text-text">{title}</p>
      <p className="mt-1 text-xs text-text-dim">{body}</p>
    </div>
  );
}
