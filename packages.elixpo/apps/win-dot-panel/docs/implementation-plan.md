# Win Dot Panel

## Agent-Ready Implementation Plan

This is the original design plan. For current installation and update commands, use the [README](../README.md) and [APT repository guide](../../../docs/apt-repository.md).

**Working concept:** A lightweight Linux equivalent of the Windows `Win + .` panel, focused on GNOME and KDE Plasma.

**Primary stack:** Python + PySide6 + SQLite

**Target desktops:**  
- GNOME
- KDE Plasma

**Initial display systems:**  
- Wayland-first
- X11 fallback where practical

**Shortcut philosophy:**  
The application will **not attempt to own or globally register `Super + .` itself**.

Instead, it will expose a simple executable command such as:

```bash
win-dot-panel toggle
```

The user configures that command as a custom keyboard shortcut from:

- GNOME Settings → Keyboard → Custom Shortcuts
- KDE System Settings → Keyboard → Shortcuts / Custom Shortcuts

This makes the shortcut implementation desktop-native, predictable, permission-safe, and easy to customize.

---

# 1. Product Goal

Build a small background Linux application that provides a polished floating panel containing:

1. Emoji picker
2. Clipboard history
3. Kaomoji
4. Unicode / symbols
5. Search
6. Recently used items
7. Pinned clipboard entries

The user should be able to trigger the panel from anywhere using a desktop-configured keyboard shortcut.

Typical flow:

```text
User presses Super + .
        │
        ▼
GNOME / KDE executes:
win-dot-panel toggle
        │
        ▼
Background daemon receives request
        │
        ▼
Floating PySide6 panel opens
        │
        ├── Emoji
        ├── Clipboard
        ├── Kaomoji
        └── Symbols
```

The application must remain lightweight while idle.

---

# 2. Design Principles

The implementation must follow these principles.

## 2.1 Lightweight

Avoid:

- polling loops
- Electron
- browser-based UI
- unnecessary background workers
- loading the entire clipboard history into memory
- loading every emoji widget at startup
- network dependencies for core functionality

Prefer:

- event-driven clipboard tracking
- SQLite
- lazy rendering
- cached search indexes
- one persistent daemon
- a very small CLI IPC client

---

## 2.2 Native Desktop Integration

Do not attempt to bypass GNOME or KDE global-shortcut restrictions.

Expose CLI commands and let the desktop environment bind them.

Example:

```bash
win-dot-panel toggle
win-dot-panel show
win-dot-panel hide
```

Recommended user shortcut:

```text
Super + .
```

Alternative:

```text
Super + ;
```

---

## 2.3 Wayland Friendly

Wayland intentionally restricts:

- global keyboard hooks
- fake keyboard input
- arbitrary application focus manipulation
- clipboard access in some environments

The design should avoid depending on hacks that may break between compositors.

---

## 2.4 Modular

All platform-sensitive functionality must live behind interfaces.

Do not mix GNOME/KDE/Wayland/X11 code into UI components.

---

# 3. Initial Scope

## V1 Required Features

### Panel

- frameless floating popup
- rounded modern UI
- keyboard navigable
- search field focused automatically
- Escape closes panel
- click outside / focus loss closes panel
- remembers last selected tab
- light and dark theme support
- GNOME/KDE friendly

### Emoji

- local emoji database
- search by name
- search by keyword
- categories
- recently used
- copy emoji to clipboard

### Clipboard

- text clipboard history
- duplicate detection
- pinned entries
- delete single entry
- clear history
- configurable history limit
- copy selected item back to clipboard

### Background Process

- starts with user session
- monitors clipboard
- owns SQLite database connection
- exposes IPC socket
- launches panel when requested

### CLI

```bash
win-dot-panel toggle
win-dot-panel show
win-dot-panel hide
win-dot-panel status
win-dot-panel quit
```

---

# 4. Future Scope

Do not implement these until V1 is stable.

## V2

- image clipboard history
- file clipboard history
- HTML clipboard
- syntax-aware previews
- configurable ignored applications
- sensitive clipboard detection
- clipboard retention rules

## V3

- snippets
- custom symbol collections
- GIF integration
- stickers
- clipboard synchronization
- plugin API
- optional direct paste
- user-created categories
- extension API

---

# 5. Recommended Repository Structure

```text
win-dot-panel/
│
├── README.md
├── LICENSE
├── pyproject.toml
├── requirements.txt
│
├── src/
│   └── win_dot_panel/
│       │
│       ├── __init__.py
│       ├── __main__.py
│       │
│       ├── app.py
│       ├── daemon.py
│       ├── cli.py
│       ├── config.py
│       ├── constants.py
│       │
│       ├── ipc/
│       │   ├── __init__.py
│       │   ├── server.py
│       │   ├── client.py
│       │   └── protocol.py
│       │
│       ├── ui/
│       │   ├── __init__.py
│       │   ├── popup.py
│       │   ├── search_bar.py
│       │   ├── navigation.py
│       │   ├── theme.py
│       │   │
│       │   ├── pages/
│       │   │   ├── emoji_page.py
│       │   │   ├── clipboard_page.py
│       │   │   ├── kaomoji_page.py
│       │   │   └── symbols_page.py
│       │   │
│       │   └── widgets/
│       │       ├── emoji_button.py
│       │       ├── clipboard_item.py
│       │       ├── section_header.py
│       │       └── empty_state.py
│       │
│       ├── clipboard/
│       │   ├── __init__.py
│       │   ├── manager.py
│       │   ├── models.py
│       │   ├── hashing.py
│       │   │
│       │   └── backends/
│       │       ├── base.py
│       │       ├── wayland.py
│       │       └── x11.py
│       │
│       ├── emoji/
│       │   ├── __init__.py
│       │   ├── repository.py
│       │   ├── search.py
│       │   ├── models.py
│       │   └── importer.py
│       │
│       ├── storage/
│       │   ├── __init__.py
│       │   ├── database.py
│       │   ├── schema.sql
│       │   ├── migrations.py
│       │   └── repositories/
│       │       ├── clipboard_repository.py
│       │       ├── emoji_repository.py
│       │       └── settings_repository.py
│       │
│       ├── desktop/
│       │   ├── __init__.py
│       │   ├── environment.py
│       │   ├── autostart.py
│       │   └── integration.py
│       │
│       └── resources/
│           ├── emoji.json
│           ├── kaomoji.json
│           └── symbols.json
│
├── packaging/
│   ├── win-dot-panel.desktop
│   ├── win-dot-panel.service
│   └── icons/
│
├── scripts/
│   ├── dev-run.sh
│   ├── build-emoji-db.py
│   └── install-local.sh
│
└── tests/
    ├── test_clipboard.py
    ├── test_database.py
    ├── test_emoji_search.py
    ├── test_ipc.py
    └── test_config.py
```

---

# 6. Runtime Architecture

Use one persistent daemon.

```text
                 GNOME / KDE Keyboard Shortcut
                            │
                            │ executes
                            ▼
                 win-dot-panel toggle
                            │
                            ▼
                   Small CLI process
                            │
                     Unix socket IPC
                            │
                            ▼
┌────────────────────────────────────────────────────┐
│                win-dot-panel daemon              │
│                                                    │
│  ┌──────────────┐       ┌──────────────────────┐   │
│  │ IPC Server   │       │ Clipboard Manager    │   │
│  └──────┬───────┘       └──────────┬───────────┘   │
│         │                           │               │
│         │                           ▼               │
│         │                    Clipboard Backend     │
│         │                    Wayland / X11         │
│         │                                           │
│         ▼                                           │
│  ┌──────────────────────────────────────────────┐   │
│  │                PySide6 Popup                 │   │
│  │                                              │   │
│  │ Emoji | Clipboard | Kaomoji | Symbols       │   │
│  └─────────────────────┬────────────────────────┘   │
│                        │                            │
│                        ▼                            │
│                     SQLite                         │
└────────────────────────────────────────────────────┘
```

---

# 7. Why Use CLI + IPC

Do not start a second GUI process every time the shortcut is pressed.

This would be slower:

```text
Super + .
   ↓
start Python
   ↓
import PySide6
   ↓
open DB
   ↓
load UI
```

Instead:

```text
Super + .
   ↓
win-dot-panel toggle
   ↓
send ~small IPC message
   ↓
existing daemon shows window
```

Expected perceived latency should be nearly instantaneous.

---

# 8. IPC Design

Use a Unix domain socket.

Suggested location:

```text
$XDG_RUNTIME_DIR/win-dot-panel.sock
```

Example:

```text
/run/user/1000/win-dot-panel.sock
```

Commands:

```json
{"command":"toggle"}
{"command":"show"}
{"command":"hide"}
{"command":"status"}
{"command":"quit"}
```

Response:

```json
{"ok":true}
```

Do not expose TCP ports.

---

# 9. CLI Behaviour

## Command

```bash
win-dot-panel toggle
```

Algorithm:

```text
1. Check for daemon socket.
2. If socket exists:
      send toggle.
3. If socket does not exist:
      start daemon.
      wait briefly for socket.
      send show.
```

Therefore the desktop shortcut works even if autostart failed.

---

# 10. GNOME Shortcut Integration

The application itself should not programmatically force a GNOME shortcut.

User installation instructions:

```text
Settings
  ↓
Keyboard
  ↓
View and Customize Shortcuts
  ↓
Custom Shortcuts
  ↓
Add Shortcut
```

Name:

```text
Emoji & Clipboard Panel
```

Command:

```bash
win-dot-panel toggle
```

Shortcut:

```text
Super + .
```

If GNOME reports a conflict, allow the user to select another combination.

The app should optionally show these setup instructions on first launch.

---

# 11. KDE Plasma Shortcut Integration

Use KDE's native keyboard shortcut configuration.

User adds:

```text
Name:
Emoji & Clipboard Panel

Command:
win-dot-panel toggle

Shortcut:
Super + .
```

Do not rely on GNOME-specific mechanisms inside application code.

---

# 12. Desktop Detection

Detect environment using variables such as:

```text
XDG_CURRENT_DESKTOP
XDG_SESSION_DESKTOP
XDG_SESSION_TYPE
WAYLAND_DISPLAY
DISPLAY
```

Normalize values.

Example result:

```python
DesktopEnvironment(
    desktop="gnome",
    session_type="wayland"
)
```

or:

```python
DesktopEnvironment(
    desktop="kde",
    session_type="wayland"
)
```

Use this information only where necessary.

The main UI must remain desktop-independent.

---

# 13. Clipboard Backend

Define:

```python
class ClipboardBackend:
    def start(self): ...
    def stop(self): ...
    def get_text(self): ...
    def set_text(self, text: str): ...
```

Implement:

```text
WaylandClipboardBackend
X11ClipboardBackend
```

The manager should expose events:

```python
clipboard_changed(content)
```

---

# 14. Wayland Clipboard

Preferred initial strategy:

```text
wl-paste --watch
```

Do not repeatedly execute:

```text
wl-paste
```

from a polling timer.

Use the watch process as a persistent event source.

Concept:

```text
wl-paste --watch <internal callback command>
```

Alternative implementation:

spawn one persistent watcher and react whenever it signals clipboard changes.

Keep Wayland integration isolated inside:

```text
clipboard/backends/wayland.py
```

---

# 15. X11 Clipboard

For X11 support, implement using either:

- Qt clipboard events
- XFixes
- a small dedicated backend

Prefer the least dependency-heavy stable solution.

Do not make X11 logic affect Wayland operation.

---

# 16. Clipboard Capture Pipeline

```text
Clipboard changes
       │
       ▼
Read MIME / text
       │
       ▼
Validate
       │
       ▼
Normalize text
       │
       ▼
Generate SHA-256
       │
       ▼
Check database
       │
       ├── New
       │      ↓
       │   INSERT
       │
       └── Existing
              ↓
           UPDATE timestamp
       │
       ▼
Apply retention limit
```

---

# 17. Clipboard Safety

V1 should include basic protections.

Never store:

- empty clipboard contents
- excessively large text blobs
- unsupported binary data
- content explicitly marked sensitive where detection is available

Recommended max text item:

```text
1 MiB
```

Configurable later.

Future versions should support ignore lists for applications such as password managers.

---

# 18. Clipboard Loop Prevention

When the user selects an old item:

```text
Database item
   ↓
set clipboard
   ↓
clipboard change event
```

This must not create a duplicate entry.

Use content hashing.

Example:

```python
hash = sha256(normalized_content)
```

If the most recent item has the same hash:

```text
update last_used
```

instead of inserting.

---

# 19. SQLite Database

Recommended path:

```text
$XDG_DATA_HOME/win-dot-panel/panel.db
```

Fallback:

```text
~/.local/share/win-dot-panel/panel.db
```

---

# 20. Clipboard Schema

```sql
CREATE TABLE clipboard_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    content_type TEXT NOT NULL DEFAULT 'text',

    text_content TEXT,

    content_hash TEXT NOT NULL UNIQUE,

    created_at INTEGER NOT NULL,

    last_used_at INTEGER NOT NULL,

    use_count INTEGER NOT NULL DEFAULT 1,

    is_pinned INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_clipboard_last_used
ON clipboard_items(last_used_at DESC);

CREATE INDEX idx_clipboard_pinned
ON clipboard_items(is_pinned);
```

---

# 21. Emoji Schema

```sql
CREATE TABLE emoji (
    id INTEGER PRIMARY KEY,

    emoji TEXT NOT NULL UNIQUE,

    name TEXT NOT NULL,

    category TEXT,

    subcategory TEXT,

    keywords TEXT,

    sort_order INTEGER DEFAULT 0
);
```

Usage:

```sql
CREATE TABLE emoji_usage (
    emoji_id INTEGER PRIMARY KEY,

    use_count INTEGER NOT NULL DEFAULT 0,

    last_used_at INTEGER,

    FOREIGN KEY(emoji_id)
        REFERENCES emoji(id)
);
```

---

# 22. FTS5 Search

Create an FTS table:

```sql
CREATE VIRTUAL TABLE emoji_search USING fts5(
    emoji,
    name,
    keywords
);
```

Search:

```text
fire
developer
laugh
heart
computer
rocket
```

should return relevant emojis immediately.

---

# 23. Emoji Dataset

Core emoji data should be bundled locally.

Do not require an API.

Resources:

```text
resources/emoji.json
resources/kaomoji.json
resources/symbols.json
```

The build script should convert source Unicode data into the optimized SQLite representation.

---

# 24. UI Layout

Suggested design:

```text
┌──────────────────────────────────────────────┐
│ Search emoji, clipboard, symbols...          │
├──────────────────────────────────────────────┤
│                                              │
│  😀 Emoji   📋 Clipboard   :-)   Ω           │
│                                              │
├──────────────────────────────────────────────┤
│                                              │
│              PAGE CONTENT                    │
│                                              │
│                                              │
├──────────────────────────────────────────────┤
│ ↑ ↓ navigate   Enter select   Esc close      │
└──────────────────────────────────────────────┘
```

Approximate default width:

```text
480 - 560 px
```

Approximate height:

```text
480 - 620 px
```

Do not hard-code sizes without respecting HiDPI scaling.

---

# 25. PySide6 Window

Suggested flags:

```python
Qt.Tool
Qt.FramelessWindowHint
Qt.WindowStaysOnTopHint
```

Also:

```python
Qt.WA_TranslucentBackground
```

Use a custom inner panel for:

- rounded corners
- theme
- border
- shadow where compositor allows

---

# 26. Window Behaviour

When shown:

```text
show panel
      ↓
raise window
      ↓
activate window
      ↓
focus search
```

When:

```text
Escape
```

close/hide.

When the popup loses focus:

```text
hide()
```

Do not destroy the window every time.

Reuse it.

---

# 27. Panel Position

Initial preference:

```text
center horizontally
slightly below screen center
```

Use the active screen.

Later configurable:

```text
Center
Bottom Center
Mouse Position
Remember Position
```

Multi-monitor support is mandatory.

---

# 28. Keyboard Navigation

Required:

```text
Super + .
    Open

Esc
    Close

Tab
    Change focus

Ctrl + Tab
    Change category

Left / Right / Up / Down
    Navigate items

Enter
    Select

Ctrl + F
    Focus search
```

Optional later:

```text
1
    Emoji

2
    Clipboard

3
    Kaomoji

4
    Symbols
```

---

# 29. Emoji Selection

When selected:

```text
emoji
  ↓
update usage stats
  ↓
try AT-SPI insertion into the text field focused before opening
  ├── supported → insert at caret
  └── unavailable → show an insertion error without changing the clipboard
  ↓
keep panel open for another selection
```

Do not depend on synthetic keystrokes. Direct insertion is optional when the target app exposes an editable accessibility field.

---

# 30. Clipboard Item Selection

When selected:

```text
database item
    ↓
set clipboard
    ↓
update last_used_at
    ↓
hide panel
```

The user can then paste normally.

Future optional feature:

```text
select → auto paste
```

Do not make auto-paste part of V1.

---

# 31. Clipboard Card UX

Each entry should support:

```text
Left click
    copy

Pin
    keep permanently

Delete
    remove

Context menu
    copy
    pin/unpin
    delete
```

Visual information:

```text
content preview

timestamp
```

Avoid overloading the UI.

---

# 32. History Limits

Defaults:

```text
Clipboard history:
500 items

Pinned:
unlimited

Recent emoji:
30
```

When inserting clipboard items:

```text
DELETE oldest unpinned entries
until count <= configured limit
```

---

# 33. Settings

Config path:

```text
$XDG_CONFIG_HOME/win-dot-panel/config.toml
```

Fallback:

```text
~/.config/win-dot-panel/config.toml
```

Example:

```toml
[general]
start_on_login = true
close_after_selection = true
remember_last_tab = true

[clipboard]
enabled = true
history_limit = 500
max_text_bytes = 1048576

[emoji]
recent_limit = 30

[ui]
theme = "system"
position = "center"
```

---

# 34. Theme System

Support:

```text
System
Light
Dark
```

Default:

```text
System
```

Detect Qt palette / desktop theme where possible.

Do not create completely separate GNOME and KDE themes.

Create one polished neutral Linux UI that works well on both.

---

# 35. Performance Targets

Idle:

```text
CPU:
approximately 0%

Memory target:
< 100 MB
```

Popup activation:

```text
target perceived latency:
< 100 ms after IPC command reaches daemon
```

Search:

```text
target:
< 30 ms for normal queries
```

Clipboard insert:

```text
target:
< 20 ms excluding external clipboard read latency
```

These are engineering targets, not guarantees.

---

# 36. Performance Rules

Never:

```text
reload entire database on every popup
```

Never:

```text
render hundreds of clipboard widgets
```

Never:

```text
parse emoji JSON whenever popup opens
```

Never:

```text
poll clipboard every N milliseconds
```

Instead:

```text
SQLite indexes
FTS5
lazy list population
persistent daemon
event-driven clipboard monitoring
prepared queries
small in-memory caches
```

---

# 37. Clipboard Pagination

Initial load:

```text
30 entries
```

Then:

```text
Load More / lazy append
```

SQL:

```sql
SELECT *
FROM clipboard_items
ORDER BY is_pinned DESC, last_used_at DESC
LIMIT 30 OFFSET ?;
```

---

# 38. Search Architecture

One UI search box.

Page-aware V1:

```text
Emoji page
    search emoji

Clipboard page
    search clipboard

Kaomoji page
    search kaomoji

Symbols page
    search symbols
```

Future:

```text
Universal search
```

could merge all sources.

Do not overcomplicate V1.

---

# 39. Clipboard Search

SQLite FTS5 should eventually be used here too.

V1 can start with:

```sql
SELECT *
FROM clipboard_items
WHERE text_content LIKE ?
ORDER BY last_used_at DESC
LIMIT 50;
```

If performance becomes insufficient, create:

```text
clipboard_search FTS5
```

---

# 40. Daemon Startup

Preferred Linux integration:

```text
systemd --user
```

Service file:

```ini
[Unit]
Description=Linux Emoji and Clipboard Panel
After=graphical-session.target

[Service]
Type=simple
ExecStart=%h/.local/bin/win-dot-panel daemon
Restart=on-failure
RestartSec=2

[Install]
WantedBy=default.target
```

Users enable with:

```bash
systemctl --user enable --now win-dot-panel.service
```

---

# 41. Alternative Autostart

Also provide:

```text
~/.config/autostart/win-dot-panel.desktop
```

for users who do not use systemd user services.

Do not require both.

---

# 42. CLI Entrypoint

`pyproject.toml`:

```toml
[project.scripts]
win-dot-panel = "win_dot_panel.cli:main"
```

Commands:

```bash
win-dot-panel daemon
win-dot-panel toggle
win-dot-panel show
win-dot-panel hide
win-dot-panel status
win-dot-panel quit
```

---

# 43. Process Lock

Only one daemon should exist.

Use:

```text
$XDG_RUNTIME_DIR/win-dot-panel.lock
```

or derive daemon existence from the Unix socket.

If a second daemon launches:

```text
detect existing daemon
exit cleanly
```

---

# 44. Logging

Use Python `logging`.

Log path:

```text
$XDG_STATE_HOME/win-dot-panel/win-dot-panel.log
```

Fallback:

```text
~/.local/state/win-dot-panel/win-dot-panel.log
```

Levels:

```text
ERROR
WARNING
INFO
DEBUG
```

Never log clipboard contents by default.

This is important.

Logs may include:

```text
clipboard item captured: hash=...
```

but never:

```text
clipboard text="my password..."
```

---

# 45. Privacy Requirements

Clipboard data must remain local.

No:

```text
analytics
telemetry
cloud upload
remote emoji API
```

unless introduced as explicit opt-in features later.

The README should clearly state:

```text
Clipboard history is stored locally on your machine.
```

---

# 46. Data Deletion

Provide:

```text
Clear clipboard history
```

Pinned items should require either:

```text
Clear all including pinned
```

or separate deletion.

Deleting history should immediately delete rows from SQLite.

Optional later:

```sql
VACUUM;
```

---

# 47. Testing Matrix

Required before a release.

## GNOME

Test:

```text
GNOME + Wayland
GNOME + X11 where available
```

Scenarios:

```text
shortcut
clipboard capture
show/hide
multi-monitor
dark mode
light mode
logout/login autostart
clipboard restore
emoji copy
```

## KDE

Test:

```text
Plasma + Wayland
Plasma + X11 where available
```

Same scenarios.

---

# 48. Unit Tests

Test:

```text
clipboard hashing
duplicate handling
retention
pinning
database migrations
emoji search
emoji recency
configuration parsing
IPC serialization
IPC command routing
```

---

# 49. Integration Tests

Test:

```text
CLI
   ↓
Unix socket
   ↓
daemon command handler
```

Example:

```text
win-dot-panel status

Expected:
running
```

---

# 50. Manual UI Test Checklist

### Opening

- panel appears correctly
- correct monitor
- search field focused
- no visible launch lag

### Closing

- Escape
- click away
- selection
- toggle shortcut

### Emoji

- search
- keyboard navigation
- click selection
- recent list updates

### Clipboard

- new copy appears
- duplicate not repeated
- pinned survives cleanup
- deletion works
- restore works

---

# 51. Milestone 0 — Project Bootstrap

Tasks:

- create repository
- create Python package
- configure `pyproject.toml`
- install PySide6
- add logging
- create config loader
- create test framework
- create basic CLI

Done when:

```bash
win-dot-panel --help
```

works.

---

# 52. Milestone 1 — Popup Prototype

Implement:

- QApplication
- floating frameless panel
- search input
- four tab buttons
- placeholder page
- hide/show
- Escape handling
- focus-out hiding

Done when:

```bash
win-dot-panel demo
```

can show and hide the UI reliably.

---

# 53. Milestone 2 — Daemon + IPC

Implement:

- Unix socket server
- CLI IPC client
- daemon lifecycle
- commands:
  - toggle
  - show
  - hide
  - status
  - quit
- single instance protection

Done when:

Terminal A:

```bash
win-dot-panel daemon
```

Terminal B:

```bash
win-dot-panel toggle
```

instantly opens the existing popup.

---

# 54. Milestone 3 — GNOME / KDE Shortcut

Do not add global keyboard-hook code.

Document:

```text
Shortcut:
Super + .

Command:
win-dot-panel toggle
```

Test on:

- GNOME
- KDE

Done when desktop-native keyboard settings can trigger the existing daemon.

---

# 55. Milestone 4 — Database

Implement:

- XDG data paths
- SQLite initialization
- migrations
- clipboard repository
- settings repository
- emoji repository

Done when the database is automatically created and survives app restart.

---

# 56. Milestone 5 — Emoji Engine

Implement:

- bundled emoji dataset
- importer
- categories
- FTS5 index
- search
- recent emoji
- usage tracking

Done when:

```text
Search: rocket
```

shows relevant emoji and selecting one inserts it into a supported text field while keeping the panel open. If the field is inaccessible, the panel explains why insertion failed and leaves the clipboard unchanged.

---

# 57. Milestone 6 — Clipboard Watcher

Implement:

- clipboard backend interface
- Wayland backend
- X11 fallback
- hashing
- duplicates
- retention
- watcher lifecycle

Done when:

```text
copy text in browser
      ↓
open panel
      ↓
text appears in clipboard history
```

without polling.

---

# 58. Milestone 7 — Clipboard UI

Implement:

- list model
- lazy loading
- item preview
- pin
- delete
- clear history
- select/copy
- search

Done when clipboard management can be done entirely from the panel.

---

# 59. Milestone 8 — Kaomoji + Symbols

Bundle lightweight local datasets.

Examples:

```text
¯\_(ツ)_/¯
(╯°□°）╯︵ ┻━┻
(づ｡◕‿‿◕｡)づ
```

Symbols:

```text
©
®
™
°
±
×
÷
→
←
↑
↓
∞
√
π
```

Done when both pages support search and copy.

---

# 60. Milestone 9 — UI Polish

Add:

- animation
- theme awareness
- better spacing
- selection states
- keyboard hover states
- smooth list rendering
- empty states
- recent sections
- polished clipboard cards

Do not sacrifice responsiveness for animations.

---

# 61. Milestone 10 — Autostart

Implement:

- systemd user service
- install helper
- optional XDG desktop autostart

Commands:

```bash
win-dot-panel install
win-dot-panel uninstall
```

Optional CLI helpers may be implemented after core stability.

---

# 62. Milestone 11 — Packaging

Initial packaging:

```text
Python wheel
```

Wayland installs require the `wl-clipboard` system package. Source checkouts provide `scripts/install-system-deps.sh`; wheel users install the system package separately. A future Debian package must declare `Depends: wl-clipboard` so apt installs it automatically.

Then:

```text
.deb
```

Potential later:

```text
RPM
Arch PKGBUILD
AUR
Flatpak
AppImage
```

Be careful with Flatpak clipboard / host integration restrictions.

Do not make Flatpak the first packaging target.

---

# 63. Development Commands

Recommended:

```bash
python -m venv .venv
source .venv/bin/activate

pip install -e ".[dev]"
```

Run daemon:

```bash
win-dot-panel daemon
```

Show:

```bash
win-dot-panel show
```

Toggle:

```bash
win-dot-panel toggle
```

Tests:

```bash
pytest
```

---

# 64. Suggested Dependencies

Core:

```text
PySide6
```

Development:

```text
pytest
pytest-qt
ruff
mypy
```

Use Python standard library where practical for:

```text
sqlite3
socket
logging
hashlib
subprocess
pathlib
json
```

Avoid adding dependencies for functionality already well supported by Python.

---

# 65. Code Quality Rules for the Agent

The coding agent must follow these rules.

1. Keep platform-specific code isolated.
2. Use type hints.
3. Avoid giant modules.
4. Avoid hidden global mutable state.
5. Never block the Qt UI thread.
6. Never poll the clipboard continuously.
7. Never log clipboard content.
8. Never load the full clipboard DB into widgets.
9. Use repositories for database operations.
10. Write tests for core non-UI behavior.
11. Handle subprocess failures.
12. Handle daemon crashes gracefully.
13. Do not assume Wayland and X11 behave identically.
14. Do not require root.
15. Follow XDG directory conventions.

---

# 66. Threading Rules

UI operations:

```text
main Qt thread
```

Clipboard watchers / long-running subprocesses:

```text
QProcess
```

or dedicated worker threads where necessary.

Database:

SQLite access can initially remain serialized through the daemon.

Do not create unnecessary worker pools.

---

# 67. Qt Model/View Requirement

For potentially long lists such as clipboard history:

Prefer:

```text
QListView
+
QAbstractListModel
+
delegate
```

instead of:

```text
QScrollArea
+
500 QWidget instances
```

This is important for memory and performance.

---

# 68. Emoji Grid Requirement

Do not create thousands of emoji buttons at once.

Use:

```text
virtualized grid / model-based view
```

or page/category limited rendering.

Search results can be limited to:

```text
100
```

initial items.

---

# 69. Error Handling

If clipboard watcher fails:

```text
keep application running
log error
show clipboard unavailable state
allow emoji picker to continue
```

If SQLite fails:

```text
show non-destructive error
do not silently recreate user data
```

If the daemon IPC socket is stale:

```text
detect
remove stale socket
start new daemon
```

---

# 70. First Launch Experience

First launch should show a minimal setup screen.

Example:

```text
Win Dot Panel is running.

To open it anywhere, create a custom keyboard shortcut.

Command:
win-dot-panel toggle

Recommended shortcut:
Super + .
```

Buttons:

```text
Copy command
Open app
Don't show again
```

Do not attempt to modify GNOME/KDE settings automatically in V1.

---

# 71. Tray Icon

Not required for V1.

A tray icon is optional because:

- GNOME does not expose tray icons natively without extensions
- KDE supports them better
- background operation does not require a tray

Settings can be exposed later through:

```bash
win-dot-panel settings
```

or from a gear icon inside the panel.

---

# 72. Settings UI

V1 settings can include:

```text
General
    Start on login
    Close after selection
    Remember last tab

Clipboard
    Enable history
    Max history items
    Clear history

Appearance
    System / Light / Dark
    Position

About
    Version
    Data path
    Config path
```

The shortcut should remain managed by GNOME/KDE settings.

Display:

```text
Shortcut command:
win-dot-panel toggle
```

with a copy button.

---

# 73. Security Boundaries

Never:

```text
run clipboard contents as shell commands
```

Never:

```text
interpolate clipboard data into shell=True subprocesses
```

Use:

```python
subprocess.Popen([...])
```

rather than:

```python
subprocess.Popen("...", shell=True)
```

unless strictly justified.

---

# 74. Database Migration Strategy

Store schema version.

Example:

```sql
CREATE TABLE metadata (
    key TEXT PRIMARY KEY,
    value TEXT
);
```

Set:

```text
schema_version = 1
```

Every release changing schema must provide a migration.

Never delete/recreate database automatically.

---

# 75. Accessibility

Support:

- keyboard-only navigation
- visible selection
- sufficient contrast
- scalable fonts
- Qt accessibility metadata
- meaningful accessible labels

The panel must remain usable without mouse interaction.

---

# 76. HiDPI

Do not assume:

```text
96 DPI
```

Use Qt logical pixel scaling.

Test:

```text
100%
125%
150%
200%
```

especially on KDE.

---

# 77. Multi-Monitor

When shortcut is triggered:

Preferred order:

1. monitor containing currently active window
2. monitor containing mouse cursor
3. primary monitor fallback

Implementation may initially use cursor screen if active-window information is unreliable under Wayland.

Do not use compositor-specific hacks in V1.

---

# 78. Desired UX Speed

The panel should feel like:

```text
press shortcut
panel is immediately there
type
results immediately update
Enter
panel disappears
paste
```

Every architectural decision should protect this interaction.

---

# 79. V1 Release Definition

V1 is complete only when all of these work:

- GNOME Wayland
- KDE Plasma Wayland
- GNOME/KDE shortcut executes `win-dot-panel toggle`
- daemon starts automatically
- popup opens instantly
- popup hides correctly
- emoji search works
- recent emojis work
- text clipboard monitoring works
- clipboard history survives reboot
- pinned entries work
- duplicates are prevented
- clipboard search works
- kaomoji works
- symbols work
- dark/light themes work
- keyboard navigation works
- no clipboard polling
- no clipboard content in logs
- no root privileges
- no internet required

---

# 80. Recommended Agent Execution Order

The coding agent should execute work in this exact sequence:

```text
01  Project bootstrap
        ↓
02  Basic PySide6 popup
        ↓
03  CLI
        ↓
04  Unix socket daemon
        ↓
05  toggle/show/hide IPC
        ↓
06  GNOME + KDE shortcut test
        ↓
07  SQLite layer
        ↓
08  Emoji dataset
        ↓
09  Emoji search
        ↓
10  Emoji UI
        ↓
11  Wayland clipboard watcher
        ↓
12  Clipboard persistence
        ↓
13  Clipboard list model
        ↓
14  Pin/delete/search
        ↓
15  X11 fallback
        ↓
16  Kaomoji
        ↓
17  Symbols
        ↓
18  Theme polish
        ↓
19  Autostart
        ↓
20  Packaging
        ↓
21  GNOME/KDE QA
        ↓
22  V1 release
```

---

# 81. Agent Rules for Each Milestone

For every milestone:

1. Inspect existing code before editing.
2. State the files that need modification.
3. Implement the smallest coherent change.
4. Run relevant tests.
5. Fix failures before proceeding.
6. Avoid unrelated refactoring.
7. Update documentation when behavior changes.
8. Commit architecture-sensitive decisions to comments/docs.
9. Do not silently change public CLI commands.
10. Keep backwards-compatible database migrations.

---

# 82. Definition of Done for Every Agent Task

An implementation task is complete when:

```text
code works
+
tests pass
+
lint passes
+
type checking has no newly introduced errors
+
no regression in toggle speed
+
feature works on intended backend
+
documentation is updated
```

---

# 83. Non-Goals for V1

Explicitly avoid:

- AI features
- cloud accounts
- sync
- cross-device clipboard
- extension marketplace
- automatic keyboard injection
- Windows support
- macOS support
- mobile support
- GIF APIs
- OCR
- browser integration
- clipboard analytics
- shell execution from clipboard

Keep the first release focused.

---

# 84. Possible Project Names

Temporary internal executable:

```text
win-dot-panel
```

This should remain a neutral engineering name until the actual product name is chosen.

The final binary can later become:

```bash
<product-name> toggle
```

while preserving an alias if desired.

---

# 85. Final Architecture Summary

```text
                           GNOME / KDE
                      Custom Keyboard Shortcut
                              Super + .
                                  │
                                  ▼
                      win-dot-panel toggle
                                  │
                           Unix Socket IPC
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────┐
│                    Background Daemon                    │
│                                                         │
│  Clipboard Watcher                     PySide6 UI       │
│         │                                  │            │
│         ▼                                  │            │
│   Wayland / X11                            │            │
│         │                                  │            │
│         └─────────────┐                    │            │
│                       ▼                    ▼            │
│                   SQLite Database                       │
│                Clipboard + Emoji Data                   │
└─────────────────────────────────────────────────────────┘
```

---

# 86. Core Technical Decision

The central decision for this project is:

> **GNOME and KDE own the global shortcut. The application only exposes a fast CLI command that talks to an already-running daemon.**

This avoids unnecessary global-keyboard complexity and gives the application a much cleaner Linux-native architecture.

The expected shortcut configuration is therefore:

```text
Shortcut:
Super + .

Command:
win-dot-panel toggle
```

This architecture should remain unchanged unless there is a strong technical reason to replace it.
