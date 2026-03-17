//! Color abstraction — supports RGB, RGBA, hex, and HSL inputs.
//!
//! All variants normalise to RGBA components via [`to_rgba_components`].
//! The actual conversion to a renderer-specific type (e.g. `vello::peniko::Color`)
//! lives in `canvas_state` so this module stays free of renderer dependencies.

/// A design-level color in one of several common formats.
#[derive(Debug, Clone, PartialEq)]
pub enum ColorValue {
    /// `rgb(r, g, b)` — each component 0–255, fully opaque.
    Rgb(u8, u8, u8),
    /// `rgba(r, g, b, a)` — alpha is `0.0` (transparent) to `1.0` (opaque).
    Rgba(u8, u8, u8, f64),
    /// CSS hex string, e.g. `"#4F46E5"`, `"#4F46E5FF"`, or short form `"#FFF"`.
    Hex(String),
    /// `hsl(h, s%, l%)` — hue 0–360, saturation and lightness 0–100.
    Hsl(f64, f64, f64),
}

// ── Parsing ───────────────────────────────────────────────────────────────────

/// Parse a CSS hex colour string to `(r, g, b, alpha)`.
///
/// Accepts `#RGB`, `#RRGGBB`, and `#RRGGBBAA` (with or without the leading `#`).
pub fn hex_to_rgba(hex: &str) -> (u8, u8, u8, f64) {
    let s = hex.trim_start_matches('#');
    let parse = |slice: &str| u8::from_str_radix(slice, 16).unwrap_or(0);

    match s.len() {
        3 => {
            let r = parse(&s[0..1].repeat(2));
            let g = parse(&s[1..2].repeat(2));
            let b = parse(&s[2..3].repeat(2));
            (r, g, b, 1.0)
        }
        6 => {
            let r = parse(&s[0..2]);
            let g = parse(&s[2..4]);
            let b = parse(&s[4..6]);
            (r, g, b, 1.0)
        }
        8 => {
            let r = parse(&s[0..2]);
            let g = parse(&s[2..4]);
            let b = parse(&s[4..6]);
            let a = parse(&s[6..8]);
            (r, g, b, a as f64 / 255.0)
        }
        _ => (0, 0, 0, 1.0),
    }
}

// ── Conversion: RGB ↔ HSL ──────────────────────────────────────────────────

/// Convert RGB (each 0–255) to HSL (h: 0–360, s: 0–100, l: 0–100).
pub fn rgb_to_hsl(r: u8, g: u8, b: u8) -> (f64, f64, f64) {
    let rf = r as f64 / 255.0;
    let gf = g as f64 / 255.0;
    let bf = b as f64 / 255.0;

    let max = rf.max(gf).max(bf);
    let min = rf.min(gf).min(bf);
    let l   = (max + min) / 2.0;

    if (max - min).abs() < 1e-10 {
        return (0.0, 0.0, l * 100.0);
    }

    let d = max - min;
    let s = if l > 0.5 { d / (2.0 - max - min) } else { d / (max + min) };

    let h = if (max - rf).abs() < 1e-10 {
        ((gf - bf) / d + if gf < bf { 6.0 } else { 0.0 }) / 6.0
    } else if (max - gf).abs() < 1e-10 {
        ((bf - rf) / d + 2.0) / 6.0
    } else {
        ((rf - gf) / d + 4.0) / 6.0
    };

    (h * 360.0, s * 100.0, l * 100.0)
}

fn hue_to_rgb(p: f64, q: f64, mut t: f64) -> f64 {
    if t < 0.0 { t += 1.0; }
    if t > 1.0 { t -= 1.0; }
    if t < 1.0 / 6.0 { return p + (q - p) * 6.0 * t; }
    if t < 1.0 / 2.0 { return q; }
    if t < 2.0 / 3.0 { return p + (q - p) * (2.0 / 3.0 - t) * 6.0; }
    p
}

/// Convert HSL (h: 0–360, s: 0–100, l: 0–100) to RGB (each 0–255).
pub fn hsl_to_rgb(h: f64, s: f64, l: f64) -> (u8, u8, u8) {
    let h = h / 360.0;
    let s = s / 100.0;
    let l = l / 100.0;

    if s.abs() < 1e-10 {
        let v = (l * 255.0).round() as u8;
        return (v, v, v);
    }

    let q = if l < 0.5 { l * (1.0 + s) } else { l + s - l * s };
    let p = 2.0 * l - q;

    let r = (hue_to_rgb(p, q, h + 1.0 / 3.0) * 255.0).round() as u8;
    let g = (hue_to_rgb(p, q, h)             * 255.0).round() as u8;
    let b = (hue_to_rgb(p, q, h - 1.0 / 3.0) * 255.0).round() as u8;
    (r, g, b)
}

// ── Normalisation ─────────────────────────────────────────────────────────────

/// Normalise any [`ColorValue`] to `(r, g, b, alpha)` where rgb are 0–255 and
/// alpha is `0.0`–`1.0`.  This is the canonical form used everywhere internally.
pub fn to_rgba_components(color: &ColorValue) -> (u8, u8, u8, f64) {
    match color {
        ColorValue::Rgb(r, g, b)      => (*r, *g, *b, 1.0),
        ColorValue::Rgba(r, g, b, a)  => (*r, *g, *b, *a),
        ColorValue::Hex(s)            => hex_to_rgba(s),
        ColorValue::Hsl(h, s, l)      => {
            let (r, g, b) = hsl_to_rgb(*h, *s, *l);
            (r, g, b, 1.0)
        }
    }
}

/// Return a new [`ColorValue`] with the alpha channel replaced by `alpha`.
///
/// `alpha` is clamped to `0.0`–`1.0`.
pub fn apply_opacity(color: &ColorValue, alpha: f64) -> ColorValue {
    let (r, g, b, _) = to_rgba_components(color);
    ColorValue::Rgba(r, g, b, alpha.clamp(0.0, 1.0))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex6_parses_correctly() {
        let (r, g, b, a) = hex_to_rgba("#4F46E5");
        assert_eq!((r, g, b), (0x4F, 0x46, 0xE5));
        assert!((a - 1.0).abs() < 1e-6);
    }

    #[test]
    fn hex3_expands() {
        let (r, g, b, _) = hex_to_rgba("#FFF");
        assert_eq!((r, g, b), (255, 255, 255));
    }

    #[test]
    fn rgb_hsl_roundtrip() {
        let (h, s, l) = rgb_to_hsl(79, 70, 229);
        let (r2, g2, b2) = hsl_to_rgb(h, s, l);
        assert!((r2 as i32 - 79).abs() <= 1);
        assert!((g2 as i32 - 70).abs() <= 1);
        assert!((b2 as i32 - 229).abs() <= 1);
    }

    #[test]
    fn apply_opacity_replaces_alpha() {
        let c = apply_opacity(&ColorValue::Rgb(255, 0, 0), 0.5);
        assert_eq!(c, ColorValue::Rgba(255, 0, 0, 0.5));
    }
}
