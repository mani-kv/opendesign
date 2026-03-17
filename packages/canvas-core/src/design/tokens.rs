//! Design token registry.
//!
//! A [`DesignTokens`] maps semantic names to design values:
//!
//! ```text
//! spacing.sm   → Px(8)
//! color.primary → Hex("#4F46E5")
//! font.body    → TypographyStyle { … }
//! ```
//!
//! Nodes can reference tokens by name so that a single token change propagates
//! everywhere — the foundation of a design system.

use std::collections::HashMap;

use crate::design::color::ColorValue;
use crate::design::spacing::SpacingValue;
use crate::design::typography::TypographyStyle;

/// A flat registry mapping semantic token names to design values.
///
/// Three registries are maintained: `spacing`, `colors`, and `typography`.
/// Call [`DesignTokens::defaults`] to get a pre-populated set suitable for
/// rapid prototyping.
#[derive(Debug, Clone, Default)]
pub struct DesignTokens {
    /// Spacing scale: `"sm"`, `"md"`, `"lg"`, etc.
    pub spacing:    HashMap<String, SpacingValue>,
    /// Colour palette: `"primary"`, `"text"`, `"error"`, etc.
    pub colors:     HashMap<String, ColorValue>,
    /// Typography scale: `"body"`, `"heading1"`, `"caption"`, etc.
    pub typography: HashMap<String, TypographyStyle>,
}

impl DesignTokens {
    pub fn new() -> Self {
        Self::default()
    }

    /// A sensible default token set for rapid prototyping, modelled after
    /// popular design systems (Tailwind, Material, Radix).
    pub fn defaults() -> Self {
        let mut t = Self::new();

        // ── Spacing scale ────────────────────────────────────────────────
        t.spacing.insert("xs".to_string(),  SpacingValue::Px(4.0));
        t.spacing.insert("sm".to_string(),  SpacingValue::Px(8.0));
        t.spacing.insert("md".to_string(),  SpacingValue::Px(16.0));
        t.spacing.insert("lg".to_string(),  SpacingValue::Px(24.0));
        t.spacing.insert("xl".to_string(),  SpacingValue::Px(32.0));
        t.spacing.insert("2xl".to_string(), SpacingValue::Px(48.0));
        t.spacing.insert("3xl".to_string(), SpacingValue::Px(64.0));

        // ── Colour palette ───────────────────────────────────────────────
        // Keep in sync with design-tokens.json and palette.rs
        t.colors.insert("primary".to_string(),          ColorValue::Hex("#D89B36".into()));
        t.colors.insert("primary-dark".to_string(),     ColorValue::Hex("#B8822D".into()));
        t.colors.insert("primary-light".to_string(),    ColorValue::Hex("#E5B04D".into()));
        t.colors.insert("success".to_string(),          ColorValue::Hex("#10B981".into()));
        t.colors.insert("warning".to_string(),          ColorValue::Hex("#F59E0B".into()));
        t.colors.insert("error".to_string(),            ColorValue::Hex("#EF4444".into()));
        t.colors.insert("white".to_string(),            ColorValue::Hex("#FFFFFF".into()));
        t.colors.insert("black".to_string(),            ColorValue::Hex("#000000".into()));
        t.colors.insert("text".to_string(),             ColorValue::Hex("#1F1F1F".into()));
        t.colors.insert("text-secondary".to_string(),   ColorValue::Hex("#5A5D4A".into()));
        t.colors.insert("bg".to_string(),               ColorValue::Hex("#FFFFFF".into()));
        t.colors.insert("surface".to_string(),          ColorValue::Hex("#F6F1D0".into()));
        t.colors.insert("border".to_string(),           ColorValue::Hex("#C5C7B0".into()));

        // ── Typography scale ─────────────────────────────────────────────
        t.typography.insert("display".to_string(),
            TypographyStyle::new("Inter", SpacingValue::Px(48.0), 700));
        t.typography.insert("heading1".to_string(),
            TypographyStyle::new("Inter", SpacingValue::Px(36.0), 700));
        t.typography.insert("heading2".to_string(),
            TypographyStyle::new("Inter", SpacingValue::Px(30.0), 600));
        t.typography.insert("heading3".to_string(),
            TypographyStyle::new("Inter", SpacingValue::Px(24.0), 600));
        t.typography.insert("body".to_string(),
            TypographyStyle::new("Inter", SpacingValue::Px(16.0), 400));
        t.typography.insert("body-sm".to_string(),
            TypographyStyle::new("Inter", SpacingValue::Px(14.0), 400));
        t.typography.insert("caption".to_string(),
            TypographyStyle::new("Inter", SpacingValue::Px(12.0), 400));
        t.typography.insert("label".to_string(),
            TypographyStyle::new("Inter", SpacingValue::Px(14.0), 500));
        t.typography.insert("code".to_string(),
            TypographyStyle::new("JetBrains Mono", SpacingValue::Px(14.0), 400));

        t
    }

    // ── Lookup helpers ────────────────────────────────────────────────────

    /// Look up a spacing token by name.
    pub fn resolve_spacing(&self, token: &str) -> Option<&SpacingValue> {
        self.spacing.get(token)
    }

    /// Look up a colour token by name.
    pub fn resolve_color(&self, token: &str) -> Option<&ColorValue> {
        self.colors.get(token)
    }

    /// Look up a typography token by name.
    pub fn resolve_typography(&self, token: &str) -> Option<&TypographyStyle> {
        self.typography.get(token)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_contain_expected_tokens() {
        let t = DesignTokens::defaults();
        assert!(t.resolve_spacing("md").is_some());
        assert!(t.resolve_color("primary").is_some());
        assert!(t.resolve_typography("body").is_some());
    }

    #[test]
    fn missing_token_returns_none() {
        let t = DesignTokens::defaults();
        assert!(t.resolve_color("nonexistent").is_none());
    }
}
