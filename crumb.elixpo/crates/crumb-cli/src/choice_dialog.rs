//! Arrow-key choice lists and one-line text prompts drawn at the bottom of
//! the terminal. Shared by `/sessions` and agent questions.

use std::io::{self, Write};

use anyhow::Result;
use crossterm::cursor::{MoveTo, MoveToColumn, MoveUp};
use crossterm::event::{Event, KeyCode, KeyEventKind, KeyModifiers, read};
use crossterm::terminal::{Clear, ClearType, size};
use crumb_ui::{ChoiceDialogView, ChoiceRow, Renderer};

use crate::{FULLSCREEN_SIDE_GUTTER, RawModeGuard};

/// Rows shown at once; longer lists scroll with the selection.
const VISIBLE_ROWS: usize = 10;

/// One row of a choice dialog.
pub(crate) struct DialogRow {
    pub label: String,
    pub detail: String,
    /// `Some` makes the row a checkbox the user toggles with Space.
    pub checked: Option<bool>,
}

/// What the user did in a choice dialog.
#[derive(Debug, Eq, PartialEq)]
pub(crate) enum DialogOutcome {
    Chosen(usize),
    /// A caller-defined action key pressed on the selected row.
    Action(char, usize),
    Cancelled,
}

/// Text and keys for one choice dialog.
pub(crate) struct ChoiceDialog<'a> {
    pub title: &'a str,
    pub notes: &'a [String],
    pub hint: &'a str,
    pub actions: &'a [char],
}

/// Shows a choice list until the user picks, acts, or cancels. In fullscreen
/// the caller repaints the transcript afterwards; inline the box is erased.
pub(crate) fn run_choice_dialog(
    renderer: Renderer,
    dialog: &ChoiceDialog<'_>,
    rows: &mut [DialogRow],
    fullscreen: bool,
) -> Result<DialogOutcome> {
    if rows.is_empty() {
        return Ok(DialogOutcome::Cancelled);
    }
    let _raw_mode = RawModeGuard::enable()?;
    let mut painter = BlockPainter::new(fullscreen);
    let mut selected = 0;
    loop {
        let views = rows
            .iter()
            .map(|row| ChoiceRow {
                label: &row.label,
                detail: &row.detail,
                checked: row.checked,
            })
            .collect::<Vec<_>>();
        let view = ChoiceDialogView {
            title: dialog.title,
            notes: dialog.notes,
            rows: &views,
            selected,
            visible_rows: VISIBLE_ROWS,
            hint: dialog.hint,
        };
        painter.paint(&renderer.choice_dialog(&view, dialog_width()?))?;
        let Event::Key(key) = read()? else {
            continue;
        };
        if !matches!(key.kind, KeyEventKind::Press | KeyEventKind::Repeat) {
            continue;
        }
        let outcome = match key.code {
            KeyCode::Up | KeyCode::Char('k') => {
                selected = selected.checked_sub(1).unwrap_or(rows.len() - 1);
                None
            }
            KeyCode::Down | KeyCode::Char('j') => {
                selected = (selected + 1) % rows.len();
                None
            }
            KeyCode::Char(' ') => {
                if let Some(checked) = rows[selected].checked.as_mut() {
                    *checked = !*checked;
                }
                None
            }
            KeyCode::Enter => Some(DialogOutcome::Chosen(selected)),
            KeyCode::Esc => Some(DialogOutcome::Cancelled),
            KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                Some(DialogOutcome::Cancelled)
            }
            KeyCode::Char(action) if dialog.actions.contains(&action) => {
                Some(DialogOutcome::Action(action, selected))
            }
            KeyCode::Char(digit @ '1'..='9') => {
                let index = usize::from(digit as u8 - b'1');
                if index < rows.len() {
                    selected = index;
                }
                None
            }
            _ => None,
        };
        if let Some(outcome) = outcome {
            painter.clear()?;
            return Ok(outcome);
        }
    }
}

/// Asks for one line of text. Returns `None` when cancelled or left empty.
pub(crate) fn run_text_prompt(
    renderer: Renderer,
    title: &str,
    initial: &str,
    fullscreen: bool,
) -> Result<Option<String>> {
    let _raw_mode = RawModeGuard::enable()?;
    let mut painter = BlockPainter::new(fullscreen);
    let mut value = initial.to_owned();
    loop {
        painter.paint(&renderer.text_prompt_dialog(
            title,
            &value,
            "Enter save · Esc cancel",
            dialog_width()?,
        ))?;
        let Event::Key(key) = read()? else {
            continue;
        };
        if !matches!(key.kind, KeyEventKind::Press | KeyEventKind::Repeat) {
            continue;
        }
        match key.code {
            KeyCode::Enter => {
                painter.clear()?;
                let value = value.trim();
                return Ok((!value.is_empty()).then(|| value.to_owned()));
            }
            KeyCode::Esc => {
                painter.clear()?;
                return Ok(None);
            }
            KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                painter.clear()?;
                return Ok(None);
            }
            KeyCode::Backspace => {
                value.pop();
            }
            KeyCode::Char(character) if !key.modifiers.contains(KeyModifiers::CONTROL) => {
                value.push(character);
            }
            _ => {}
        }
    }
}

fn dialog_width() -> io::Result<u16> {
    Ok(size()?.0.saturating_sub(FULLSCREEN_SIDE_GUTTER * 2))
}

/// Draws a block at the bottom of the screen (fullscreen) or in place below
/// the cursor (inline), replacing the previous paint each time.
struct BlockPainter {
    fullscreen: bool,
    painted_rows: u16,
}

impl BlockPainter {
    const fn new(fullscreen: bool) -> Self {
        Self {
            fullscreen,
            painted_rows: 0,
        }
    }

    fn paint(&mut self, block: &str) -> io::Result<()> {
        let indent = " ".repeat(usize::from(FULLSCREEN_SIDE_GUTTER));
        let lines = block
            .lines()
            .map(|line| format!("{indent}{line}"))
            .collect::<Vec<_>>();
        let rows = u16::try_from(lines.len()).unwrap_or(u16::MAX);
        let mut terminal = io::stdout();
        self.move_to_block_start(&mut terminal, rows)?;
        crossterm::queue!(terminal, Clear(ClearType::FromCursorDown))?;
        write!(terminal, "{}", lines.join("\r\n"))?;
        terminal.flush()?;
        self.painted_rows = rows;
        Ok(())
    }

    fn clear(&mut self) -> io::Result<()> {
        let mut terminal = io::stdout();
        self.move_to_block_start(&mut terminal, self.painted_rows)?;
        crossterm::queue!(terminal, Clear(ClearType::FromCursorDown))?;
        self.painted_rows = 0;
        terminal.flush()
    }

    fn move_to_block_start(&self, terminal: &mut impl Write, rows: u16) -> io::Result<()> {
        if self.fullscreen {
            let (_, height) = size()?;
            crossterm::queue!(terminal, MoveTo(0, height.saturating_sub(rows)))
        } else {
            if self.painted_rows > 1 {
                crossterm::queue!(terminal, MoveUp(self.painted_rows - 1))?;
            }
            crossterm::queue!(terminal, MoveToColumn(0))
        }
    }
}
