"""On-screen BLE pair-confirm overlay.

Renders a full-screen "Confirm pairing?" prompt the moment the BLE
stack hands us an SMP Numeric Comparison request. The 6-digit code
shown here is the same one the peer (phone / laptop / tablet) shows
on its own screen — the user reads both, confirms they match, and
taps A to accept or B to reject.

The overlay is OS-global, like the notification panel: it's rendered
over whatever app is on screen, and it captures all input while
active. The launcher run loop ticks + draws it every frame and routes
button presses to `handle_button()` when `is_active()` is True.

State flow:
    idle → (peripheral_pair fires) → active
    active → user A → accept → idle
    active → user B → reject  → idle
    active → peer drops link  → idle (cancel)
"""

from oreoOS import api, theme


def get(os_obj):
    """Singleton accessor — same pattern as notif_panel."""
    pp = getattr(os_obj, "_pair_prompt_ui", None)
    if pp is not None:
        return pp
    pp = PairPrompt(os_obj)
    try:
        os_obj._pair_prompt_ui = pp
    except Exception:
        pass
    return pp


class PairPrompt:
    """Frame-driven overlay. Holds no state of its own — the SMP
    prompt lives inside oreoWare.bt and we just mirror it visually."""

    def __init__(self, os_obj):
        self._os    = os_obj
        # Cached last-seen prompt dict so a transient peek-failure
        # doesn't flicker the overlay off mid-prompt.
        self._last  = None
        self._dirty = True

    # ── module-edge polling ─────────────────────────────────────────────
    def tick(self):
        """Re-read the SMP state from bt.py. Called from the OS run loop."""
        try:
            from oreoWare import bt
            live = bt.peek_pair_prompt()
        except Exception:
            live = None
        if live is None and self._last is not None:
            self._last  = None
            self._dirty = True
        elif live is not None and self._last is not live:
            self._last  = live
            self._dirty = True

    def is_active(self):
        return self._last is not None

    # ── input routing ───────────────────────────────────────────────────
    def handle_button(self, btn):
        """Routed from the run loop when is_active() is True. Returns
        True iff the button was consumed."""
        if self._last is None:
            return False
        if btn == api.BTN_A:
            try:
                from oreoWare import bt
                bt.accept_pair_prompt()
            except Exception:
                pass
            self._last  = None
            self._dirty = True
            return True
        if btn in (api.BTN_B, api.BTN_HOME):
            try:
                from oreoWare import bt
                bt.reject_pair_prompt()
            except Exception:
                pass
            self._last  = None
            self._dirty = True
            return True
        return True   # swallow other buttons so the app behind doesn't see them

    # ── render ──────────────────────────────────────────────────────────
    def draw(self, d):
        if self._last is None:
            return
        SW = api.SCREEN_W
        SH = api.SCREEN_H

        # Dim the screen behind the prompt so the user can't possibly
        # miss it. Fill, then draw a centered card.
        d.rect(0, 0, SW, SH, theme.BG, fill=True)

        card_w = SW - 24
        card_h = 200
        card_x = 12
        card_y = (SH - card_h) // 2
        d.rect(card_x, card_y, card_w, card_h, theme.CARD, fill=True)
        d.rect(card_x, card_y, card_w, 3, theme.PRIMARY, fill=True)
        d.rect(card_x, card_y + card_h - 3, card_w, 3, theme.PRIMARY, fill=True)

        # Heading
        title = "Confirm pairing?"
        tw = len(title) * 16
        d.text(title, card_x + (card_w - tw) // 2,
               card_y + 16, theme.TEXT_BRIGHT, scale=2)

        # Sub-heading
        sub = "Does this code match your phone?"
        sw = len(sub) * 8
        d.text(sub, card_x + (card_w - sw) // 2,
               card_y + 46, theme.TEXT_DIM, scale=1)

        # The 6-digit code, big and centered.
        code = "%06d" % int(self._last.get("passkey", 0))
        cw = len(code) * 32
        d.text(code, card_x + (card_w - cw) // 2,
               card_y + 78, theme.PRIMARY, scale=4)

        # Footer actions.
        foot_y = card_y + card_h - 36
        d.text("A=YES  match",  card_x + 14, foot_y,      theme.PRIMARY,  scale=1)
        d.text("B=NO   reject", card_x + 14, foot_y + 14, theme.MUTED,    scale=1)
        self._dirty = False
