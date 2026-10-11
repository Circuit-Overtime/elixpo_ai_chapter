# Keyboard shortcut setup

Win Dot Panel uses the desktop's shortcut settings. The shortcut runs one small command, `/usr/bin/win-dot-panel toggle`, which contacts the existing daemon or starts it when needed. The app does not register a global keyboard hook.

Win Dot Panel also appears in the app menu, so you can open it before setting shortcuts.

For a separate clipboard shortcut, assign **Super + V** to `/usr/bin/win-dot-panel toggle-clipboard`. It opens the Clipboard tab, switches to it from another tab, or closes the panel when Clipboard is already open.

## Choose the command

For the APT-installed package, use:

```text
/usr/bin/win-dot-panel toggle
```

Use `/usr/bin/win-dot-panel toggle-clipboard` for the Clipboard shortcut. These absolute paths also work when a development virtual environment is active in your terminal.

For a development install inside this repository's `.venv`, find the executable's absolute path while the environment is active:

```bash
readlink -f "$(command -v win-dot-panel)"
```

Add ` toggle` to the printed path. For example, enter `/home/you/packages.elixpo/apps/win-dot-panel/.venv/bin/win-dot-panel toggle` in the shortcut editor. Use the actual printed path; desktop shortcut launchers may not have the PATH from your activated terminal.

## GNOME

1. Open **Settings → Keyboard → View and Customize Shortcuts → Custom Shortcuts**.
2. Add a shortcut named **Emoji & Clipboard Panel**.
3. Enter the command chosen above.
4. Record **Super + .** and save. If another custom shortcut already uses it, edit or remove that binding first.

GNOME's [custom shortcut instructions](https://help.gnome.org/gnome-help/keyboard-shortcuts-set.html) describe the name, command, and key recording fields.

## KDE Plasma

1. Open **System Settings → Shortcuts** (under **Keyboard** on some versions).
2. In Plasma 6, choose **Add New → Command or Script**. In older Plasma releases, look for **Custom Shortcuts**.
3. Enter the command chosen above and assign **Meta + .**. KDE calls the Windows/Super key **Meta**.
4. Apply the change. If the combination is already assigned, choose another free combination.

See the [KDE Shortcuts module](https://docs.kde.org/stable_kf6/en/plasma-desktop/kcontrol/keys/) and the [Plasma 6 command shortcut example](https://discuss.kde.org/t/personalized-keyboard-shortcuts-gone-after-update-to-plasma-6-how-to-put-them-back/13126/4).

## Check the shortcut

1. Run `/usr/bin/win-dot-panel quit` to stop any existing daemon. A "Daemon is not running" message is harmless.
2. Press the shortcut once. The panel should appear with search focused; this also tests cold start.
3. Press the shortcut again. The same panel should hide. Press it once more to reopen, then press **Esc** to close.
4. In a terminal, run `/usr/bin/win-dot-panel status`; it should print `running`.
5. Run `/usr/bin/win-dot-panel quit` when done.

The shortcut command should use the same executable as the terminal commands. If the terminal command works but the shortcut does not, use its absolute path as shown above.

### If Super + . inserts an `e`

IBus may already use **Super + .** and **Super + ;** for emoji input. Check its setting:

```bash
gsettings get org.freedesktop.ibus.panel.emoji hotkey
```

To reserve **Super + .** for Dot Panel while keeping IBus emoji input on **Super + ;**, run:

```bash
gsettings set org.freedesktop.ibus.panel.emoji hotkey "['<Super>semicolon']"
```

Then check GNOME's **Custom Shortcuts** list for another app assigned to **Super + .**. Edit that existing shortcut to run Dot Panel or remove its binding before adding a new one. You can restore the original IBus shortcuts with:

```bash
gsettings reset org.freedesktop.ibus.panel.emoji hotkey
```

IBus defines both combinations in its [emoji shortcut schema](https://github.com/ibus/ibus/blob/main/data/dconf/org.freedesktop.ibus.gschema.xml).
