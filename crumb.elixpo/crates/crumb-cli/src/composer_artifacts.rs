use std::borrow::Cow;
use std::fmt::Write as _;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use arboard::{Clipboard, ImageData};
use image::codecs::png::PngEncoder;
use image::imageops::FilterType;
use image::{ColorType, ImageEncoder, RgbaImage};
use sha2::{Digest, Sha256};

use super::{MAX_PASTE_ARTIFACT_BYTES, persist_paste_artifact};

pub(crate) const MAX_PENDING_IMAGES: usize = 5;
const MAX_IMAGE_DIMENSION: usize = 8_192;
const MAX_IMAGE_RGBA_BYTES: usize = 32 * 1024 * 1024;
const MAX_ENCODED_IMAGE_BYTES: usize = 12 * 1024 * 1024;
const MAX_PENDING_IMAGE_BYTES: usize = 32 * 1024 * 1024;
const COMPOSER_INPUT_COLUMN: u16 = 4;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum CaptureOutcome {
    Insert(String),
    Attached,
    Rejected(String),
}

#[derive(Clone)]
pub(crate) enum ArtifactPreview {
    Text { label: String, body: String },
    Image { label: String, png: Vec<u8> },
}

#[derive(Clone)]
enum PendingArtifactData {
    Text(String),
    Image {
        png: Vec<u8>,
        width: u32,
        height: u32,
    },
}

#[derive(Clone)]
struct PendingArtifact {
    id: u64,
    label: String,
    data: PendingArtifactData,
}

impl PendingArtifact {
    fn byte_len(&self) -> usize {
        match &self.data {
            PendingArtifactData::Text(text) => text.len(),
            PendingArtifactData::Image { png, .. } => png.len(),
        }
    }

    fn chip(&self) -> String {
        match &self.data {
            PendingArtifactData::Text(_) => {
                format!("TXT{} {} ×", self.id, human_bytes(self.byte_len()))
            }
            PendingArtifactData::Image { width, height, .. } => {
                format!("IMG{} {width}×{height} ×", self.id)
            }
        }
    }

    fn preview(&self) -> ArtifactPreview {
        match &self.data {
            PendingArtifactData::Text(body) => ArtifactPreview::Text {
                label: self.label.clone(),
                body: body.clone(),
            },
            PendingArtifactData::Image { png, .. } => ArtifactPreview::Image {
                label: self.label.clone(),
                png: png.clone(),
            },
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum ArtifactHit {
    Preview(u64),
    Remove(u64),
}

#[derive(Clone, Copy, Debug)]
struct ChipLayout {
    id: u64,
    row: u16,
    start: u16,
    remove_start: u16,
    end: u16,
}

#[derive(Default)]
pub(crate) struct PendingComposerArtifacts {
    artifacts: Vec<PendingArtifact>,
    chip_layout: Vec<ChipLayout>,
    next_id: u64,
    notice: Option<String>,
}

impl PendingComposerArtifacts {
    pub(crate) fn capture_text(&mut self, paste: &str) -> CaptureOutcome {
        self.notice = None;
        let paste = paste.replace("\r\n", "\n").replace('\r', "\n");
        if paste.len() < super::LARGE_PASTE_MIN_BYTES {
            return CaptureOutcome::Insert(paste);
        }
        if paste.len() > MAX_PASTE_ARTIFACT_BYTES {
            return CaptureOutcome::Rejected(format!(
                "paste is {} but text artifacts are limited to {}",
                human_bytes(paste.len()),
                human_bytes(MAX_PASTE_ARTIFACT_BYTES)
            ));
        }
        let retained = self
            .artifacts
            .iter()
            .filter_map(|artifact| match &artifact.data {
                PendingArtifactData::Text(text) => Some(text.len()),
                PendingArtifactData::Image { .. } => None,
            })
            .sum::<usize>();
        if retained.saturating_add(paste.len()) > super::MAX_PENDING_PASTE_BYTES {
            return CaptureOutcome::Rejected(format!(
                "pending text artifacts exceed {}",
                human_bytes(super::MAX_PENDING_PASTE_BYTES)
            ));
        }
        self.push(PendingArtifactData::Text(paste), "pasted text");
        CaptureOutcome::Attached
    }

    pub(crate) fn capture_clipboard(&mut self) -> CaptureOutcome {
        self.notice = None;
        let mut clipboard = match Clipboard::new() {
            Ok(clipboard) => clipboard,
            Err(error) => {
                return CaptureOutcome::Rejected(format!("clipboard unavailable: {error}"));
            }
        };
        if let Ok(image) = clipboard.get_image() {
            return self.capture_rgba(&image);
        }
        match clipboard.get_text() {
            Ok(text) => self.capture_text(&text),
            Err(error) => CaptureOutcome::Rejected(format!(
                "clipboard has no supported image or text: {error}"
            )),
        }
    }

    fn capture_rgba(&mut self, image: &ImageData<'_>) -> CaptureOutcome {
        let image_count = self
            .artifacts
            .iter()
            .filter(|artifact| matches!(artifact.data, PendingArtifactData::Image { .. }))
            .count();
        if image_count >= MAX_PENDING_IMAGES {
            return CaptureOutcome::Rejected(format!(
                "a request can include at most {MAX_PENDING_IMAGES} images"
            ));
        }
        if image.width == 0
            || image.height == 0
            || image.width > MAX_IMAGE_DIMENSION
            || image.height > MAX_IMAGE_DIMENSION
        {
            return CaptureOutcome::Rejected(format!(
                "clipboard image dimensions {}x{} are unsupported",
                image.width, image.height
            ));
        }
        let expected = image
            .width
            .checked_mul(image.height)
            .and_then(|pixels| pixels.checked_mul(4));
        if expected != Some(image.bytes.len()) || image.bytes.len() > MAX_IMAGE_RGBA_BYTES {
            return CaptureOutcome::Rejected(
                "clipboard image is too large or malformed".to_owned(),
            );
        }
        let (Ok(width), Ok(height)) = (u32::try_from(image.width), u32::try_from(image.height))
        else {
            return CaptureOutcome::Rejected("clipboard image dimensions overflow".to_owned());
        };
        let mut png = Vec::new();
        let encoder = PngEncoder::new(&mut png);
        if let Err(error) =
            encoder.write_image(&image.bytes, width, height, ColorType::Rgba8.into())
        {
            return CaptureOutcome::Rejected(format!(
                "clipboard image could not be encoded: {error}"
            ));
        }
        if png.len() > MAX_ENCODED_IMAGE_BYTES {
            return CaptureOutcome::Rejected(format!(
                "clipboard image is {} but one image is limited to {}",
                human_bytes(png.len()),
                human_bytes(MAX_ENCODED_IMAGE_BYTES)
            ));
        }
        let retained = self
            .artifacts
            .iter()
            .filter_map(|artifact| match &artifact.data {
                PendingArtifactData::Image { png, .. } => Some(png.len()),
                PendingArtifactData::Text(_) => None,
            })
            .sum::<usize>();
        if retained.saturating_add(png.len()) > MAX_PENDING_IMAGE_BYTES {
            return CaptureOutcome::Rejected(format!(
                "pending images exceed {}",
                human_bytes(MAX_PENDING_IMAGE_BYTES)
            ));
        }
        self.push(
            PendingArtifactData::Image { png, width, height },
            &format!("clipboard image {}", image_count + 1),
        );
        CaptureOutcome::Attached
    }

    fn push(&mut self, data: PendingArtifactData, label: &str) {
        self.next_id = self.next_id.saturating_add(1);
        self.artifacts.push(PendingArtifact {
            id: self.next_id,
            label: label.to_owned(),
            data,
        });
    }

    #[cfg(test)]
    pub(crate) fn is_empty(&self) -> bool {
        self.artifacts.is_empty()
    }

    pub(crate) fn has_artifacts(&self) -> bool {
        !self.artifacts.is_empty()
    }

    pub(crate) fn set_notice(&mut self, notice: String) {
        self.notice = Some(notice);
    }

    pub(crate) fn clear(&mut self) {
        self.artifacts.clear();
        self.chip_layout.clear();
        self.notice = None;
    }

    pub(crate) fn remove(&mut self, id: u64) -> bool {
        let previous = self.artifacts.len();
        self.artifacts.retain(|artifact| artifact.id != id);
        self.chip_layout.retain(|layout| layout.id != id);
        self.notice = None;
        self.artifacts.len() != previous
    }

    pub(crate) fn remove_latest(&mut self) -> bool {
        let removed = self.artifacts.pop().is_some();
        if removed {
            self.chip_layout.clear();
            self.notice = None;
        }
        removed
    }

    pub(crate) fn preview(&self, id: u64) -> Option<ArtifactPreview> {
        self.artifacts
            .iter()
            .find(|artifact| artifact.id == id)
            .map(PendingArtifact::preview)
    }

    pub(crate) fn preview_latest(&self) -> Option<ArtifactPreview> {
        self.artifacts.last().map(PendingArtifact::preview)
    }

    pub(crate) fn hit_test(&self, row: u16, column: u16) -> Option<ArtifactHit> {
        self.chip_layout.iter().find_map(|layout| {
            (row == layout.row && column >= layout.start && column < layout.end).then_some(
                if column >= layout.remove_start {
                    ArtifactHit::Remove(layout.id)
                } else {
                    ArtifactHit::Preview(layout.id)
                },
            )
        })
    }

    pub(crate) fn composer_prefix(
        &mut self,
        use_ansi_coloring: bool,
        composer_input_row: Option<u16>,
    ) -> String {
        self.chip_layout.clear();
        if self.artifacts.is_empty() && self.notice.is_none() {
            return String::new();
        }
        let mut plain = String::new();
        let mut styled = String::new();
        let mut visible_column = COMPOSER_INPUT_COLUMN;
        for artifact in &self.artifacts {
            let chip = artifact.chip();
            let prefix = if plain.is_empty() { "" } else { " " };
            plain.push_str(prefix);
            let start = visible_column.saturating_add(u16::try_from(prefix.len()).unwrap_or(0));
            plain.push('[');
            plain.push_str(&chip);
            plain.push(']');
            if use_ansi_coloring {
                styled.push_str(prefix);
                styled.push_str("\x1b[38;5;117;48;5;236m[");
                styled.push_str(&chip);
                styled.push_str("]\x1b[0m");
            }
            let width = u16::try_from(chip.chars().count().saturating_add(2)).unwrap_or(u16::MAX);
            if let Some(row) = composer_input_row {
                self.chip_layout.push(ChipLayout {
                    id: artifact.id,
                    row,
                    start,
                    remove_start: start.saturating_add(width.saturating_sub(3)),
                    end: start.saturating_add(width),
                });
            }
            visible_column = start.saturating_add(width);
        }
        if let Some(notice) = &self.notice {
            let notice = format!("! {}", truncate_label(notice, 48));
            let prefix = if plain.is_empty() { "  " } else { " " };
            plain.push_str(prefix);
            plain.push('[');
            plain.push_str(&notice);
            plain.push(']');
            if use_ansi_coloring {
                styled.push_str(prefix);
                styled.push_str("\x1b[38;5;203;48;5;236m[");
                styled.push_str(&notice);
                styled.push_str("]\x1b[0m");
            }
        }
        if use_ansi_coloring { styled } else { plain }
    }

    pub(crate) fn composer_prefix_width(&self) -> usize {
        let artifact_width = self
            .artifacts
            .iter()
            .enumerate()
            .map(|(index, artifact)| artifact.chip().chars().count() + 2 + usize::from(index > 0))
            .sum::<usize>();
        self.notice.as_ref().map_or(artifact_width, |notice| {
            let prefix = if self.artifacts.is_empty() { 2 } else { 1 };
            artifact_width + prefix + truncate_label(notice, 48).chars().count() + 4
        })
    }

    pub(crate) fn display_submission(&self, question: &str) -> String {
        let mut display = question.trim().to_owned();
        for artifact in &self.artifacts {
            if !display.is_empty() {
                display.push(' ');
            }
            let _ = write!(display, "[{}]", artifact.chip());
        }
        display
    }

    pub(crate) fn materialize(&mut self, question: &str, workspace: &Path) -> Result<String> {
        let mut references = Vec::with_capacity(self.artifacts.len());
        for artifact in &self.artifacts {
            let (directory, extension, bytes): (&str, &str, Cow<'_, [u8]>) = match &artifact.data {
                PendingArtifactData::Text(text) => {
                    ("pastes", "txt", Cow::Borrowed(text.as_bytes()))
                }
                PendingArtifactData::Image { png, .. } => {
                    ("images", "png", Cow::Borrowed(png.as_slice()))
                }
            };
            let digest = format!("{:x}", Sha256::digest(&bytes));
            let relative = PathBuf::from(format!(
                ".crumb/artifacts/{directory}/sha256-{digest}.{extension}"
            ));
            persist_paste_artifact(workspace, &relative, &bytes)?;
            references.push(format!("@file:{}", relative.display()));
        }
        let mut request = question.trim().to_owned();
        for reference in references {
            if !request.is_empty() {
                request.push(' ');
            }
            request.push_str(&reference);
        }
        self.clear();
        Ok(request)
    }
}

pub(crate) fn image_preview_lines(
    png: &[u8],
    max_columns: u16,
    max_rows: u16,
    color: bool,
) -> Result<Vec<String>> {
    let image = image::load_from_memory(png).context("image preview could not be decoded")?;
    let max_width = u32::from(max_columns.max(1));
    let max_height = u32::from(max_rows.max(1)).saturating_mul(2);
    let image = image
        .resize(max_width, max_height, FilterType::Triangle)
        .to_rgba8();
    if !color {
        return Ok(monochrome_preview(&image));
    }
    Ok(truecolor_preview(&image))
}

fn truecolor_preview(image: &RgbaImage) -> Vec<String> {
    let mut lines = Vec::new();
    for y in (0..image.height()).step_by(2) {
        let mut line = String::new();
        for x in 0..image.width() {
            let top = composite(*image.get_pixel(x, y));
            let bottom = if y + 1 < image.height() {
                composite(*image.get_pixel(x, y + 1))
            } else {
                [30, 30, 38]
            };
            let _ = write!(
                line,
                "\x1b[38;2;{};{};{};48;2;{};{};{}m▀",
                top[0], top[1], top[2], bottom[0], bottom[1], bottom[2]
            );
        }
        line.push_str("\x1b[0m");
        lines.push(line);
    }
    lines
}

fn monochrome_preview(image: &RgbaImage) -> Vec<String> {
    const RAMP: &[u8] = b" .:-=+*#%@";
    image
        .rows()
        .step_by(2)
        .map(|row| {
            row.map(|pixel| {
                let [r, g, b] = composite(*pixel);
                let luminance = (u16::from(r) * 3 + u16::from(g) * 6 + u16::from(b)) / 10;
                let index = usize::from(luminance) * (RAMP.len() - 1) / 255;
                char::from(RAMP[index])
            })
            .collect()
        })
        .collect()
}

fn composite(pixel: image::Rgba<u8>) -> [u8; 3] {
    let [r, g, b, alpha] = pixel.0;
    let alpha = u16::from(alpha);
    let blend = |channel: u8| {
        u8::try_from((u16::from(channel) * alpha + 30 * (255 - alpha)) / 255).unwrap_or(30)
    };
    [blend(r), blend(g), blend(b)]
}

fn human_bytes(bytes: usize) -> String {
    if bytes < 1024 {
        return format!("{bytes}B");
    }
    if bytes < 1024 * 1024 {
        return format!("{}K", bytes.div_ceil(1024));
    }
    format!("{}M", bytes.div_ceil(1024 * 1024))
}

fn truncate_label(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_owned();
    }
    let mut truncated = value
        .chars()
        .take(max_chars.saturating_sub(1))
        .collect::<String>();
    truncated.push('…');
    truncated
}

#[cfg(test)]
mod tests {
    use std::borrow::Cow;

    use arboard::ImageData;

    use super::{
        ArtifactHit, CaptureOutcome, MAX_PENDING_IMAGES, PendingComposerArtifacts,
        image_preview_lines,
    };

    #[test]
    fn large_text_is_a_pending_chip_and_materializes_beside_the_question() {
        let workspace = tempfile::tempdir().expect("workspace");
        let mut pending = PendingComposerArtifacts::default();
        let pasted = "large pasted line\n".repeat(300);

        assert_eq!(pending.capture_text(&pasted), CaptureOutcome::Attached);
        assert!(pending.composer_prefix(false, Some(20)).contains("TXT1"));
        assert_eq!(
            pending
                .display_submission("summarize")
                .matches("TXT1")
                .count(),
            1
        );

        let request = pending
            .materialize("summarize", workspace.path())
            .expect("materialize");
        assert!(request.starts_with("summarize @file:.crumb/artifacts/pastes/sha256-"));
        assert!(pending.is_empty());
    }

    #[test]
    fn image_clipboard_data_is_bounded_to_five_and_previewable() {
        let mut pending = PendingComposerArtifacts::default();
        for _ in 0..MAX_PENDING_IMAGES {
            assert_eq!(
                pending.capture_rgba(&ImageData {
                    width: 2,
                    height: 2,
                    bytes: Cow::Owned(vec![255; 16]),
                }),
                CaptureOutcome::Attached
            );
        }
        assert!(matches!(
            pending.capture_rgba(&ImageData {
                width: 2,
                height: 2,
                bytes: Cow::Owned(vec![255; 16]),
            }),
            CaptureOutcome::Rejected(message) if message.contains("at most 5")
        ));
        let preview = pending.preview_latest().expect("preview");
        let super::ArtifactPreview::Image { png, .. } = preview else {
            panic!("expected image")
        };
        assert_ne!(
            image_preview_lines(&png, 8, 4, true).expect("render"),
            Vec::<String>::new()
        );
    }

    #[test]
    fn chip_click_targets_preview_and_cross_separately() {
        let mut pending = PendingComposerArtifacts::default();
        assert_eq!(
            pending.capture_text(&"artifact\n".repeat(700)),
            CaptureOutcome::Attached
        );
        let hint = pending.composer_prefix(false, Some(12));
        let start = 4;
        assert!(matches!(
            pending.hit_test(12, start),
            Some(ArtifactHit::Preview(1))
        ));
        let cross = start + u16::try_from(hint.trim().chars().count()).unwrap() - 2;
        assert!(matches!(
            pending.hit_test(12, cross),
            Some(ArtifactHit::Remove(1))
        ));
    }

    #[test]
    fn removing_an_artifact_excludes_it_from_send() {
        let workspace = tempfile::tempdir().expect("workspace");
        let mut pending = PendingComposerArtifacts::default();
        assert_eq!(
            pending.capture_text(&"artifact\n".repeat(700)),
            CaptureOutcome::Attached
        );
        assert!(pending.remove_latest());
        assert_eq!(
            pending
                .materialize("question", workspace.path())
                .expect("send"),
            "question"
        );
    }

    #[test]
    fn rejection_is_ui_state_and_never_becomes_user_prompt_text() {
        let workspace = tempfile::tempdir().expect("workspace");
        let mut pending = PendingComposerArtifacts::default();
        pending.set_notice("clipboard image is too large".to_owned());

        assert!(
            pending
                .composer_prefix(false, None)
                .contains("clipboard image is too large")
        );
        assert_eq!(
            pending
                .materialize("keep my question", workspace.path())
                .expect("send"),
            "keep my question"
        );
    }
}
