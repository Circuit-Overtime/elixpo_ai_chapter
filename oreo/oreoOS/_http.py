"""Raw-socket HTTP GET with a timeout that's actually honoured.

Both `oreoOS.ota` and `oreoOS.store` use this instead of `urequests`
because `urequests`'s `timeout=` flag on the MicroPython 1.28 build we
ship only covers the connect step — body read can hang forever on a
slow / mis-behaving server, wedging the OS run loop for minutes.

Public surface:
    get_url(url, accept=None, timeout_s=4, auth=None,
            on_progress=None) -> bytes | None

`accept` overrides the Accept header (GitHub Contents API needs
`application/vnd.github.raw` for raw file bodies, otherwise we get the
base64-wrapped JSON envelope).

`auth` is an optional ("Bearer <token>") header value.

Follows a small, bounded number of HTTPS redirects. This is required for
GitHub Release assets: their public download URL responds with HTTP 302 and
points at a short-lived release-assets.githubusercontent.com URL.

Returns the response body as bytes on HTTP 200, or None on any unsupported
status / timeout / DNS failure / SSL error. Caller logs / surfaces.
"""

import time

try:
    import socket as _socket
    import ssl    as _ssl
    _OK = True
except ImportError:
    _OK = False


USER_AGENT = "OreoBadge"
MAX_REDIRECTS = 3
# The largest current OTA asset is ~490 KiB. Keep a hard ceiling so a bad or
# hostile endpoint cannot consume the whole heap, while leaving useful room
# for future generated assets on the 8 MiB-PSRAM target.
MAX_RESPONSE_BYTES = 1024 * 1024


def _bc(msg):
    try:
        print("[http] " + msg)
    except Exception:
        pass


def _progress(callback, phase, received=0):
    """Best-effort network progress pulse for synchronous UI callers."""
    if callback is None:
        return
    try:
        callback(phase, received)
    except Exception:
        pass


def _split_https_url(url):
    """Return (host, port, path) for an HTTPS URL, or None."""
    if not url.startswith("https://"):
        return None
    rest = url[len("https://"):]
    slash = rest.find("/")
    if slash < 0:
        host, path = rest, "/"
    else:
        host, path = rest[:slash], rest[slash:]
    port = 443
    if ":" in host:
        host, p = host.split(":", 1)
        try:
            port = int(p)
        except ValueError:
            return None
    if not host:
        return None
    return host, port, path


def _header_value(head, name):
    """Case-insensitive header lookup on the raw response-header bytes."""
    prefix = name.lower().encode() + b":"
    for line in head.split(b"\r\n")[1:]:
        if line.lower().startswith(prefix):
            try:
                return line[len(prefix):].strip().decode()
            except Exception:
                return None
    return None


def _redirect_url(current_url, location):
    """Resolve the HTTPS absolute/root-relative redirects GitHub emits."""
    if not location:
        return None
    if location.startswith("https://"):
        return location
    if location.startswith("/"):
        parsed = _split_https_url(current_url)
        if parsed is not None:
            return "https://" + parsed[0] + location
    return None


def get_url(url, accept=None, timeout_s=4, auth=None, on_progress=None):
    """GET a URL and follow at most MAX_REDIRECTS HTTPS redirects.

    Authorization is deliberately dropped after a cross-host redirect. GitHub
    Release assets use signed CDN URLs and do not need the API token; keeping
    the token on the original host prevents credentials from being forwarded
    to an unrelated redirect target.
    """
    current = url
    request_auth = auth
    allow_auto_auth = True
    for redirect_count in range(MAX_REDIRECTS + 1):
        result = _get_once(current, accept, timeout_s,
                           request_auth, allow_auto_auth, on_progress)
        if result is None:
            return None
        status, head, body = result
        if status == 200:
            if b"\r\ntransfer-encoding: chunked" in (b"\r\n" + head.lower()):
                body = _dechunk(body)
            return body
        if status not in (301, 302, 303, 307, 308):
            parsed = _split_https_url(current)
            _bc("HTTP %d %s" % (status, parsed[0] if parsed else "?"))
            return None
        if redirect_count >= MAX_REDIRECTS:
            _bc("too many redirects")
            return None
        location = _header_value(head, "location")
        next_url = _redirect_url(current, location)
        if next_url is None:
            _bc("invalid redirect")
            return None
        current_host = _split_https_url(current)
        next_host = _split_https_url(next_url)
        if current_host is None or next_host is None:
            return None
        if current_host[0] != next_host[0]:
            request_auth = None
            allow_auto_auth = False
        _bc("redirect " + next_host[0])
        _progress(on_progress, "redirect")
        current = next_url
    return None


def _get_once(url, accept, timeout_s, auth, allow_auto_auth=True,
              on_progress=None):
    if not _OK:
        return None
    parsed = _split_https_url(url)
    if parsed is None:
        return None
    host, port, path = parsed

    accept_hdr = accept or "*/*"

    # Auto-inject a GitHub token for *.github.com calls if one is
    # present in oreoOS.config. Bumps anonymous limit (60 / hr / IP)
    # to 5000 / hr — relevant only for sustained Store / OTA polling.
    # `auth` arg overrides if the caller wants something custom.
    github_host = (host == "github.com" or host == "api.github.com" or
                   host == "raw.githubusercontent.com" or
                   host.endswith(".githubusercontent.com"))
    if allow_auto_auth and auth is None and github_host:
        try:
            from oreoOS.config import GH_TOKEN as _TOK
            if _TOK:
                auth = "Bearer " + _TOK
        except Exception:
            pass
    auth_hdr = ("Authorization: " + auth + "\r\n") if auth else ""

    deadline = time.ticks_add(time.ticks_ms(), int(timeout_s * 1000) + 500)
    s = None
    raw = None
    try:
        _bc("dns " + host)
        _progress(on_progress, "dns")
        addr = _socket.getaddrinfo(host, port)[0][-1]
        _bc("connect " + host + ":" + str(port))
        _progress(on_progress, "connect")
        raw = _socket.socket()
        raw.settimeout(timeout_s)
        raw.connect(addr)
        _bc("ssl")
        _progress(on_progress, "tls")
        s = _ssl.wrap_socket(raw, server_hostname=host)
        # SSLSocket wraps raw — settimeout on raw doesn't always
        # propagate. Set it again on the wrapper so .read() honours it.
        try:
            s.settimeout(timeout_s)
        except Exception:
            pass

        req = (
            "GET %s HTTP/1.1\r\n"
            "Host: %s\r\n"
            "User-Agent: %s\r\n"
            "Accept: %s\r\n"
            "Accept-Encoding: identity\r\n"
            "%s"
            "Connection: close\r\n\r\n"
        ) % (path, host, USER_AGENT, accept_hdr, auth_hdr)
        _progress(on_progress, "request")
        s.write(req.encode())

        _bc("read")
        buf = bytearray()
        while True:
            # Hard wallclock guard — even if settimeout misfires we
            # bail when the budget is blown.
            if time.ticks_diff(deadline, time.ticks_ms()) <= 0:
                _bc("deadline blown after %d bytes" % len(buf))
                break
            try:
                chunk = s.read(2048)
            except Exception as e:
                _bc("read err: " + str(e))
                break
            if not chunk:
                break
            buf.extend(chunk)
            _progress(on_progress, "read", len(buf))
            if len(buf) > MAX_RESPONSE_BYTES:
                _bc("response too large")
                return None
    except Exception as e:
        _bc("FAIL " + host + ": " + str(e))
        return None
    finally:
        for h in (s, raw):
            try:
                if h is not None:
                    h.close()
            except Exception:
                pass

    # Slice headers / body. Status handling (including redirects) belongs to
    # get_url(), which may need to issue another request.
    head_end = buf.find(b"\r\n\r\n")
    if head_end < 0:
        return None
    head = bytes(buf[:head_end])
    body = bytes(buf[head_end + 4:])

    status = 0
    line0  = head.split(b"\r\n", 1)[0]
    parts  = line0.split(b" ", 2)
    if len(parts) >= 2:
        try: status = int(parts[1])
        except ValueError: status = 0
    return status, head, body


def _dechunk(body):
    out = bytearray()
    i = 0
    while i < len(body):
        nl = body.find(b"\r\n", i)
        if nl < 0:
            break
        try:
            n = int(body[i:nl].split(b";")[0], 16)
        except Exception:
            break
        i = nl + 2
        if n == 0:
            break
        out.extend(body[i:i + n])
        i += n + 2
    return bytes(out)
