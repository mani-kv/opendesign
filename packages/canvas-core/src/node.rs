//! Unified Property System — the extensible building block of the scene graph.
//!
//! Every object on the canvas is a [`Node`].  Instead of rigid struct fields,
//! all visual and geometric attributes are stored in a `HashMap<PropertyKey,
//! PropertyValue>`.  This allows the engine to evolve (add border-radius,
//! shadows, auto-layout, …) without touching the core `Node` struct.
//!
//! # Usage
//!
//! ```ignore
//! let mut node = Node::from_rect(0, Rect::new(100.0, 200.0, 340.0, 320.0));
//! node.set(PropertyKey::Fill, PropertyValue::Color(ColorValue::Hex("#4F46E5".into())));
//!
//! let ctx  = SpacingContext::screen_default();
//! let rect = node.world_rect(&ctx); // → Rect { x0:100, y0:200, x1:340, y1:320 }
//! ```

use std::collections::HashMap;

use vello::kurbo::Rect;

use crate::design::color::ColorValue;
use crate::design::spacing::{SpacingContext, SpacingValue, resolve_spacing};
use crate::design::typography::TypographyStyle;

// ── Types ─────────────────────────────────────────────────────────────────────

/// Unique node identifier (monotonically increasing counter).
pub type NodeId = usize;

/// Typed keys for the property map.
///
/// Using an enum instead of plain strings prevents typos and enables IDE
/// completion.  New properties can be added here without changing `Node`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PropertyKey {
    // Geometry
    X,
    Y,
    Width,
    Height,
    // Spacing
    Padding,
    PaddingTop,
    PaddingRight,
    PaddingBottom,
    PaddingLeft,
    Margin,
    Gap,
    // Typography
    FontSize,
    FontFamily,
    FontWeight,
    LineHeight,
    LetterSpacing,
    // Visual
    Fill,
    TextColor,
    StrokeColor,
    StrokeWidth,
    BorderRadius,
    Opacity,
    // Behaviour
    Visible,
}

/// The value stored for a property key.
///
/// Variants cover all design value types.  At render time, `Spacing` variants
/// are resolved to `f64` pixels via [`Node::resolve_f64`].
#[derive(Debug, Clone)]
pub enum PropertyValue {
    /// Plain floating-point number (e.g. `line_height` multiplier, `opacity`).
    Number(f64),
    /// Free-form text (e.g. `font_family` name).
    Text(String),
    /// A design colour in any supported format.
    Color(ColorValue),
    /// A spacing/layout measurement (px, rem, %, etc.).
    Spacing(SpacingValue),
    /// A complete typography specification.
    Typography(TypographyStyle),
    /// Boolean flag (e.g. `visible`).
    Bool(bool),
}

// ── Node ─────────────────────────────────────────────────────────────────────

/// A node in the canvas scene graph.
///
/// Holds an `id`, an ordered list of `children` ids, and a property map that
/// stores all visual and layout attributes.  The node struct itself never
/// needs to change — new capabilities are added via new [`PropertyKey`] variants.
#[derive(Debug, Clone)]
pub struct Node {
    pub id:       NodeId,
    /// Ordered child node ids (back-to-front paint order).
    pub children: Vec<NodeId>,
    properties:   HashMap<PropertyKey, PropertyValue>,
}

impl Node {
    // ── Constructors ─────────────────────────────────────────────────────

    /// Create a new empty node.  All properties must be set explicitly.
    pub fn new(id: NodeId) -> Self {
        Self { id, children: Vec::new(), properties: HashMap::new() }
    }

    /// Create a node with geometry pre-set from a world-coordinate rectangle.
    ///
    /// Equivalent to calling `new` then `set_position` + `set_size`.
    pub fn from_rect(id: NodeId, r: Rect) -> Self {
        let mut n = Self::new(id);
        n.set_position(r.x0, r.y0);
        n.set_size(r.width(), r.height());
        n
    }

    // ── Property access ──────────────────────────────────────────────────

    /// Set (or replace) a property value.
    pub fn set(&mut self, key: PropertyKey, value: PropertyValue) {
        self.properties.insert(key, value);
    }

    /// Get a reference to a property value, or `None` if absent.
    pub fn get(&self, key: &PropertyKey) -> Option<&PropertyValue> {
        self.properties.get(key)
    }

    /// Remove a property, returning the old value if one existed.
    pub fn remove(&mut self, key: &PropertyKey) -> Option<PropertyValue> {
        self.properties.remove(key)
    }

    /// Resolve a `Spacing` or `Number` property to absolute pixels using the
    /// provided context.  Returns `None` if the key is absent or has a
    /// non-numeric variant.
    pub fn resolve_f64(&self, key: &PropertyKey, ctx: &SpacingContext) -> Option<f64> {
        match self.properties.get(key)? {
            PropertyValue::Spacing(s) => Some(resolve_spacing(s, ctx)),
            PropertyValue::Number(n)  => Some(*n),
            _                        => None,
        }
    }

    // ── Geometry convenience ─────────────────────────────────────────────

    /// Resolved X position in pixels.
    pub fn x(&self, ctx: &SpacingContext) -> f64 {
        self.resolve_f64(&PropertyKey::X, ctx).unwrap_or(0.0)
    }

    /// Resolved Y position in pixels.
    pub fn y(&self, ctx: &SpacingContext) -> f64 {
        self.resolve_f64(&PropertyKey::Y, ctx).unwrap_or(0.0)
    }

    /// Resolved width in pixels.
    pub fn w(&self, ctx: &SpacingContext) -> f64 {
        self.resolve_f64(&PropertyKey::Width, ctx).unwrap_or(0.0)
    }

    /// Resolved height in pixels.
    pub fn h(&self, ctx: &SpacingContext) -> f64 {
        self.resolve_f64(&PropertyKey::Height, ctx).unwrap_or(0.0)
    }

    /// Axis-aligned bounding rectangle in world coordinates.
    pub fn world_rect(&self, ctx: &SpacingContext) -> Rect {
        let x = self.x(ctx);
        let y = self.y(ctx);
        Rect::new(x, y, x + self.w(ctx), y + self.h(ctx))
    }

    /// `true` if world point `(wx, wy)` falls inside this node's bounding rect.
    pub fn contains(&self, wx: f64, wy: f64, ctx: &SpacingContext) -> bool {
        let x = self.x(ctx);
        let y = self.y(ctx);
        let w = self.w(ctx);
        let h = self.h(ctx);
        wx >= x && wx <= x + w && wy >= y && wy <= y + h
    }

    /// `true` if the node's bounding rect overlaps `r`.
    pub fn intersects(&self, r: Rect, ctx: &SpacingContext) -> bool {
        let x = self.x(ctx);
        let y = self.y(ctx);
        let w = self.w(ctx);
        let h = self.h(ctx);
        !(r.x1 < x || r.x0 > x + w || r.y1 < y || r.y0 > y + h)
    }

    // ── Geometry setters ─────────────────────────────────────────────────

    /// Set `X` and `Y` from raw pixel values.
    pub fn set_position(&mut self, x: f64, y: f64) {
        self.set(PropertyKey::X, PropertyValue::Spacing(SpacingValue::Px(x)));
        self.set(PropertyKey::Y, PropertyValue::Spacing(SpacingValue::Px(y)));
    }

    /// Set `Width` and `Height` from raw pixel values.
    pub fn set_size(&mut self, w: f64, h: f64) {
        self.set(PropertyKey::Width,  PropertyValue::Spacing(SpacingValue::Px(w)));
        self.set(PropertyKey::Height, PropertyValue::Spacing(SpacingValue::Px(h)));
    }

    // ── Visual setters / getters ─────────────────────────────────────────

    /// Set the fill colour.
    pub fn set_fill(&mut self, color: ColorValue) {
        self.set(PropertyKey::Fill, PropertyValue::Color(color));
    }

    /// Get the fill colour, if any.
    pub fn fill_color(&self) -> Option<&ColorValue> {
        if let Some(PropertyValue::Color(c)) = self.properties.get(&PropertyKey::Fill) {
            Some(c)
        } else {
            None
        }
    }

    /// Get the visibility flag (`true` if not explicitly set to `false`).
    pub fn is_visible(&self) -> bool {
        match self.properties.get(&PropertyKey::Visible) {
            Some(PropertyValue::Bool(v)) => *v,
            _ => true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn default_ctx() -> SpacingContext {
        SpacingContext::screen_default()
    }

    #[test]
    fn from_rect_stores_geometry() {
        let r    = Rect::new(10.0, 20.0, 110.0, 70.0);
        let node = Node::from_rect(0, r);
        let ctx  = default_ctx();
        assert_eq!(node.x(&ctx),  10.0);
        assert_eq!(node.y(&ctx),  20.0);
        assert_eq!(node.w(&ctx), 100.0);
        assert_eq!(node.h(&ctx),  50.0);
    }

    #[test]
    fn world_rect_matches_geometry() {
        let r    = Rect::new(0.0, 0.0, 200.0, 100.0);
        let node = Node::from_rect(1, r);
        let ctx  = default_ctx();
        assert_eq!(node.world_rect(&ctx), r);
    }

    #[test]
    fn contains_point_inside() {
        let node = Node::from_rect(2, Rect::new(0.0, 0.0, 100.0, 100.0));
        let ctx  = default_ctx();
        assert!(node.contains(50.0, 50.0, &ctx));
        assert!(!node.contains(150.0, 50.0, &ctx));
    }

    #[test]
    fn set_position_updates_properties() {
        let mut node = Node::new(3);
        node.set_position(30.0, 40.0);
        let ctx = default_ctx();
        assert_eq!(node.x(&ctx), 30.0);
        assert_eq!(node.y(&ctx), 40.0);
    }

    #[test]
    fn fill_color_roundtrip() {
        let mut node = Node::new(4);
        node.set_fill(ColorValue::Hex("#FF0000".into()));
        assert_eq!(node.fill_color(), Some(&ColorValue::Hex("#FF0000".into())));
    }
}
