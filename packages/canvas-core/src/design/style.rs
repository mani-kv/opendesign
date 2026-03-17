//! Style abstraction — a composable bundle of visual properties.
//!
//! A [`Style`] collects the most common visual attributes (fill colour, text
//! colour, padding, and typography) into one optional-field struct.  All fields
//! are `Option` so that styles from multiple sources can be layered: a default
//! theme style, a token-referenced style, and a local override are merged in
//! order, with the innermost override winning.

use crate::design::color::ColorValue;
use crate::design::spacing::SpacingValue;
use crate::design::typography::TypographyStyle;

/// A composable visual style attached to a canvas node.
///
/// Each field is `Option` to allow partial styles that merge cleanly.
/// Use [`Style::merge`] to combine a base style with an override.
#[derive(Debug, Clone, Default)]
pub struct Style {
    /// Background / shape fill colour.
    pub fill_color:  Option<ColorValue>,
    /// Foreground / text colour.
    pub text_color:  Option<ColorValue>,
    /// Inner padding applied uniformly on all sides.
    pub padding:     Option<SpacingValue>,
    /// Typography specification for any text content.
    pub typography:  Option<TypographyStyle>,
}

impl Style {
    /// Create an empty style (all fields `None`).
    pub fn new() -> Self {
        Self::default()
    }

    // ── Builder methods ──────────────────────────────────────────────────

    pub fn with_fill(mut self, color: ColorValue) -> Self {
        self.fill_color = Some(color);
        self
    }

    pub fn with_text_color(mut self, color: ColorValue) -> Self {
        self.text_color = Some(color);
        self
    }

    pub fn with_padding(mut self, padding: SpacingValue) -> Self {
        self.padding = Some(padding);
        self
    }

    pub fn with_typography(mut self, typography: TypographyStyle) -> Self {
        self.typography = Some(typography);
        self
    }

    // ── Composition ──────────────────────────────────────────────────────

    /// Merge `other` on top of `self`.  Any field set in `other` overwrites
    /// the corresponding field from `self`; absent fields fall back to `self`.
    ///
    /// This is the primary mechanism for cascading styles (theme → token → local).
    pub fn merge(&self, other: &Style) -> Style {
        Style {
            fill_color:  other.fill_color.clone().or_else(|| self.fill_color.clone()),
            text_color:  other.text_color.clone().or_else(|| self.text_color.clone()),
            padding:     other.padding.clone().or_else(|| self.padding.clone()),
            typography:  other.typography.clone().or_else(|| self.typography.clone()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::design::color::ColorValue;

    #[test]
    fn merge_override_wins() {
        let base = Style::new()
            .with_fill(ColorValue::Hex("#FFFFFF".into()));
        let over = Style::new()
            .with_fill(ColorValue::Hex("#000000".into()));
        let merged = base.merge(&over);
        assert_eq!(merged.fill_color, Some(ColorValue::Hex("#000000".into())));
    }

    #[test]
    fn merge_fallback_to_base() {
        let base = Style::new()
            .with_fill(ColorValue::Hex("#FFFFFF".into()))
            .with_padding(SpacingValue::Px(16.0));
        let over = Style::new(); // no fields set
        let merged = base.merge(&over);
        assert_eq!(merged.fill_color, Some(ColorValue::Hex("#FFFFFF".into())));
        assert_eq!(merged.padding,    Some(SpacingValue::Px(16.0)));
    }
}
