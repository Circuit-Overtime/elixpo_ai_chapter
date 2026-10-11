def _load_env():
    env = {}
    for fname in (".env", ".env.local"):
        try:
            with open(fname) as f:
                text = f.read()
        except OSError:
            continue
        for line in text.splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip()
    return env

_env = _load_env()

# OS version. tools/deploy.py auto-bumps the PATCH number on every push.
# The literal MUST stay on its own line as `VERSION = "vN.N.N"` — the
# deploy regex relies on that exact format to rewrite in place.
VERSION           = "v1.4.126"
# ISO-date stamp of the current VERSION. Updated by tools/release.py
# (or by hand for hot-fix builds). Shown on the Updates page as the
# "Latest stable as of …" line when no newer release is available.
RELEASE_DATE      = "2026-05-16"

GITHUB_USER       = "Circuit-Overtime"
DISPLAY_NAME      = "Ayushman Bhattacharya"
DESIGNATION       = "OSS Maintainer @pollinations"
WEATHER_LAT       = 22.57
WEATHER_LON       = 88.36
WEATHER_NAME      = ""
BT_AUTO_ENABLE    = False
TIMEZONE_OFFSET   = 5.5

def _split_csv(s):
    """Comma-separated env value → trimmed list. Empty entries dropped."""
    return [p.strip() for p in (s or "").split(",") if p.strip()]


# WIFI_SSID and WIFI_PASSWORD in .env are now CSV lists — parallel
# arrays. Example .env:
#     WIFI_SSID=home_net,elixpo_srv,office
#     WIFI_PASSWORD=homepass,srvpass,officepass
#
# WIFI_SSIDS / WIFI_PASSWORDS are the full lists. The singular
# WIFI_SSID / WIFI_PASSWORD constants below are the FIRST entry —
# kept for backward compatibility with any older code that read them
# directly. Boot-time wifi.py uses WIFI_NETWORKS (computed from
# both lists) and merges into /wifi.json on every boot.
WIFI_SSIDS        = _split_csv(_env.get("WIFI_SSID",     ""))
WIFI_PASSWORDS    = _split_csv(_env.get("WIFI_PASSWORD", ""))
WIFI_SSID         = WIFI_SSIDS[0]      if WIFI_SSIDS     else ""
WIFI_PASSWORD     = WIFI_PASSWORDS[0]  if WIFI_PASSWORDS else ""

# Zip into a list of network dicts. Priority is the .env order:
# first entry wins (priority=1), next is priority=2, etc. If the two
# lists are different lengths the extra SSIDs get an empty password
# (open network) and extra passwords are dropped.
WIFI_NETWORKS = []
for _i, _ssid in enumerate(WIFI_SSIDS):
    _pw = WIFI_PASSWORDS[_i] if _i < len(WIFI_PASSWORDS) else ""
    WIFI_NETWORKS.append({
        "ssid":     _ssid,
        "password": _pw,
        "priority": _i + 1,
        "metered":  False,
    })

OWM_API_KEY       = _env.get("OWM_API_KEY", "")
GH_TOKEN          = _env.get("GH_TOKEN", "")

WIFI_AUTO_CONNECT = True
WIFI_TX_DBM       = 11
WIFI_POWERSAVE    = True
BT_ADV_INTERVAL_MS = 500
APP_CATEGORIES = (
    ("Games",  "cat_games",  ("flappy", "snake", "racer", "pet")),
    ("GitHub", "cat_github", ("badge",  "identity", "commits")),
    ("Utils",  "cat_utils",  ("weather",)),
    ("Tools",  "cat_tools",  ("gallery", "color_picker", "gamepad", "quest")),
    ("System", "cat_system", ("settings", "about")),
)
