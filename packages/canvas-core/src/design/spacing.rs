//! Spacing abstraction — converts design-friendly measurements into pixels.
//!
//! All canvas geometry (x, y, width, height, padding, gap) is expressed as a
//! [`SpacingValue`].  At render time every value is resolved to an `f64` pixel
//! amount via [`resolve_spacing`].

/// A design-level measurement that can be expressed in several units.
///
/// The canvas itself operates in world-coordinate pixels (`Px`), but design
/// content can reference any unit; everything is resolved before rendering.
#[derive(Debug, Clone, PartialEq)]
pub enum SpacingValue {
    /// Absolute pixels — `Px(200.0)` = 200 px.
    Px(f64),
    /// Root-relative em — `Rem(1.5)` = 1.5 × `root_font_size`.
    Rem(f64),
    /// Element-relative em — `Em(1.0)` = 1.0 × current `font_size`.
    Em(f64),
    /// Percentage of the relevant parent dimension — `Percent(50.0)` = 50 %.
    Percent(f64),
    /// Fill remaining space. Resolves to `0.0` until a layout engine is present.
    Auto,
}

/// Contextual values required to resolve relative spacing units.
#[derive(Debug, Clone, Copy)]
pub struct SpacingContext {
    /// Size of `1rem` in pixels (typically 16 px).
    pub root_font_size: f64,
    /// Width of the parent container in pixels (used for `Percent` on x-axis).
    pub parent_width:   f64,
    /// Height of the parent container in pixels (used for `Percent` on y-axis).
    pub parent_height:  f64,
    /// Current element's computed font size for `Em` resolution.
    pub font_size:      f64,
}

impl SpacingContext {
    /// A 1:1 pixel context suitable for canvas world coordinates where all
    /// measurements are already absolute pixels.
    pub fn screen_default() -> Self {
        Self {
            root_font_size: 16.0,
            parent_width:   0.0,
            parent_height:  0.0,
            font_size:      16.0,
        }
    }
}

/// Resolve a [`SpacingValue`] to an absolute pixel amount.
///
/// `Percent` resolves against `ctx.parent_width`; for height-axis values the
/// caller should supply a context where `parent_width` holds the parent height.
/// `Auto` always resolves to `0.0` until a layout engine is introduced.
pub fn resolve_spacing(value: &SpacingValue, ctx: &SpacingContext) -> f64 {
    match value {
        SpacingValue::Px(n)      => *n,
        SpacingValue::Rem(n)     => n * ctx.root_font_size,
        SpacingValue::Em(n)      => n * ctx.font_size,
        SpacingValue::Percent(n) => n / 100.0 * ctx.parent_width,
        SpacingValue::Auto       => 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn px_is_identity() {
        let ctx = SpacingContext::screen_default();
        assert_eq!(resolve_spacing(&SpacingValue::Px(42.0), &ctx), 42.0);
    }

    #[test]
    fn rem_uses_root_font_size() {
        let ctx = SpacingContext::screen_default(); // root = 16
        assert_eq!(resolve_spacing(&SpacingValue::Rem(1.5), &ctx), 24.0);
    }

    #[test]
    fn percent_uses_parent_width() {
        let ctx = SpacingContext { parent_width: 400.0, ..SpacingContext::screen_default() };
        assert_eq!(resolve_spacing(&SpacingValue::Percent(25.0), &ctx), 100.0);
    }

    #[test]
    fn auto_resolves_to_zero() {
        let ctx = SpacingContext::screen_default();
        assert_eq!(resolve_spacing(&SpacingValue::Auto, &ctx), 0.0);
    }
}
