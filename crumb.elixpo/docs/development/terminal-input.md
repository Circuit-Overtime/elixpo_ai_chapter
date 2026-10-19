# Terminal input and accessibility

Crumb keeps native shell programs in their PTY and uses Reedline only for its
own top-level input. Full-screen applications therefore retain their native key
handling, alternate-screen behavior, and resize events.

Interactive Crumb sessions also enter the terminal's alternate screen so the
CLI owns the full viewport and restores the caller's scrollback on exit. Set
`CRUMB_INLINE=1` to keep Crumb in the normal scrolling buffer.

## Editing shortcuts

- `Enter` submits the current command or natural-language request.
- `Alt+Enter` or `Shift+Enter` inserts a newline.
- `Ctrl+O` opens the current buffer in `$VISUAL`, then `$EDITOR`.
- `Tab` opens the width-bounded `/` or `@` suggestion menu.
- `Ctrl+R` searches command history.
- `Ctrl+C` cancels the current input or active agent turn.

Multiline input is passed unchanged to deterministic routing. Native shell
syntax remains owned by Bash, Zsh, or PowerShell.

## Accessibility environment

- `NO_COLOR=1` removes ANSI color.
- `CRUMB_REDUCED_MOTION=1` disables animated activity indicators.
- `CRUMB_PLAIN=1` uses stable plain output and a single-line prompt.
- `CRUMB_SCREEN_READER=1` implies plain and reduced-motion modes, disables
  startup art, and replaces decorative agent markers with spoken labels.

## Shell completion installation

The generators write only to standard output so installation remains owned by
the user:

```bash
# Bash
crumb completions bash > ~/.local/share/bash-completion/completions/crumb

# Zsh (choose a directory already present in $fpath)
crumb completions zsh > ~/.zfunc/_crumb

# Fish
crumb completions fish > ~/.config/fish/completions/crumb.fish

# PowerShell, current session
crumb completions powershell | Out-String | Invoke-Expression
```

Restart the shell after installing a persistent script. The generated scripts
complete authentication, MCP serving, checkpoint export, and completion
generation without starting the interactive terminal.
