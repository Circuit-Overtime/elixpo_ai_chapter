"""Reader — view text / markdown files landed in documents/.

Two screens:
  picker  list of files (.md / .txt), UP/DOWN selects, A opens, HOME exits
  view    renders the file, UP/DOWN scrolls a line at a time, B returns

Markdown features:
  # / ## / ###   headings (scaled, accent colour)
  **bold**       primary-coloured run
  *italic*       muted-coloured run
  `code`         teal run with a subtle bg rect
  - / *          bullet, two-space indent
  1.             numbered list (renders with the literal number)
  ```            fenced code block (whole block rendered teal on cream)
  ---            horizontal rule
  blank          paragraph break

No nested constructs, no link rendering — small enough to ship to flash,
big enough to read README-style notes someone sideloaded over BT.
"""

import os
import oreoOS
from oreoOS import api, theme, widgets


SW = api.SCREEN_W
SH = api.SCREEN_H

DOCS_DIRS = (
    "documents",                # ← BT inbox (writable, .md/.txt land here)
    "apps/reader/assets",       # ← bundled / sideloaded via deploy.py
)

PAD_X      = 10
LINE_GAP   = 2
BODY_LINE_H = 10        # 8 px glyph + 2 px gap

# Block styles — heading scales bump the line height.
_HEADING_H = {1: 24, 2: 20, 3: 16}
_HEADING_SCALE = {1: 2, 2: 2, 3: 1}


# ── "how to add" splash content ─────────────────────────────────────────
# Mirrors the gallery's ADD-tile pattern: a scrollable card describing
# both the on-device (BT) and developer (flash) flows for getting .md /
# .txt files onto the badge. Edits here propagate to the in-app help.
_HELP = [
    ("h",    "Send over Bluetooth"),
    ("b",    "From a paired laptop:"),
    ("code", "python tools/bt_send.py"),
    ("code", "         notes.md"),
    ("b",    ".md files arrive as markdown,"),
    ("b",    ".txt files as plain text. Both"),
    ("b",    "land in documents/ on the badge"),
    ("b",    "and show up here automatically."),
    ("b",    "The picker polls at 5 Hz, so the"),
    ("b",    "new file appears without restart."),

    ("h",    "Flash from source"),
    ("b",    "Drop a .md or .txt into"),
    ("code", "apps/reader/assets/"),
    ("b",    "from the repo root, then run:"),
    ("code", "python tools/deploy.py"),
    ("b",    "Bundled files appear with a"),
    ("b",    "leading '*' so you can tell them"),
    ("b",    "apart from BT-arrived inbox items."),

    ("h",    "Markdown support"),
    ("b",    "Headings: # / ## / ###"),
    ("b",    "Inline: **bold** *italic* `code`"),
    ("b",    "Bullets: - or *  (two-space indent)"),
    ("b",    "Numbered: 1. 2. 3."),
    ("b",    "Fenced blocks: ``` ... ```"),
    ("b",    "Horizontal rule: ---"),
    ("b",    "No nested constructs / no links —"),
    ("b",    "small enough to ship to flash."),
]
_HELP_ROW_LABEL = "+ How to add"


def _wrap_help(text, max_chars):
    """Greedy word-wrap for the help splash.

    Splits `text` into a list of lines, each no longer than `max_chars`
    characters. Breaks on whitespace; if a single word is longer than
    `max_chars`, hard-truncates that word across multiple lines (rare —
    only happens on URLs etc., and our _HELP corpus avoids them).
    """
    if max_chars <= 0:
        return [text]
    out  = []
    rest = text.split()
    cur  = ""
    while rest:
        w    = rest[0]
        cand = (cur + " " + w) if cur else w
        if len(cand) <= max_chars:
            cur = cand
            rest.pop(0)
            continue
        if cur:
            out.append(cur)
            cur = ""
            continue
        out.append(w[:max_chars])
        rest[0] = w[max_chars:]
    if cur:
        out.append(cur)
    return out or [""]


# ── picker ──────────────────────────────────────────────────────────────

def _list_docs():
    """Return sorted (display_name, full_path) for every .md / .txt under
    any of DOCS_DIRS. Files bundled in apps/reader/assets are tagged with
    a leading '* ' so the user can tell them apart from BT-arrived inbox
    items. Returns [] when no readable directory exists yet."""
    out  = []
    seen = set()
    for base in DOCS_DIRS:
        try:
            entries = os.listdir(base)
        except OSError:
            continue
        for name in entries:
            low = name.lower()
            if not low.endswith((".md", ".txt", ".mdz", ".txtz")):
                continue
            full = base + "/" + name
            if full in seen:
                continue
            seen.add(full)
            label = name if base == "documents" else ("* " + name)
            out.append((label, full))
    out.sort()
    return out


# ── markdown lexer ──────────────────────────────────────────────────────

def _read_lines(path):
    try:
        if path.lower().endswith((".mdz", ".txtz")):
            import deflate
            import io
            with open(path, "rb") as f:
                head = f.read(8)
                if len(head) != 8 or head[:4] != b"ODZ\x01":
                    return []
                expected = (head[4] | (head[5] << 8) |
                            (head[6] << 16) | (head[7] << 24))
                plain = deflate.DeflateIO(io.BytesIO(f.read())).read()
            if len(plain) != expected:
                return []
            return plain.decode("utf-8").splitlines()
        with open(path) as f:
            return f.read().splitlines()
    except OSError:
        return []


def _classify_block(line, in_code):
    """Single-line block classifier. Returns (kind, payload).

      heading_N  payload = stripped text
      code       payload = raw line (inside a fenced block)
      code_fence payload = None  (the ``` line itself — not rendered)
      bullet     payload = (depth, text)
      hr         payload = None
      blank      payload = None
      para       payload = line
    """
    if line.strip().startswith("```"):
        return ("code_fence", None)
    if in_code:
        return ("code", line)
    stripped = line.strip()
    if stripped == "":
        return ("blank", None)
    if stripped in ("---", "***", "___"):
        return ("hr", None)
    if stripped.startswith("### "):
        return ("heading_3", stripped[4:])
    if stripped.startswith("## "):
        return ("heading_2", stripped[3:])
    if stripped.startswith("# "):
        return ("heading_1", stripped[2:])
    if stripped[:2] in ("- ", "* "):
        return ("bullet", (0, stripped[2:]))
    # crude numbered-list: "<n>. " prefix
    dot = stripped.find(". ")
    if 1 <= dot <= 3 and stripped[:dot].isdigit():
        return ("bullet", (0, stripped[dot + 2:]))
    return ("para", line)


# ── inline parser ───────────────────────────────────────────────────────
# Splits a single line into a list of (text, style) spans.
# style ∈ {"plain","bold","italic","code"}

def _inline_spans(line):
    spans = []
    cur = []
    style = "plain"

    def flush(target_style):
        if cur:
            spans.append(("".join(cur), target_style))
            del cur[:]

    i = 0
    n = len(line)
    while i < n:
        c = line[i]
        # bold (**…**) — must come before italic since '*' is a prefix
        if c == "*" and i + 1 < n and line[i + 1] == "*":
            if style == "bold":
                flush("bold")
                style = "plain"
            else:
                flush(style)
                style = "bold"
            i += 2
            continue
        if c == "*":
            if style == "italic":
                flush("italic")
                style = "plain"
            else:
                flush(style)
                style = "italic"
            i += 1
            continue
        if c == "`":
            if style == "code":
                flush("code")
                style = "plain"
            else:
                flush(style)
                style = "code"
            i += 1
            continue
        cur.append(c)
        i += 1
    flush(style)
    return spans


# ── word-wrap that preserves (text, style) spans ───────────────────────

def _wrap_spans(spans, max_chars):
    """Greedy char-column wrap that keeps style boundaries intact.

    Returns a list of visual lines, each a list of (text, style) spans
    in render order. Honours word boundaries; falls back to a hard
    break when a single token is longer than max_chars.
    """
    if max_chars < 1:
        max_chars = 1
    flat = []
    for text, style in spans:
        for ch in text:
            flat.append((ch, style))
    if not flat:
        return [[]]

    out      = []
    cur      = []   # (char, style) on the current visual line
    word     = []   # (char, style) for the in-progress word

    def _regroup(line_chars):
        """Collapse runs of equal style back into spans for rendering."""
        if not line_chars:
            return []
        spans_ = []
        run_text  = [line_chars[0][0]]
        run_style = line_chars[0][1]
        for ch, st in line_chars[1:]:
            if st == run_style:
                run_text.append(ch)
            else:
                spans_.append(("".join(run_text), run_style))
                run_text, run_style = [ch], st
        spans_.append(("".join(run_text), run_style))
        return spans_

    def _push():
        out.append(_regroup(cur))

    for ch, style in flat:
        if ch == " ":
            # Try to commit the pending word + this space.
            if len(cur) + len(word) + 1 > max_chars:
                # Word doesn't fit: flush the line, the word becomes the
                # new line, and we drop the leading space.
                if cur:
                    _push()
                cur = list(word)
                word = []
                # If the word alone overflows, hard-break it later — for
                # now leave cur as-is so subsequent chars keep wrapping.
            else:
                cur.extend(word)
                cur.append((ch, style))
                word = []
            continue

        word.append((ch, style))
        # Hard break a single token that overflows the line by itself.
        if len(word) >= max_chars and not cur:
            cur = word[:max_chars]
            _push()
            cur = []
            word = word[max_chars:]

    # Flush trailing word.
    if cur and (len(cur) + len(word) > max_chars):
        _push()
        cur = []
    cur.extend(word)
    if cur:
        _push()
    return out if out else [[]]


# ── pre-layout: lex + wrap once at open-time ───────────────────────────
# Each entry in the produced list is a single VISUAL line ready to draw:
#   (kind, payload, height_px)
# where kind ∈
#   heading_1/2/3   payload = text
#   code            payload = raw_line
#   bullet          payload = (spans, show_glyph)   # glyph only on first
#   hr / blank      payload = None
#   para            payload = spans

def _layout(lines):
    out     = []
    in_code = False

    # Effective character widths at the available column width.
    body_cols    = (SW - 2 * PAD_X) // 8           # plain text @ scale 1
    bullet_cols  = (SW - 2 * PAD_X - 10) // 8      # leaves room for glyph
    code_cols    = (SW - 2 * PAD_X) // 8

    for raw in lines:
        kind, payload = _classify_block(raw, in_code)
        if kind == "code_fence":
            in_code = not in_code
            continue

        if kind in ("heading_1", "heading_2", "heading_3"):
            lvl = int(kind[-1])
            # Headings wrap too, but at their scaled column count.
            scale     = _HEADING_SCALE[lvl]
            cols      = (SW - 2 * PAD_X) // (8 * scale)
            text      = payload
            while text:
                out.append((kind, text[:cols], _HEADING_H[lvl]))
                text = text[cols:]
        elif kind == "code":
            # Code lines don't wrap — overlong is clipped to the column
            # count so the bg rect stays tidy.
            out.append(("code", payload[:code_cols], BODY_LINE_H + 2))
        elif kind == "bullet":
            depth, text = payload
            wrapped = _wrap_spans(_inline_spans(text), bullet_cols)
            for i, spans_ in enumerate(wrapped):
                out.append(("bullet", (spans_, i == 0), BODY_LINE_H + 2))
        elif kind == "hr":
            out.append(("hr", None, 12))
        elif kind == "blank":
            out.append(("blank", None, 6))
        else:
            wrapped = _wrap_spans(_inline_spans(payload), body_cols)
            for spans_ in wrapped:
                out.append(("para", spans_, BODY_LINE_H + 2))
    return out


# ── span renderer ───────────────────────────────────────────────────────

_STYLE_COLOR = {
    "plain":  None,
    "bold":   None,
    "italic": None,
    "code":   None,
}

def _style_color(style):
    # Resolved lazily so theme is loaded once.
    if _STYLE_COLOR["plain"] is None:
        _STYLE_COLOR["plain"]  = theme.TEXT_BRIGHT
        _STYLE_COLOR["bold"]   = theme.PRIMARY
        _STYLE_COLOR["italic"] = theme.TEXT_DIM
        _STYLE_COLOR["code"]   = theme.TEAL
    return _STYLE_COLOR[style]


def _draw_spans(d, spans, x, y, scale=1, code_bg=False):
    """Draw pre-wrapped (text, style) spans left-to-right. Spans here
    have already been fit to the available width by `_wrap_spans` —
    this routine just paints, no overflow logic."""
    cw = 8 * scale
    cx = x
    for text, style in spans:
        if not text:
            continue
        color = _style_color(style)
        for ch in text:
            if style == "code" and code_bg:
                d.rect(cx, y - 1, cw, 8 * scale + 2, theme.CARD, fill=True)
            d.text(ch, cx, y, color, scale=scale)
            cx += cw


# ── app ────────────────────────────────────────────────────────────────

class App(oreoOS.App):
    name = "Reader"

    def on_enter(self, os_):
        super().on_enter(os_)
        self._os      = os_
        self._dirty   = True
        self._files   = _list_docs()
        self._sel     = 0
        # First-run UX: with no documents, the picker would be a blank
        # placeholder + "+ How to add" row that requires an extra A
        # press to do anything useful. Skip straight into the help
        # splash so the user sees the BT / flash instructions
        # immediately. B/HOME from the splash drops back to the picker
        # (which by then may have files if a BT transfer landed during
        # the read), so the affordance still exists.
        self._mode    = "help" if not self._files else "picker"
        # view-mode state
        self._title   = ""
        self._blocks  = []
        self._scroll  = 0          # in pixels
        self._total_h = 0
        # help-mode scroll (row index into _HELP, NOT pixels — matches
        # gallery's add-tile scroll model so the rendering math stays
        # straightforward).
        self._help_scroll = 0
        # 5 Hz auto-refresh of the picker — picks up files that land in
        # documents/ while the user is sitting on the list (e.g. a BT
        # transfer completing). Off entirely in view mode.
        self._poll_t  = 0.0
        self._poll_dt = 0.2        # 5 Hz

    def update(self, dt):
        if self._mode != "picker":
            return
        self._poll_t += dt
        if self._poll_t < self._poll_dt:
            return
        self._poll_t = 0.0
        fresh = _list_docs()
        if fresh != self._files:
            # Keep the cursor pointing at the same logical entry when
            # possible — otherwise clamp to the new list bounds.
            prev_path = self._files[self._sel][1] if self._files else None
            self._files = fresh
            new_sel = 0
            for i, (_, path) in enumerate(fresh):
                if path == prev_path:
                    new_sel = i
                    break
            self._sel = min(new_sel, max(0, len(fresh) - 1))
            self._dirty = True

    def on_button_press(self, btn):
        if self._mode == "picker":
            return self._on_btn_picker(btn)
        if self._mode == "help":
            return self._on_btn_help(btn)
        return self._on_btn_view(btn)

    # ── picker input ────────────────────────────────────────────────────
    def _on_btn_picker(self, btn):
        # The picker always shows a trailing "+ How to add" row, so the
        # total selectable count is len(files) + 1. Selecting the help
        # row + A opens the splash; selecting a real row + A opens the
        # document. UP/DOWN wraps over the whole list including help.
        n = len(self._files)
        total = n + 1
        if btn == api.BTN_HOME:
            self._os.quit()
            return
        if btn == api.BTN_A:
            if self._sel == n:
                self._open_help()
            else:
                self._open(self._files[self._sel])
            return
        if btn == api.BTN_UP:
            self._sel = (self._sel - 1) % total
        elif btn == api.BTN_DOWN:
            self._sel = (self._sel + 1) % total
        else:
            return
        self._dirty = True

    # ── help input ──────────────────────────────────────────────────────
    def _on_btn_help(self, btn):
        if btn == api.BTN_B or btn == api.BTN_HOME:
            self._mode  = "picker"
            self._files = _list_docs()
            self._dirty = True
            return
        if btn == api.BTN_UP:
            self._help_scroll = max(0, self._help_scroll - 1)
        elif btn == api.BTN_DOWN:
            self._help_scroll = min(max(0, len(_HELP) - 1),
                                    self._help_scroll + 1)
        else:
            return
        self._dirty = True

    def _open_help(self):
        self._mode        = "help"
        self._help_scroll = 0
        self._dirty       = True

    # ── view input ──────────────────────────────────────────────────────
    def _on_btn_view(self, btn):
        if btn == api.BTN_B or btn == api.BTN_HOME:
            self._mode  = "picker"
            self._files = _list_docs()
            self._dirty = True
            return
        if btn == api.BTN_UP:
            self._scroll = max(0, self._scroll - BODY_LINE_H * 2)
        elif btn == api.BTN_DOWN:
            play_h = SH - widgets.HEADER_H - widgets.HINT_H
            max_scroll = max(0, self._total_h - play_h + 8)
            self._scroll = min(max_scroll, self._scroll + BODY_LINE_H * 2)
        else:
            return
        self._dirty = True

    # ── open a file ─────────────────────────────────────────────────────
    def _open(self, entry):
        name, path = entry
        self._title  = name
        self._blocks = _layout(_read_lines(path))
        self._total_h = sum(b[2] for b in self._blocks)
        self._scroll  = 0
        self._mode    = "view"
        self._dirty   = True

    # ── render ──────────────────────────────────────────────────────────
    def draw(self, d):
        if not self._dirty:
            return
        self._dirty = False
        d.clear(theme.BG)
        if self._mode == "picker":
            self._draw_picker(d)
        elif self._mode == "help":
            self._draw_help(d)
        else:
            self._draw_view(d)

    def _draw_picker(self, d):
        widgets.draw_header(d, "READER")
        widgets.draw_hint(d, "A=open  HOME=back")

        row_h = 20
        top_y = widgets.HEADER_H + 6

        # Real document rows.
        for i, (name, _) in enumerate(self._files):
            y = top_y + i * row_h
            if y + row_h > SH - widgets.HINT_H:
                break
            sel = (i == self._sel)
            if sel:
                d.rect(6, y, SW - 12, row_h - 2,
                       theme.DOCK_SEL, fill=True)
            color = theme.TEXT_BRIGHT if sel else theme.TEXT_DIM
            d.text(name[:34], 12, y + 6, color, scale=1)

        # Trailing "+ How to add" row — always rendered, always
        # selectable, so the user discovers the splash even when the
        # documents/ directory has real files in it.
        help_idx = len(self._files)
        y = top_y + help_idx * row_h
        if y + row_h <= SH - widgets.HINT_H:
            sel = (self._sel == help_idx)
            if sel:
                d.rect(6, y, SW - 12, row_h - 2,
                       theme.DOCK_SEL, fill=True)
            color = theme.PRIMARY if sel else theme.GOLD
            d.text(_HELP_ROW_LABEL, 12, y + 6, color, scale=1)

        # When the directory is empty point the user at the help row so
        # the next step is obvious — "no documents" alone was a dead end.
        if not self._files:
            msg = "no documents yet"
            d.text(msg, (SW - len(msg) * 8) // 2,
                   SH // 2 - 4, theme.MUTED, scale=1)
            d.text("press A on '+ How to add'",
                   (SW - 24 * 8) // 2, SH // 2 + 10, theme.MUTED2, scale=1)

    # ── help splash ─────────────────────────────────────────────────────
    def _draw_help(self, d):
        widgets.draw_header(d, "ADD A DOC")
        widgets.draw_hint(d, "UP/DOWN=scroll  B=back")

        # Cream card filling the play area — matches the gallery splash
        # so the two how-to screens feel like one family.
        card_x = 10
        card_y = widgets.HEADER_H + 4
        card_w = SW - 20
        card_h = SH - widgets.HEADER_H - widgets.HINT_H - 8
        d.rect(card_x + 2, card_y + 2, card_w, card_h, theme.MUTED2, fill=True)
        d.rect(card_x,     card_y,     card_w, card_h, theme.CARD,   fill=True)
        d.rect(card_x,     card_y,     card_w, 3,      theme.PRIMARY, fill=True)

        # Pink "+" badge + heading.
        bx, by, bsz = card_x + 10, card_y + 10, 32
        d.rect(bx, by, bsz, bsz, theme.PRIMARY, fill=True)
        d.rect(bx + bsz // 2 - 2, by + 5,            4, bsz - 10, api.WHITE, fill=True)
        d.rect(bx + 5,            by + bsz // 2 - 2, bsz - 10, 4, api.WHITE, fill=True)
        d.text("Add a doc",   bx + bsz + 10, by + 2,  theme.PRIMARY, scale=2)
        d.text("BT or flash", bx + bsz + 10, by + 22, theme.MUTED)

        # Scrollable instruction rows. Uniform scale=1 across headings,
        # bullets and code so all three feel like one body of text;
        # visual hierarchy comes from colour + a gold underline on
        # headings + tinted background on code, not from font size.
        # Word-wrap is kept as a safety net for future long entries.
        text_x   = card_x + 12
        inner_w  = card_w - 24
        list_y   = card_y + 10 + bsz + 12
        list_bot = card_y + card_h - 8

        LINE_H  = 12   # uniform line height (8 px glyph + 4 px gap)
        ROW_GAP = 6    # extra space BETWEEN sibling rows of any kind

        # 12 px gutter on the bullet line for the dot.
        max_h_chars = inner_w // 8
        max_b_chars = (inner_w - 12) // 8
        max_c_chars = (inner_w - 12) // 8

        rows = _HELP[self._help_scroll:]
        cur_y = list_y
        rendered = 0
        for kind, payload in rows:
            if kind == "h":
                lines = _wrap_help(payload, max_h_chars)
                block_h = len(lines) * LINE_H + 4
                if cur_y + block_h > list_bot:
                    break
                if rendered > 0:
                    cur_y += ROW_GAP
                for line in lines:
                    d.text(line, text_x, cur_y, theme.PRIMARY, scale=1)
                    cur_y += LINE_H
                # Gold underline beneath the last wrapped line, matching
                # its width — the heading's only "visual heft" at this
                # uniform size.
                last_w = len(lines[-1]) * 8
                d.rect(text_x, cur_y - 2, last_w, 1, theme.GOLD, fill=True)
            elif kind == "b":
                lines = _wrap_help(payload, max_b_chars)
                block_h = len(lines) * LINE_H + 2
                if cur_y + block_h > list_bot:
                    break
                # Pink dot on the first line; wrapped lines indent flush
                # with the first line's text.
                d.rect(text_x + 2, cur_y + 3, 3, 3, theme.PRIMARY, fill=True)
                for line in lines:
                    d.text(line, text_x + 10, cur_y,
                           theme.TEXT_BRIGHT, scale=1)
                    cur_y += LINE_H
            elif kind == "code":
                truncated = payload[:max_c_chars]
                if cur_y + LINE_H > list_bot:
                    break
                d.rect(text_x + 4, cur_y - 1, inner_w - 8, LINE_H,
                       theme.DOCK_SEL, fill=True)
                d.text(truncated, text_x + 8, cur_y + 1,
                       theme.TEAL, scale=1)
                cur_y += LINE_H + 1
            rendered += 1

        # Scroll arrows on the right edge.
        sx = card_x + card_w - 14
        if self._help_scroll > 0:
            d.text("^", sx, list_y - 12, theme.PRIMARY, scale=2)
        if self._help_scroll + rendered < len(_HELP):
            d.text("v", sx, list_bot - 12, theme.PRIMARY, scale=2)

    def _draw_view(self, d):
        widgets.draw_header(d, self._title[:18])
        widgets.draw_hint(d, "UP/DOWN=scroll  B=back")

        play_top = widgets.HEADER_H + 4
        play_h   = SH - widgets.HEADER_H - widgets.HINT_H - 4
        # Vertical clip: walk blocks, skip those above scroll, draw those
        # inside the viewport, stop once we've gone past the bottom.
        y_cursor = -self._scroll
        for kind, payload, h in self._blocks:
            top = play_top + y_cursor
            bot = top + h
            if bot < play_top:
                y_cursor += h
                continue
            if top > play_top + play_h:
                break

            if kind == "blank":
                pass
            elif kind == "hr":
                d.rect(PAD_X, top + 5, SW - 2 * PAD_X, 1,
                       theme.MUTED, fill=True)
            elif kind in ("heading_1", "heading_2", "heading_3"):
                lvl = int(kind[-1])
                scale = _HEADING_SCALE[lvl]
                color = theme.PRIMARY if lvl == 1 else theme.TEXT_BRIGHT
                d.text(payload, PAD_X, top + 2, color, scale=scale)
            elif kind == "code":
                d.rect(PAD_X - 2, top, SW - 2 * PAD_X + 4, h,
                       theme.CARD, fill=True)
                d.text(payload, PAD_X, top + 1, theme.TEAL, scale=1)
            elif kind == "bullet":
                spans_, show_glyph = payload
                bx = PAD_X
                if show_glyph:
                    d.text("\xb7", bx, top + 1, theme.PRIMARY, scale=1)
                _draw_spans(d, spans_, bx + 10, top + 1,
                            scale=1, code_bg=True)
            else:    # para
                _draw_spans(d, payload, PAD_X, top + 1,
                            scale=1, code_bg=True)

            y_cursor += h

        # Right-edge scroll thumb when content overflows.
        if self._total_h > play_h:
            track_x = SW - 3
            track_y = play_top
            track_h = play_h
            thumb_h = max(12, int(track_h * play_h / self._total_h))
            max_scroll = max(1, self._total_h - play_h)
            thumb_y = track_y + (track_h - thumb_h) * self._scroll // max_scroll
            d.rect(track_x, thumb_y, 2, thumb_h, theme.PRIMARY, fill=True)
