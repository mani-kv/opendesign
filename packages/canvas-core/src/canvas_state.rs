//! All platform-independent canvas state and logic.
//!
//! Platform crates (`desktop`, `web`) create a [`CanvasState`], hold it, and
//! call its methods from their windowing event loops.  Nothing in this file
//! is I/O-bound — all geometry, selection, and rendering logic lives here.

use vello::kurbo::{Affine, BezPath, Circle, Point, Rect, RoundedRect, Stroke};
use vello::peniko::{Color, Fill};
use vello::Scene;
use winit::window::CursorIcon;

use crate::canvas_snapshot::{CanvasSnapshot, NodeSnapshot, ViewportSnapshot};
use crate::design::color::{to_rgba_components, ColorValue};
use crate::design::spacing::SpacingContext;
use crate::node::{Node, NodeId};
use crate::palette;
use crate::viewport::{Viewport, RULER_W};

// ── Design → renderer bridge ──────────────────────────────────────────────────

/// Convert a design [`ColorValue`] to a vello [`Color`].
///
/// This is the single boundary where the renderer-agnostic design system
/// meets vello's colour type.
fn color_to_vello(c: &ColorValue) -> Color {
    let (r, g, b, a) = to_rgba_components(c);
    Color::from_rgba8(r, g, b, (a * 255.0).round() as u8)
}

/// Return a [`SpacingContext`] suitable for reading canvas node geometry.
/// The canvas always works in world-coordinate pixels so all units resolve 1:1.
#[inline]
fn canvas_ctx() -> SpacingContext {
    SpacingContext::screen_default()
}

// ── Handle ───────────────────────────────────────────────────────────────────

/// The 8 resize handles on a selected rectangle.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Handle {
    TopLeft,
    Top,
    TopRight,
    Left,
    Right,
    BottomLeft,
    Bottom,
    BottomRight,
}

impl Handle {
    pub fn cursor(self) -> CursorIcon {
        match self {
            Self::TopLeft | Self::BottomRight => CursorIcon::NwseResize,
            Self::TopRight | Self::BottomLeft => CursorIcon::NeswResize,
            Self::Top | Self::Bottom => CursorIcon::NsResize,
            Self::Left | Self::Right => CursorIcon::EwResize,
        }
    }
}

// ── Drag ─────────────────────────────────────────────────────────────────────

/// All possible pointer-drag states.
#[derive(Debug, Clone, Copy)]
pub enum Drag {
    None,
    Pan {
        last_sx: f64,
        last_sy: f64,
    },
    Draw {
        wx: f64,
        wy: f64,
    },
    Marquee {
        wx: f64,
        wy: f64,
    },
    /// Moving selected nodes; anchor stored in world coordinates.
    Move {
        start_wx: f64,
        start_wy: f64,
    },
    /// Resizing one node by a handle.
    Resize {
        obj_id: NodeId,
        handle: Handle,
        orig_x: f64,
        orig_y: f64,
        orig_w: f64,
        orig_h: f64,
    },
}

// ── Tool ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tool {
    Select,
    Rectangle,
}

// ── ContextMenuTarget ─────────────────────────────────────────────────────────

/// Describes what was under the cursor when right-mouse-button was pressed.
/// Returned by [`CanvasState::on_rmb_press`].
#[derive(Debug, Clone)]
pub enum ContextMenuTarget {
    /// The cursor was over one or more nodes; `node_ids` is the current selection.
    Object { node_ids: Vec<NodeId> },
    /// The cursor was over the empty canvas background.
    Canvas,
}

// ── Ruler helpers ─────────────────────────────────────────────────────────────

/// Pick the smallest "nice" number in the 1-2-5 sequence that is ≥ `world_target`.
fn nice_ruler_step(world_target: f64) -> f64 {
    if world_target <= 0.0 {
        return 1.0;
    }
    let exp = world_target.log10().floor();
    let base = 10f64.powi(exp as i32);
    let frac = world_target / base;
    if frac <= 1.0 {
        base
    } else if frac <= 2.0 {
        2.0 * base
    } else if frac <= 5.0 {
        5.0 * base
    } else {
        10.0 * base
    }
}

/// 5×7 pixel bitmap font.  Indices 0–9 = digits, 10 = minus sign.
const RULER_GLYPHS: [[u8; 7]; 11] = [
    [
        0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110,
    ], // 0
    [
        0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110,
    ], // 1
    [
        0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111,
    ], // 2
    [
        0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110,
    ], // 3
    [
        0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010,
    ], // 4
    [
        0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110,
    ], // 5
    [
        0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110,
    ], // 6
    [
        0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000,
    ], // 7
    [
        0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110,
    ], // 8
    [
        0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110,
    ], // 9
    [
        0b00000, 0b00000, 0b00000, 0b01110, 0b00000, 0b00000, 0b00000,
    ], // −
];

// ── CanvasState ───────────────────────────────────────────────────────────────

/// All platform-independent canvas state and rendering logic.
pub struct CanvasState {
    pub scene: Scene,

    pub viewport: Viewport,
    /// `false` until the first frame; `build_scene` centres the viewport once.
    pub vp_init: bool,

    /// All nodes in the scene graph (paint order: first = bottom, last = top).
    pub nodes: Vec<Node>,
    pub next_id: NodeId,
    /// Ids of currently selected nodes.
    pub selected: Vec<NodeId>,

    pub tool: Tool,
    pub drag: Drag,
    /// Original `(id, x_px, y_px)` for every selected node at Move drag start.
    pub move_origins: Vec<(NodeId, f64, f64)>,
    pub mouse_sx: f64,
    pub mouse_sy: f64,
    pub space_held: bool,
    pub shift_held: bool,
}

impl CanvasState {
    pub fn new() -> Self {
        Self {
            scene: Scene::new(),
            viewport: Viewport {
                x: -640.0,
                y: -400.0,
                zoom: 1.0,
            },
            vp_init: false,
            nodes: Vec::new(),
            next_id: 0,
            selected: Vec::new(),
            tool: Tool::Select,
            drag: Drag::None,
            move_origins: Vec::new(),
            mouse_sx: 0.0,
            mouse_sy: 0.0,
            space_held: false,
            shift_held: false,
        }
    }

    /// Serialize canvas state to a snapshot for persistence.
    pub fn to_snapshot(&self) -> CanvasSnapshot {
        let ctx = canvas_ctx();
        let nodes: Vec<NodeSnapshot> = self
            .nodes
            .iter()
            .map(|n| {
                let fill = n.fill_color().map(|c| {
                    let (r, g, b, a) = to_rgba_components(c);
                    [r as f64 / 255.0, g as f64 / 255.0, b as f64 / 255.0, a]
                });
                NodeSnapshot {
                    id: n.id,
                    children: n.children.clone(),
                    x: n.x(&ctx),
                    y: n.y(&ctx),
                    w: n.w(&ctx),
                    h: n.h(&ctx),
                    fill,
                }
            })
            .collect();
        CanvasSnapshot {
            nodes,
            next_id: self.next_id,
            viewport: ViewportSnapshot {
                x: self.viewport.x,
                y: self.viewport.y,
                zoom: self.viewport.zoom,
            },
        }
    }

    /// Serialize to JSON string for persistence.
    pub fn to_snapshot_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(&self.to_snapshot())
    }

    /// Restore from JSON string. Returns error if invalid.
    pub fn load_snapshot_json(&mut self, json: &str) -> Result<(), serde_json::Error> {
        let s: CanvasSnapshot = serde_json::from_str(json)?;
        self.load_snapshot(&s);
        Ok(())
    }

    /// Restore canvas state from a snapshot. Clears current state first.
    pub fn load_snapshot(&mut self, s: &CanvasSnapshot) {
        self.nodes.clear();
        self.selected.clear();
        self.move_origins.clear();
        self.drag = Drag::None;
        self.next_id = s.next_id;
        // Only apply remote viewport if it differs from the default (local viewport should stay local)
        if s.viewport.x != -640.0 || s.viewport.y != -400.0 || s.viewport.zoom != 1.0 {
            self.viewport.x = s.viewport.x;
            self.viewport.y = s.viewport.y;
            self.viewport.zoom = s.viewport.zoom;
        }
        for n in &s.nodes {
            let mut node = Node::from_rect(n.id, Rect::new(n.x, n.y, n.x + n.w, n.y + n.h));
            node.children = n.children.clone();
            if let Some([r, g, b, a]) = n.fill {
                let r8 = (r * 255.0).round() as u8;
                let g8 = (g * 255.0).round() as u8;
                let b8 = (b * 255.0).round() as u8;
                node.set_fill(ColorValue::Rgba(r8, g8, b8, a));
            }
            self.nodes.push(node);
        }
    }

    // ── Internal helpers ──────────────────────────────────────────────────

    fn add_node(&mut self, r: Rect) -> NodeId {
        let id = self.next_id;
        self.next_id += 1;
        self.nodes.push(Node::from_rect(id, r));
        id
    }

    fn hit_node(&self, wx: f64, wy: f64) -> Option<NodeId> {
        let ctx = canvas_ctx();
        self.nodes
            .iter()
            .rev()
            .find(|n| n.contains(wx, wy, &ctx))
            .map(|n| n.id)
    }

    fn marquee_select(&self, r: Rect) -> Vec<NodeId> {
        let ctx = canvas_ctx();
        self.nodes
            .iter()
            .filter(|n| n.intersects(r, &ctx))
            .map(|n| n.id)
            .collect()
    }

    // ── Handle hit-testing ────────────────────────────────────────────────

    pub fn find_handle(&self, msx: f64, msy: f64) -> Option<(NodeId, Handle)> {
        const RADIUS: f64 = 8.0;
        let vp = self.viewport;
        let ctx = canvas_ctx();
        for &id in &self.selected {
            let Some(node) = self.nodes.iter().find(|n| n.id == id) else {
                continue;
            };
            let r = node.world_rect(&ctx);
            let (sx0, sy0) = vp.to_screen(r.x0, r.y0);
            let (sx1, sy1) = vp.to_screen(r.x1, r.y1);
            let mx = (sx0 + sx1) / 2.0;
            let my = (sy0 + sy1) / 2.0;
            let candidates = [
                (sx0, sy0, Handle::TopLeft),
                (mx, sy0, Handle::Top),
                (sx1, sy0, Handle::TopRight),
                (sx0, my, Handle::Left),
                (sx1, my, Handle::Right),
                (sx0, sy1, Handle::BottomLeft),
                (mx, sy1, Handle::Bottom),
                (sx1, sy1, Handle::BottomRight),
            ];
            for (hx, hy, h) in candidates {
                if (msx - hx).hypot(msy - hy) <= RADIUS {
                    return Some((id, h));
                }
            }
        }
        None
    }

    pub fn hovering_body(&self, msx: f64, msy: f64) -> bool {
        let (wx, wy) = self.viewport.to_world(msx, msy);
        let ctx = canvas_ctx();
        self.selected.iter().any(|&id| {
            self.nodes
                .iter()
                .find(|n| n.id == id)
                .map(|n| n.contains(wx, wy, &ctx))
                .unwrap_or(false)
        })
    }

    // ── Effective rect (applies live drag transformation) ─────────────────

    fn effective_rect(
        node_id: NodeId,
        base: Rect,
        drag: Drag,
        selected: &[NodeId],
        move_origins: &[(NodeId, f64, f64)],
        vp: Viewport,
        msx: f64,
        msy: f64,
    ) -> Rect {
        match drag {
            Drag::Move { start_wx, start_wy } if selected.contains(&node_id) => {
                let (mwx, mwy) = vp.to_world(msx, msy);
                let dx = mwx - start_wx;
                let dy = mwy - start_wy;
                if let Some(&(_, ox, oy)) = move_origins.iter().find(|&&(id, ..)| id == node_id) {
                    let nx = (ox + dx).round();
                    let ny = (oy + dy).round();
                    return Rect::new(nx, ny, nx + base.width(), ny + base.height());
                }
                base
            }
            Drag::Resize {
                obj_id,
                handle,
                orig_x,
                orig_y,
                orig_w,
                orig_h,
            } if obj_id == node_id => {
                let (mwx, mwy) = vp.to_world(msx, msy);
                let orig = Rect::new(orig_x, orig_y, orig_x + orig_w, orig_y + orig_h);
                Self::apply_resize(orig, handle, mwx.round(), mwy.round())
            }
            _ => base,
        }
    }

    pub fn apply_resize(orig: Rect, handle: Handle, nx: f64, ny: f64) -> Rect {
        const MIN: f64 = 1.0;
        let (x0, y0, x1, y1) = (orig.x0, orig.y0, orig.x1, orig.y1);
        match handle {
            Handle::TopLeft => Rect::new(nx.min(x1 - MIN), ny.min(y1 - MIN), x1, y1),
            Handle::Top => Rect::new(x0, ny.min(y1 - MIN), x1, y1),
            Handle::TopRight => Rect::new(x0, ny.min(y1 - MIN), nx.max(x0 + MIN), y1),
            Handle::Left => Rect::new(nx.min(x1 - MIN), y0, x1, y1),
            Handle::Right => Rect::new(x0, y0, nx.max(x0 + MIN), y1),
            Handle::BottomLeft => Rect::new(nx.min(x1 - MIN), y0, x1, ny.max(y0 + MIN)),
            Handle::Bottom => Rect::new(x0, y0, x1, ny.max(y0 + MIN)),
            Handle::BottomRight => Rect::new(x0, y0, nx.max(x0 + MIN), ny.max(y0 + MIN)),
        }
    }

    // ── Cursor ────────────────────────────────────────────────────────────

    pub fn cursor_for_state(&self) -> CursorIcon {
        match self.drag {
            Drag::Pan { .. } => CursorIcon::Grabbing,
            Drag::Move { .. } => CursorIcon::Move,
            Drag::Resize { handle, .. } => handle.cursor(),
            _ if self.space_held => CursorIcon::Grab,
            _ => match self.tool {
                Tool::Rectangle => CursorIcon::Crosshair,
                Tool::Select => {
                    if let Some((_, h)) = self.find_handle(self.mouse_sx, self.mouse_sy) {
                        return h.cursor();
                    }
                    if self.hovering_body(self.mouse_sx, self.mouse_sy) {
                        return CursorIcon::Move;
                    }
                    CursorIcon::Default
                }
            },
        }
    }

    fn snap(wx: f64, wy: f64) -> (f64, f64) {
        (wx.round(), wy.round())
    }

    // ── Scene building ────────────────────────────────────────────────────

    pub fn build_scene(&mut self, win_w: u32, win_h: u32) {
        if !self.vp_init {
            self.viewport = Viewport::centered(win_w as f64, win_h as f64);
            self.vp_init = true;
        }
        self.scene.reset();
        let ww = win_w as f64;
        let wh = win_h as f64;

        // Background
        self.scene.fill(
            Fill::NonZero,
            Affine::IDENTITY,
            palette::CANVAS_BG,
            None,
            &Rect::new(0.0, 0.0, ww, wh),
        );

        self.draw_grid(ww, wh);
        self.draw_origin_axes(ww, wh);

        let drag = self.drag;
        let vp = self.viewport;
        let msx = self.mouse_sx;
        let msy = self.mouse_sy;
        let affine = vp.affine();
        let bw = (1.0 / vp.zoom).max(0.3);
        let border = Stroke::new(bw);
        let ctx = canvas_ctx();

        // Compute effective (possibly drag-transformed) rects for all nodes.
        let eff: Vec<(NodeId, Rect)> = self
            .nodes
            .iter()
            .map(|node| {
                (
                    node.id,
                    Self::effective_rect(
                        node.id,
                        node.world_rect(&ctx),
                        drag,
                        &self.selected,
                        &self.move_origins,
                        vp,
                        msx,
                        msy,
                    ),
                )
            })
            .collect();

        // Draw each node, using its `Fill` property if set; fall back to OBJ_FILL.
        for (id, r) in &eff {
            let fill = self
                .nodes
                .iter()
                .find(|n| n.id == *id)
                .and_then(|n| n.fill_color())
                .map(color_to_vello)
                .unwrap_or(palette::OBJ_FILL);
            self.scene.fill(Fill::NonZero, affine, fill, None, r);
            self.scene
                .stroke(&border, affine, palette::OBJ_STROKE, None, r);
        }

        // Selection outlines + handles
        let sel_ids = self.selected.clone();
        for id in &sel_ids {
            let Some(r) = eff.iter().find(|(eid, _)| eid == id).map(|(_, r)| *r) else {
                continue;
            };
            let (sx0, sy0) = vp.to_screen(r.x0, r.y0);
            let (sx1, sy1) = vp.to_screen(r.x1, r.y1);
            let sr = Rect::new(sx0, sy0, sx1, sy1);

            self.scene.stroke(
                &Stroke::new(1.5),
                Affine::IDENTITY,
                palette::SEL_COLOR,
                None,
                &sr,
            );

            let mid_x = (sx0 + sx1) / 2.0;
            let mid_y = (sy0 + sy1) / 2.0;
            let corners = [(sx0, sy0), (sx1, sy0), (sx1, sy1), (sx0, sy1)];
            let mids = [(mid_x, sy0), (mid_x, sy1), (sx0, mid_y), (sx1, mid_y)];
            for (hx, hy) in corners {
                let h = Rect::new(hx - 4.0, hy - 4.0, hx + 4.0, hy + 4.0);
                self.scene
                    .fill(Fill::NonZero, Affine::IDENTITY, palette::HANDLE_F, None, &h);
                self.scene.stroke(
                    &Stroke::new(1.5),
                    Affine::IDENTITY,
                    palette::SEL_COLOR,
                    None,
                    &h,
                );
            }
            for (hx, hy) in mids {
                let h = Rect::new(hx - 3.5, hy - 3.5, hx + 3.5, hy + 3.5);
                self.scene
                    .fill(Fill::NonZero, Affine::IDENTITY, palette::HANDLE_F, None, &h);
                self.scene.stroke(
                    &Stroke::new(1.5),
                    Affine::IDENTITY,
                    palette::SEL_COLOR,
                    None,
                    &h,
                );
            }

            if let Drag::Resize { obj_id, .. } = drag {
                if obj_id == *id {
                    let wdim = r.width() as i64;
                    let hdim = r.height() as i64;
                    self.draw_dim_badge(wdim, hdim, (sx0 + sx1) / 2.0, sy1.max(sy0) + 14.0);
                }
            }
        }

        if matches!(drag, Drag::Move { .. }) {
            if let Some(&first_id) = sel_ids.first() {
                if let Some((_, r)) = eff.iter().find(|(id, _)| *id == first_id) {
                    let (sx0, _sy0) = vp.to_screen(r.x0, r.y0);
                    let (sx1, _) = vp.to_screen(r.x1, r.y1);
                    let sy_top = vp.to_screen(r.x0, r.y0).1.min(vp.to_screen(r.x0, r.y1).1);
                    self.draw_dim_badge(r.x0 as i64, r.y0 as i64, (sx0 + sx1) / 2.0, sy_top - 14.0);
                }
            }
        }

        // Draw-new-rect preview
        if let Drag::Draw { wx, wy } = drag {
            let (ex, ey) = vp.to_world(msx, msy);
            let (sx0w, sy0w) = Self::snap(wx, wy);
            let (sx1w, sy1w) = Self::snap(ex, ey);
            let wr = Rect::new(
                sx0w.min(sx1w),
                sy0w.min(sy1w),
                sx0w.max(sx1w),
                sy0w.max(sy1w),
            );
            let pw = (1.0 / vp.zoom).max(0.5);
            self.scene
                .fill(Fill::NonZero, affine, palette::PREV_FILL, None, &wr);
            self.scene
                .stroke(&Stroke::new(pw), affine, palette::PREV_STROKE, None, &wr);

            let (ssx0, ssy0) = vp.to_screen(wr.x0, wr.y0);
            let (ssx1, ssy1) = vp.to_screen(wr.x1, wr.y1);
            if (ssx1 - ssx0).abs() > 6.0 && (ssy1 - ssy0).abs() > 6.0 {
                for (px, py) in [(ssx0, ssy0), (ssx1, ssy0), (ssx1, ssy1), (ssx0, ssy1)] {
                    self.scene.fill(
                        Fill::NonZero,
                        Affine::IDENTITY,
                        Color::from_rgba8(255, 255, 255, 255),
                        None,
                        &Circle::new(Point::new(px, py), 4.5),
                    );
                    self.scene.fill(
                        Fill::NonZero,
                        Affine::IDENTITY,
                        palette::SEL_COLOR,
                        None,
                        &Circle::new(Point::new(px, py), 3.0),
                    );
                }
                self.draw_dim_badge(
                    wr.width() as i64,
                    wr.height() as i64,
                    (ssx0 + ssx1) / 2.0,
                    ssy1.max(ssy0) + 14.0,
                );
            }
        }

        // Marquee rubber-band
        if let Drag::Marquee { wx, wy } = drag {
            let (ex, ey) = vp.to_world(msx, msy);
            let (sx0, sy0) = vp.to_screen(wx, wy);
            let (sx1, sy1) = vp.to_screen(ex, ey);
            let mr = Rect::new(sx0.min(sx1), sy0.min(sy1), sx0.max(sx1), sy0.max(sy1));
            self.scene.fill(
                Fill::NonZero,
                Affine::IDENTITY,
                palette::SEL_FILL,
                None,
                &mr,
            );
            self.scene.stroke(
                &Stroke::new(1.0),
                Affine::IDENTITY,
                palette::SEL_COLOR,
                None,
                &mr,
            );
        }

        self.draw_ruler(ww, wh);
    }

    // ── Grid ──────────────────────────────────────────────────────────────

    fn smoothstep(t: f64) -> f64 {
        let c = t.clamp(0.0, 1.0);
        c * c * (3.0 - 2.0 * c)
    }

    fn draw_grid(&mut self, ww: f64, wh: f64) {
        let zoom = self.viewport.zoom;

        let zoom_out = Self::smoothstep((zoom - 0.1) / 0.05);
        if zoom_out < 0.01 {
            return;
        }

        let zoom_in = Self::smoothstep((500.0 - zoom) / 100.0);
        if zoom_in < 0.01 {
            return;
        }

        let global = zoom_out * zoom_in;

        const LEVELS: [(f64, u8, f64); 4] = [
            (1.0, 36, 0.5),
            (10.0, 55, 0.5),
            (100.0, 80, 0.5),
            (1000.0, 120, 1.0),
        ];
        let (wx0, wy0) = self.viewport.to_world(0.0, 0.0);
        let (wx1, wy1) = self.viewport.to_world(ww, wh);
        for (ws, max_a, lw) in LEVELS {
            let level_alpha = Self::smoothstep((ws * zoom - 4.0) / 6.0);
            let alpha = level_alpha * global;
            if alpha < 0.01 {
                continue;
            }
            let a = (max_a as f64 * alpha).round() as u8;
            self.draw_grid_lines(
                ws,
                Color::from_rgba8(palette::GRID_R, palette::GRID_G, palette::GRID_B, a),
                lw,
                wx0,
                wy0,
                wx1,
                wy1,
                ww,
                wh,
            );
        }
    }

    fn draw_grid_lines(
        &mut self,
        sp: f64,
        color: Color,
        lw: f64,
        wx0: f64,
        wy0: f64,
        wx1: f64,
        wy1: f64,
        ww: f64,
        wh: f64,
    ) {
        let vp = self.viewport;
        let xi0 = (wx0 / sp).floor() as i64;
        let xi1 = (wx1 / sp).ceil() as i64;
        let yi0 = (wy0 / sp).floor() as i64;
        let yi1 = (wy1 / sp).ceil() as i64;
        if (xi1 - xi0).abs() > 4000 || (yi1 - yi0).abs() > 4000 {
            return;
        }

        let mut vl = BezPath::new();
        for i in xi0..=xi1 {
            let (sx, _) = vp.to_screen(i as f64 * sp, 0.0);
            vl.move_to(Point::new(sx, 0.0));
            vl.line_to(Point::new(sx, wh));
        }
        let mut hl = BezPath::new();
        for i in yi0..=yi1 {
            let (_, sy) = vp.to_screen(0.0, i as f64 * sp);
            hl.move_to(Point::new(0.0, sy));
            hl.line_to(Point::new(ww, sy));
        }
        let s = Stroke::new(lw);
        self.scene.stroke(&s, Affine::IDENTITY, color, None, &vl);
        self.scene.stroke(&s, Affine::IDENTITY, color, None, &hl);
    }

    fn draw_origin_axes(&mut self, ww: f64, wh: f64) {
        let vp = self.viewport;
        let (ox, oy) = vp.to_screen(0.0, 0.0);
        if oy > RULER_W - 2.0 && oy < wh + 2.0 {
            let mut p = BezPath::new();
            p.move_to(Point::new(RULER_W, oy));
            p.line_to(Point::new(ww, oy));
            self.scene.stroke(
                &Stroke::new(1.0),
                Affine::IDENTITY,
                palette::AXIS_Y,
                None,
                &p,
            );
        }
        if ox > RULER_W - 2.0 && ox < ww + 2.0 {
            let mut p = BezPath::new();
            p.move_to(Point::new(ox, RULER_W));
            p.line_to(Point::new(ox, wh));
            self.scene.stroke(
                &Stroke::new(1.0),
                Affine::IDENTITY,
                palette::AXIS_X,
                None,
                &p,
            );
        }
    }

    // ── Rulers ───────────────────────────────────────────────────────────

    fn draw_ruler(&mut self, ww: f64, wh: f64) {
        let rw = RULER_W;

        self.scene.fill(
            Fill::NonZero,
            Affine::IDENTITY,
            palette::RULER_BG,
            None,
            &Rect::new(0.0, 0.0, rw, rw),
        );
        self.scene.fill(
            Fill::NonZero,
            Affine::IDENTITY,
            palette::RULER_BG,
            None,
            &Rect::new(rw, 0.0, ww, rw),
        );
        self.scene.fill(
            Fill::NonZero,
            Affine::IDENTITY,
            palette::RULER_BG,
            None,
            &Rect::new(0.0, rw, rw, wh),
        );

        let sep = Stroke::new(1.0);
        {
            let mut p = BezPath::new();
            p.move_to(Point::new(0.0, rw));
            p.line_to(Point::new(ww, rw));
            self.scene
                .stroke(&sep, Affine::IDENTITY, palette::RULER_EDGE, None, &p);
        }
        {
            let mut p = BezPath::new();
            p.move_to(Point::new(rw, 0.0));
            p.line_to(Point::new(rw, wh));
            self.scene
                .stroke(&sep, Affine::IDENTITY, palette::RULER_EDGE, None, &p);
        }

        let vp = self.viewport;
        let zoom = vp.zoom;
        let major = nice_ruler_step(90.0 / zoom);
        let minor = major / 5.0;
        let minor_px = minor * zoom;

        // Top ruler
        let (wx0, _) = vp.to_world(rw, 0.0);
        let (wx1, _) = vp.to_world(ww, 0.0);

        if minor_px >= 3.0 {
            let i0 = (wx0 / minor).floor() as i64;
            let i1 = (wx1 / minor).ceil() as i64;
            for i in i0..=i1 {
                if i % 5 == 0 {
                    continue;
                }
                let (sx, _) = vp.to_screen(i as f64 * minor, 0.0);
                if sx < rw || sx > ww {
                    continue;
                }
                let mut p = BezPath::new();
                p.move_to(Point::new(sx, rw - 8.0));
                p.line_to(Point::new(sx, rw));
                self.scene.stroke(
                    &Stroke::new(0.5),
                    Affine::IDENTITY,
                    palette::RULER_TICK,
                    None,
                    &p,
                );
            }
        }
        {
            let i0 = (wx0 / major).floor() as i64;
            let i1 = (wx1 / major).ceil() as i64;
            for i in i0..=i1 {
                let wx = i as f64 * major;
                let (sx, _) = vp.to_screen(wx, 0.0);
                if sx < rw || sx > ww {
                    continue;
                }
                let mut p = BezPath::new();
                p.move_to(Point::new(sx, rw - 16.0));
                p.line_to(Point::new(sx, rw));
                self.scene.stroke(
                    &Stroke::new(0.5),
                    Affine::IDENTITY,
                    palette::RULER_TICK,
                    None,
                    &p,
                );
                self.draw_ruler_num(wx as i64, Affine::translate((sx, rw * 0.42)));
            }
        }

        // Left ruler
        let (_, wy0) = vp.to_world(0.0, rw);
        let (_, wy1) = vp.to_world(0.0, wh);

        if minor_px >= 3.0 {
            let i0 = (wy0 / minor).floor() as i64;
            let i1 = (wy1 / minor).ceil() as i64;
            for i in i0..=i1 {
                if i % 5 == 0 {
                    continue;
                }
                let (_, sy) = vp.to_screen(0.0, i as f64 * minor);
                if sy < rw || sy > wh {
                    continue;
                }
                let mut p = BezPath::new();
                p.move_to(Point::new(rw - 8.0, sy));
                p.line_to(Point::new(rw, sy));
                self.scene.stroke(
                    &Stroke::new(0.5),
                    Affine::IDENTITY,
                    palette::RULER_TICK,
                    None,
                    &p,
                );
            }
        }
        {
            let i0 = (wy0 / major).floor() as i64;
            let i1 = (wy1 / major).ceil() as i64;
            for i in i0..=i1 {
                let wy = i as f64 * major;
                let (_, sy) = vp.to_screen(0.0, wy);
                if sy < rw || sy > wh {
                    continue;
                }
                let mut p = BezPath::new();
                p.move_to(Point::new(rw - 16.0, sy));
                p.line_to(Point::new(rw, sy));
                self.scene.stroke(
                    &Stroke::new(0.5),
                    Affine::IDENTITY,
                    palette::RULER_TICK,
                    None,
                    &p,
                );
                let a = Affine::new([0.0, -1.0, 1.0, 0.0, rw * 0.5, sy]);
                self.draw_ruler_num(wy as i64, a);
            }
        }
    }

    fn draw_ruler_num(&mut self, value: i64, affine: Affine) {
        const PX: f64 = 2.0;
        const GW: f64 = 5.0;
        const GH: f64 = 7.0;
        const GAP: f64 = 2.0;

        let abs_v = value.unsigned_abs() as u64;
        let is_neg = value < 0;

        let mut glyphs: Vec<usize> = Vec::new();
        if is_neg {
            glyphs.push(10);
        }
        if abs_v == 0 {
            glyphs.push(0);
        } else {
            let mut tmp: Vec<usize> = Vec::new();
            let mut v = abs_v;
            while v > 0 {
                tmp.push((v % 10) as usize);
                v /= 10;
            }
            tmp.reverse();
            glyphs.extend(tmp);
        }

        let char_w = GW * PX;
        let n = glyphs.len() as f64;
        let total_w = n * char_w + (n - 1.0) * GAP;
        let x0 = -total_w / 2.0;
        let y0 = -(GH * PX) / 2.0;

        for (ci, &gi) in glyphs.iter().enumerate() {
            let lx = x0 + ci as f64 * (char_w + GAP);
            for (row, &bits) in RULER_GLYPHS[gi].iter().enumerate() {
                for col in 0u8..5 {
                    if bits & (1 << (4 - col)) != 0 {
                        let px = lx + col as f64 * PX;
                        let py = y0 + row as f64 * PX;
                        self.scene.fill(
                            Fill::NonZero,
                            affine,
                            palette::RULER_TEXT,
                            None,
                            &Rect::new(px, py, px + PX, py + PX),
                        );
                    }
                }
            }
        }
    }

    // ── Toolbar ───────────────────────────────────────────────────────────

    // ── Dimension badge ───────────────────────────────────────────────────

    fn draw_dim_badge(&mut self, a: i64, b: i64, cx: f64, cy: f64) {
        let bw = 60.0_f64;
        let bh = 18.0_f64;
        let bx = cx - bw / 2.0;
        let by = cy - bh / 2.0;
        self.scene.fill(
            Fill::NonZero,
            Affine::IDENTITY,
            Color::from_rgba8(24, 160, 251, 220),
            None,
            &RoundedRect::new(bx, by, bx + bw, by + bh, bh / 2.0),
        );
        self.draw_ticks(a, bx + 8.0, by + bh / 2.0);
        self.scene.fill(
            Fill::NonZero,
            Affine::IDENTITY,
            Color::from_rgba8(255, 255, 255, 180),
            None,
            &Circle::new(Point::new(bx + bw / 2.0, by + bh / 2.0), 1.5),
        );
        self.draw_ticks(b, bx + bw / 2.0 + 6.0, by + bh / 2.0);
    }

    fn draw_ticks(&mut self, val: i64, x: f64, cy: f64) {
        let v = val.clamp(0, 9999) as u64;
        let digits = [(v / 1000) % 10, (v / 100) % 10, (v / 10) % 10, v % 10];
        let start = digits.iter().position(|&d| d > 0).unwrap_or(3);
        let sw = 3.5_f64;
        let gap = 1.2_f64;
        let total = (4 - start) as f64 * (sw + gap);
        let mut cx = x - total / 2.0 + sw / 2.0;
        for i in start..4 {
            self.draw_digit(digits[i], cx, cy);
            cx += sw + gap;
        }
    }

    fn draw_digit(&mut self, d: u64, cx: f64, cy: f64) {
        let s = Stroke::new(1.0);
        let col = Color::from_rgba8(255, 255, 255, 230);
        let mut p = BezPath::new();
        let (hw, hh) = (1.5_f64, 2.5_f64);
        macro_rules! seg {
            (top) => {
                p.move_to(Point::new(cx - hw + 0.5, cy - hh));
                p.line_to(Point::new(cx + hw - 0.5, cy - hh));
            };
            (mid) => {
                p.move_to(Point::new(cx - hw + 0.5, cy));
                p.line_to(Point::new(cx + hw - 0.5, cy));
            };
            (bot) => {
                p.move_to(Point::new(cx - hw + 0.5, cy + hh));
                p.line_to(Point::new(cx + hw - 0.5, cy + hh));
            };
            (tl) => {
                p.move_to(Point::new(cx - hw, cy - hh + 0.5));
                p.line_to(Point::new(cx - hw, cy - 0.5));
            };
            (tr) => {
                p.move_to(Point::new(cx + hw, cy - hh + 0.5));
                p.line_to(Point::new(cx + hw, cy - 0.5));
            };
            (bl) => {
                p.move_to(Point::new(cx - hw, cy + 0.5));
                p.line_to(Point::new(cx - hw, cy + hh - 0.5));
            };
            (br) => {
                p.move_to(Point::new(cx + hw, cy + 0.5));
                p.line_to(Point::new(cx + hw, cy + hh - 0.5));
            };
        }
        match d {
            0 => {
                seg!(top);
                seg!(tl);
                seg!(tr);
                seg!(bl);
                seg!(br);
                seg!(bot);
            }
            1 => {
                seg!(tr);
                seg!(br);
            }
            2 => {
                seg!(top);
                seg!(tr);
                seg!(mid);
                seg!(bl);
                seg!(bot);
            }
            3 => {
                seg!(top);
                seg!(tr);
                seg!(mid);
                seg!(br);
                seg!(bot);
            }
            4 => {
                seg!(tl);
                seg!(tr);
                seg!(mid);
                seg!(br);
            }
            5 => {
                seg!(top);
                seg!(tl);
                seg!(mid);
                seg!(br);
                seg!(bot);
            }
            6 => {
                seg!(top);
                seg!(tl);
                seg!(mid);
                seg!(bl);
                seg!(br);
                seg!(bot);
            }
            7 => {
                seg!(top);
                seg!(tr);
                seg!(br);
            }
            8 => {
                seg!(top);
                seg!(tl);
                seg!(tr);
                seg!(mid);
                seg!(bl);
                seg!(br);
                seg!(bot);
            }
            9 => {
                seg!(top);
                seg!(tl);
                seg!(tr);
                seg!(mid);
                seg!(br);
                seg!(bot);
            }
            _ => {}
        }
        self.scene.stroke(&s, Affine::IDENTITY, col, None, &p);
    }

    // ── Input handlers ────────────────────────────────────────────────────

    /// Handle a left-mouse-button press.  Returns the cursor to display.
    pub fn on_lmb_press(&mut self) -> CursorIcon {
        let msx = self.mouse_sx;
        let msy = self.mouse_sy;

        if self.space_held {
            self.drag = Drag::Pan {
                last_sx: msx,
                last_sy: msy,
            };
            return CursorIcon::Grabbing;
        }

        match self.tool {
            Tool::Rectangle => {
                let (wx, wy) = self.viewport.to_world(msx, msy);
                self.drag = Drag::Draw { wx, wy };
                CursorIcon::Crosshair
            }

            Tool::Select => {
                // Resize handle?
                if let Some((node_id, handle)) = self.find_handle(msx, msy) {
                    let ctx = canvas_ctx();
                    let node = self.nodes.iter().find(|n| n.id == node_id).unwrap();
                    let r = node.world_rect(&ctx);
                    self.drag = Drag::Resize {
                        obj_id: node_id,
                        handle,
                        orig_x: r.x0,
                        orig_y: r.y0,
                        orig_w: r.width(),
                        orig_h: r.height(),
                    };
                    return handle.cursor();
                }

                let (wx, wy) = self.viewport.to_world(msx, msy);
                let ctx = canvas_ctx();

                // Clicked inside already-selected node → start move.
                let hit_selected = self.selected.iter().any(|&id| {
                    self.nodes
                        .iter()
                        .find(|n| n.id == id)
                        .map(|n| n.contains(wx, wy, &ctx))
                        .unwrap_or(false)
                });

                if hit_selected {
                    self.move_origins = self
                        .selected
                        .iter()
                        .filter_map(|&id| self.nodes.iter().find(|n| n.id == id))
                        .map(|n| (n.id, n.x(&ctx), n.y(&ctx)))
                        .collect();
                    self.drag = Drag::Move {
                        start_wx: wx,
                        start_wy: wy,
                    };
                    return CursorIcon::Move;
                }

                // Hit an unselected node → select and start move.
                if let Some(id) = self.hit_node(wx, wy) {
                    if self.shift_held {
                        if self.selected.contains(&id) {
                            self.selected.retain(|&x| x != id);
                        } else {
                            self.selected.push(id);
                        }
                    } else {
                        self.selected = vec![id];
                    }
                    self.move_origins = self
                        .selected
                        .iter()
                        .filter_map(|&sid| self.nodes.iter().find(|n| n.id == sid))
                        .map(|n| (n.id, n.x(&ctx), n.y(&ctx)))
                        .collect();
                    self.drag = Drag::Move {
                        start_wx: wx,
                        start_wy: wy,
                    };
                    return CursorIcon::Move;
                }

                // Empty area → marquee.
                if !self.shift_held {
                    self.selected.clear();
                }
                self.drag = Drag::Marquee { wx, wy };
                CursorIcon::Default
            }
        }
    }

    pub fn on_lmb_release(&mut self) {
        let msx = self.mouse_sx;
        let msy = self.mouse_sy;
        let (ex, ey) = self.viewport.to_world(msx, msy);
        let prev = self.drag;
        self.drag = Drag::None;

        match prev {
            Drag::Draw { wx, wy } => {
                let (sx0, sy0) = Self::snap(wx, wy);
                let (sx1, sy1) = Self::snap(ex, ey);
                let r = Rect::new(sx0.min(sx1), sy0.min(sy1), sx0.max(sx1), sy0.max(sy1));
                if r.width() >= 1.0 && r.height() >= 1.0 {
                    let id = self.add_node(r);
                    self.selected = vec![id];
                }
            }

            Drag::Move { start_wx, start_wy } => {
                let dx = ex - start_wx;
                let dy = ey - start_wy;
                let origins = self.move_origins.clone();
                for (id, ox, oy) in origins {
                    if let Some(node) = self.nodes.iter_mut().find(|n| n.id == id) {
                        node.set_position((ox + dx).round(), (oy + dy).round());
                    }
                }
                self.move_origins.clear();
            }

            Drag::Resize {
                obj_id,
                handle,
                orig_x,
                orig_y,
                orig_w,
                orig_h,
            } => {
                let orig = Rect::new(orig_x, orig_y, orig_x + orig_w, orig_y + orig_h);
                let new_r = Self::apply_resize(orig, handle, ex.round(), ey.round());
                if let Some(node) = self.nodes.iter_mut().find(|n| n.id == obj_id) {
                    node.set_position(new_r.x0, new_r.y0);
                    node.set_size(new_r.width(), new_r.height());
                }
            }

            Drag::Marquee { wx, wy } => {
                let r = Rect::new(wx.min(ex), wy.min(ey), wx.max(ex), wy.max(ey));
                if r.width() > 1.0 && r.height() > 1.0 {
                    let ids = self.marquee_select(r);
                    if self.shift_held {
                        for id in ids {
                            if !self.selected.contains(&id) {
                                self.selected.push(id);
                            }
                        }
                    } else {
                        self.selected = ids;
                    }
                }
            }
            _ => {}
        }
    }

    /// Handle a `CursorMoved` event.
    pub fn on_cursor_moved(&mut self, sx: f64, sy: f64) {
        if let Drag::Pan { last_sx, last_sy } = self.drag {
            self.viewport = self.viewport.pan(sx - last_sx, sy - last_sy);
            self.drag = Drag::Pan {
                last_sx: sx,
                last_sy: sy,
            };
        }
        self.mouse_sx = sx;
        self.mouse_sy = sy;
    }

    pub fn on_scroll_line(&mut self, dy: f32) {
        let f = if dy > 0.0 { 1.12 } else { 1.0 / 1.12 };
        self.viewport = self.viewport.zoom_toward(self.mouse_sx, self.mouse_sy, f);
    }

    pub fn on_scroll_pixel(&mut self, dx: f64, dy: f64) {
        self.viewport = self.viewport.pan(dx, dy);
    }

    pub fn on_pinch(&mut self, delta: f64) {
        self.viewport = self
            .viewport
            .zoom_toward(self.mouse_sx, self.mouse_sy, 1.0 + delta);
    }

    pub fn delete_selected(&mut self) {
        let sel = self.selected.clone();
        self.nodes.retain(|n| !sel.contains(&n.id));
        self.selected.clear();
    }

    pub fn cancel(&mut self) {
        self.drag = Drag::None;
        self.move_origins.clear();
        self.tool = Tool::Select;
    }

    pub fn set_tool_select(&mut self) {
        self.tool = Tool::Select;
        self.drag = Drag::None;
    }

    pub fn set_tool_rectangle(&mut self) {
        self.tool = Tool::Rectangle;
        self.drag = Drag::None;
    }

    /// Handle a right-mouse-button press.
    ///
    /// If the cursor is over an unselected node, that node is selected (replacing
    /// the selection unless Shift is held).  Returns what was hit so the platform
    /// layer can show the appropriate context menu.
    pub fn on_rmb_press(&mut self) -> ContextMenuTarget {
        let (wx, wy) = self.viewport.to_world(self.mouse_sx, self.mouse_sy);

        if let Some(id) = self.hit_node(wx, wy) {
            if !self.selected.contains(&id) {
                if self.shift_held {
                    self.selected.push(id);
                } else {
                    self.selected = vec![id];
                }
            }
            return ContextMenuTarget::Object {
                node_ids: self.selected.clone(),
            };
        }

        ContextMenuTarget::Canvas
    }
}

impl Default for CanvasState {
    fn default() -> Self {
        Self::new()
    }
}
