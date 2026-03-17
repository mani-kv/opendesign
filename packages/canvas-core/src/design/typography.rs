//! Typography abstraction — font families, sizes, weights, and line heights.
//!
//! Font sizes are stored as [`SpacingValue`] so they participate in the same
//! unit-resolution pipeline as layout measurements.

use crate::design::spacing::{SpacingContext, SpacingValue, resolve_spacing};

/// Horizontal text alignment options.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum TextAlign {
    #[default]
    Left,
    Center,
    Right,
    Justify,
}

/// A complete typographic specification for a text node.
///
/// Font size is a [`SpacingValue`] so it can be expressed in `px`, `rem`, `em`,
/// or as a design token — it is resolved to pixels at render time.
#[derive(Debug, Clone)]
pub struct TypographyStyle {
    /// CSS font-family name, e.g. `"Inter"` or `"JetBrains Mono"`.
    pub font_family:    String,
    /// Font size; most commonly `SpacingValue::Px(n)` or `SpacingValue::Rem(n)`.
    pub font_size:      SpacingValue,
    /// CSS font-weight: 100 (thin) to 900 (black).  400 = regular, 700 = bold.
    pub font_weight:    u16,
    /// Line-height as a unitless multiplier of the resolved font size (e.g. 1.4).
    pub line_height:    f64,
    /// Additional letter spacing in pixels (positive = wider, negative = tighter).
    pub letter_spacing: f64,
    /// Horizontal text alignment within the text box.
    pub text_align:     TextAlign,
}

impl Default for TypographyStyle {
    fn default() -> Self {
        Self {
            font_family:    "Inter".to_string(),
            font_size:      SpacingValue::Rem(1.0),
            font_weight:    400,
            line_height:    1.4,
            letter_spacing: 0.0,
            text_align:     TextAlign::Left,
        }
    }
}

impl TypographyStyle {
    /// Minimal constructor; remaining fields use sensible defaults.
    pub fn new(
        font_family: impl Into<String>,
        font_size:   SpacingValue,
        font_weight: u16,
    ) -> Self {
        Self {
            font_family: font_family.into(),
            font_size,
            font_weight,
            ..Default::default()
        }
    }

    /// Builder: set line height.
    pub fn with_line_height(mut self, lh: f64) -> Self {
        self.line_height = lh;
        self
    }

    /// Builder: set letter spacing in pixels.
    pub fn with_letter_spacing(mut self, ls: f64) -> Self {
        self.letter_spacing = ls;
        self
    }

    /// Builder: set text alignment.
    pub fn with_text_align(mut self, align: TextAlign) -> Self {
        self.text_align = align;
        self
    }
}

/// Resolve the font size of a [`TypographyStyle`] to absolute pixels.
pub fn resolve_font_size(style: &TypographyStyle, ctx: &SpacingContext) -> f64 {
    resolve_spacing(&style.font_size, ctx)
}

/// Resolve the computed line height (in pixels) for a [`TypographyStyle`].
///
/// `line_height` is a unitless multiplier applied to the resolved font size.
pub fn resolve_line_height(style: &TypographyStyle, ctx: &SpacingContext) -> f64 {
    resolve_font_size(style, ctx) * style.line_height
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_font_size_is_one_rem() {
        let style = TypographyStyle::default();
        let ctx   = SpacingContext::screen_default(); // root = 16 px
        assert_eq!(resolve_font_size(&style, &ctx), 16.0);
    }

    #[test]
    fn line_height_multiplies_font_size() {
        let mut style = TypographyStyle::default();
        style.line_height = 1.5;
        let ctx = SpacingContext::screen_default();
        assert_eq!(resolve_line_height(&style, &ctx), 24.0); // 16 * 1.5
    }
}
