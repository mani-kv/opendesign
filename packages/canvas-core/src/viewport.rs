//! Viewport — pan and zoom camera for the infinite canvas.
//!
//! Coordinate system:
//! ```text
//!   World:    absolute positions of objects (never mutated by pan/zoom)
//!   Viewport: world coord at the top-left of the visible area
//!   Screen:   pixel positions on the display
//!
//!   screenX = (worldX − viewport.x) × zoom
//!   worldX  = screenX / zoom + viewport.x
//! ```

use vello::kurbo::Affine;

/// Width of the ruler strip along the top and left edges (pixels).
pub const RULER_W: f64 = 44.0;

/// Pan-and-zoom camera state.
///
/// `x` and `y` are the world coordinates that map to the top-left of the
/// canvas area (after the ruler strip).  Mutate them with [`Viewport::pan`]
/// and [`Viewport::zoom_toward`].
#[derive(Debug, Clone, Copy)]
pub struct Viewport {
    pub x:    f64,
    pub y:    f64,
    pub zoom: f64,
}

impl Viewport {
    /// Initialise the viewport so that world origin (0, 0) sits at the centre
    /// of the canvas area (the area to the right and below the ruler strip).
    pub fn centered(win_w: f64, win_h: f64) -> Self {
        let canvas_w = win_w - RULER_W;
        let canvas_h = win_h - RULER_W;
        Self {
            x:    -(canvas_w / 2.0),
            y:    -(canvas_h / 2.0),
            zoom: 1.0,
        }
    }

    // ── Coordinate conversions ────────────────────────────────────────────

    /// World → screen pixel coordinates.
    #[inline]
    pub fn to_screen(self, wx: f64, wy: f64) -> (f64, f64) {
        ((wx - self.x) * self.zoom, (wy - self.y) * self.zoom)
    }

    /// Screen pixel → world coordinates.
    #[inline]
    pub fn to_world(self, sx: f64, sy: f64) -> (f64, f64) {
        (sx / self.zoom + self.x, sy / self.zoom + self.y)
    }

    /// Build a [`vello::kurbo::Affine`] that maps world space into screen space.
    /// Pass this to vello's draw calls to render objects in world coordinates.
    pub fn affine(self) -> Affine {
        Affine::new([
            self.zoom, 0.0,
            0.0,       self.zoom,
            -self.x * self.zoom,
            -self.y * self.zoom,
        ])
    }

    // ── Mutation ──────────────────────────────────────────────────────────

    /// Pan by a screen-space delta (e.g. from a trackpad scroll event).
    pub fn pan(mut self, dsx: f64, dsy: f64) -> Self {
        self.x -= dsx / self.zoom;
        self.y -= dsy / self.zoom;
        self
    }

    /// Zoom toward a screen point, keeping that point visually fixed.
    ///
    /// `factor > 1.0` zooms in; `factor < 1.0` zooms out.
    /// Zoom is clamped to `[0.02, 256.0]`.
    pub fn zoom_toward(mut self, sx: f64, sy: f64, factor: f64) -> Self {
        let (wx0, wy0) = self.to_world(sx, sy);
        self.zoom = (self.zoom * factor).clamp(0.02, 256.0);
        let (wx1, wy1) = self.to_world(sx, sy);
        self.x += wx0 - wx1;
        self.y += wy0 - wy1;
        self
    }
}
