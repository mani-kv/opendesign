//! Palette — design token colours for the Vello canvas renderer.
//!
//! Keep in sync with `design-tokens.json` and `web/src/index.css`.
//! All canvas colours (background, grid, selection, rulers, etc.) are defined
//! here so theme changes propagate from a single source.
//!
//! For light/dark mode: `CanvasState` currently uses light-theme values.
//! Future: add `Theme` enum and pass from platform layer (desktop/web).

use vello::peniko::Color;

// ── Canonical palette (matches design-tokens.json) ────────────────────────────
//
// Accent:     #D89B36  (orange-gold)
// Neutrals:   #FFFFFF, #1F1F1F
// Surfaces:   #F6F1D0 (cream), #D2D5BA (sage), #8C8C8C (grid gray)

/// Canvas background colour.
pub const CANVAS_BG: Color = Color::from_rgba8(255, 255, 255, 255);

/// Grid line colour (RGB only; alpha varies by zoom level in draw_grid).
pub const GRID_R: u8 = 140;
pub const GRID_G: u8 = 140;
pub const GRID_B: u8 = 140;

/// Selection stroke and handle colour.
pub const SEL_COLOR: Color = Color::from_rgba8(216, 155, 54, 255);

/// Selection fill (low-opacity overlay).
pub const SEL_FILL: Color = Color::from_rgba8(216, 155, 54, 18);

/// Preview rect fill during draw.
pub const PREV_FILL: Color = Color::from_rgba8(216, 155, 54, 18);

/// Preview rect stroke.
pub const PREV_STROKE: Color = Color::from_rgba8(216, 155, 54, 230);

/// Object default fill.
pub const OBJ_FILL: Color = Color::from_rgba8(255, 255, 255, 255);

/// Object default stroke.
pub const OBJ_STROKE: Color = Color::from_rgba8(0, 0, 0, 28);

/// Resize handle fill.
pub const HANDLE_F: Color = Color::from_rgba8(255, 255, 255, 255);

/// Origin axis X (light blue).
pub const AXIS_X: Color = Color::from_rgba8(80, 160, 255, 55);

/// Origin axis Y (light red).
pub const AXIS_Y: Color = Color::from_rgba8(255, 80, 80, 55);

/// Ruler background.
pub const RULER_BG: Color = Color::from_rgba8(240, 240, 235, 255);

/// Ruler edge/separator.
pub const RULER_EDGE: Color = Color::from_rgba8(197, 199, 176, 255);

/// Ruler tick marks.
pub const RULER_TICK: Color = Color::from_rgba8(140, 140, 140, 255);

/// Ruler text.
pub const RULER_TEXT: Color = Color::from_rgba8(90, 90, 90, 255);

/// Toolbar background (left tool strip).
pub const TOOLBAR_BG: Color = Color::from_rgba8(246, 241, 208, 255);

/// Toolbar border.
pub const TOOLBAR_BR: Color = Color::from_rgba8(197, 199, 176, 255);

/// Active toolbar button (accent).
pub const ACTIVE_BTN: Color = Color::from_rgba8(216, 155, 54, 255);

/// Dimmed icon.
pub const ICON_DIM: Color = Color::from_rgba8(90, 93, 74, 255);

/// Lit icon.
pub const ICON_LIT: Color = Color::from_rgba8(31, 31, 31, 255);

/// Toolbar drop shadow.
pub const TOOLBAR_SHADOW: Color = Color::from_rgba8(0, 0, 0, 55);
