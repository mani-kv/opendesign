//! Design abstraction layer — spacing, colour, typography, style, and tokens.
//!
//! These modules are renderer-agnostic.  They contain no `vello` or `winit`
//! imports.  The conversion from [`ColorValue`] to a renderer-specific colour
//! type lives in `canvas_state`, which is the sole crossing point.

pub mod color;
pub mod spacing;
pub mod style;
pub mod tokens;
pub mod typography;

// ── Convenience re-exports ────────────────────────────────────────────────────

pub use color::{
    ColorValue,
    apply_opacity, hex_to_rgba, hsl_to_rgb, rgb_to_hsl, to_rgba_components,
};
pub use spacing::{SpacingContext, SpacingValue, resolve_spacing};
pub use style::Style;
pub use tokens::DesignTokens;
pub use typography::{
    TextAlign, TypographyStyle,
    resolve_font_size, resolve_line_height,
};
