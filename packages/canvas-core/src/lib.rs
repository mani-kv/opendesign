//! Figma-style infinite canvas — platform-independent logic.
//!
//! # Architecture
//!
//! ```text
//! Renderer  (desktop / web)
//!   └─ CanvasState          canvas_state.rs  — scene build + input handling
//!       └─ Scene Graph      node.rs          — Node / Unified Property System
//!           └─ Design Layer design/          — spacing · colour · typography
//! ```
//!
//! # Coordinate systems
//!
//! | Space    | Description                                      |
//! |----------|--------------------------------------------------|
//! | World    | Absolute positions of objects (pan/zoom-invariant) |
//! | Viewport | World coordinate at the top-left of the screen  |
//! | Screen   | Pixel positions on the display                   |
//!
//! Conversions:
//! ```text
//! screenX = (worldX − viewport.x) × zoom
//! worldX  = screenX / zoom + viewport.x
//! ```

// ── Modules ───────────────────────────────────────────────────────────────────

pub mod canvas_snapshot;
pub mod canvas_state;
pub mod design;
pub mod node;
pub mod palette;
pub mod viewport;

// ── Public re-exports ─────────────────────────────────────────────────────────
//
// Everything that platform crates (`desktop`, `web`) need is re-exported at the
// crate root so their `use canvas_core::{ … }` lines stay unchanged.

// Canvas engine
pub use canvas_snapshot::{CanvasSnapshot, NodeSnapshot, ViewportSnapshot};
pub use canvas_state::{CanvasState, ContextMenuTarget, Drag, Handle, Tool};
pub use viewport::{Viewport, RULER_W};
pub use palette::CANVAS_BG;

// Scene-graph node
pub use node::{Node, NodeId, PropertyKey, PropertyValue};

// Design abstractions
pub use design::{
    ColorValue, SpacingContext, SpacingValue,
    Style, DesignTokens,
    TextAlign, TypographyStyle,
    resolve_spacing, resolve_font_size, resolve_line_height,
    apply_opacity, hex_to_rgba, hsl_to_rgb, rgb_to_hsl, to_rgba_components,
};
