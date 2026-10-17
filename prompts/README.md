# Asset Prompts

Each `.md` file in this folder defines one asset for the Oreo Badge.

## How to generate an asset

1. Edit the prompt in `prompts/<asset_name>.md` (use [THEME.md](THEME.md) for colour reference)
2. Uncomment (or add) the matching entry in `tools/generate_assets.py` ACTIVE dict
3. Run: `python tools/generate_assets.py <asset_name>`
4. Run: `python tools/optimize_assets.py <asset_name>`
5. The asset is now in `assets/icons/<asset_name>.py` and ready to load

## Naming conventions

| Suffix | Output size | Usage |
|--------|-------------|-------|
| `_icon` | 32×32 px | App grid icons, dock icons |
| `_bg`   | 80×60 px  | Full-screen backgrounds (4× upscaled to 320×240) |
| (other) | 32×32 px  | Default icon size |

## Theme reference

All assets must use the panda mascot colour palette (see `oreoOS/theme.py`):
- Background dark: rgb(14, 12, 20)
- Primary pink: rgb(255, 93, 104)
- Teal accent: rgb(0, 180, 165)
- Gold accent: rgb(255, 200, 60)
- Fur/text white: rgb(220, 215, 210)
