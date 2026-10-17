"""Oreo Badge — unified colour theme.

This is a CELEBRATION badge — warm, festive, vibrant. NOT dark mode.

Mascot reference palette:
  White fur     rgb(240, 238, 232)  — warm cream white
  Cheek pink    rgb(255,  93, 104)  — blush / primary accent
  Badge red     rgb(220,  60,  50)  — E-badge
  Dark outline  rgb(38,   38,  48)  — panda shadow patches

Background is a warm ivory/cream — feels like a party invitation, not a terminal.
"""

from oreoOS import api

# ── raw RGB triplets (for PIL / math) ─────────────────────────────────────────

BG_R,      BG_G,      BG_B      = 255, 248, 235   # warm ivory cream
CARD_R,    CARD_G,    CARD_B    = 255, 240, 210   # slightly deeper cream card
PRIMARY_R, PRIMARY_G, PRIMARY_B = 255,  93, 104   # panda cheek pink — main accent
TEAL_R,    TEAL_G,    TEAL_B    = 0,   180, 165   # festive teal
GOLD_R,    GOLD_G,    GOLD_B    = 255, 190,  30   # celebration gold
FUR_R,     FUR_G,     FUR_B     = 38,   38,  48   # dark panda outline (text on light bg)
MUTED_R,   MUTED_G,   MUTED_B  = 160, 120, 100   # warm muted brown-pink
DARK_R,    DARK_G,    DARK_B    = 38,   38,  48   # deep dark for high-contrast text

# ── RGB565 values ─────────────────────────────────────────────────────────────

BG           = api.rgb(BG_R,      BG_G,      BG_B)        # warm ivory
CARD         = api.rgb(CARD_R,    CARD_G,    CARD_B)      # cream card surface
PRIMARY      = api.rgb(PRIMARY_R, PRIMARY_G, PRIMARY_B)   # pink
TEAL         = api.rgb(TEAL_R,    TEAL_G,    TEAL_B)      # teal
GOLD         = api.rgb(GOLD_R,    GOLD_G,    GOLD_B)      # gold
TEXT_BRIGHT  = api.rgb(DARK_R,    DARK_G,    DARK_B)      # dark text on light bg
TEXT_DIM     = api.rgb(100, 80, 70)                       # dimmer body text
MUTED        = api.rgb(MUTED_R,   MUTED_G,   MUTED_B)     # warm muted labels
MUTED2       = api.rgb(200, 160, 140)                     # very dim
STATUS_BG    = api.rgb(255, 93, 104)                      # pink status bar
DOCK_BG      = api.rgb(255, 240, 210)                     # cream dock
DOCK_SEL     = api.rgb(255, 220, 180)                     # selection fill
SEL_BORDER   = api.rgb(255, 93, 104)                      # selection border pink
ORANGE       = api.rgb(255, 140,  30)                     # festive orange
PURPLE       = api.rgb(180,  80, 220)                     # festive purple
GREEN        = api.rgb(60,  200, 100)                     # celebration green
