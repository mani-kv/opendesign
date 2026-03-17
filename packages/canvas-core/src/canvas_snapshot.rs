//! Serializable snapshot of canvas state for per-project persistence.
//!
//! Used to save/restore the canvas when switching between projects.

use serde::{Deserialize, Serialize};

/// Minimal snapshot of a single node for JSON serialization.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeSnapshot {
    pub id: usize,
    pub children: Vec<usize>,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    /// Fill colour as RGBA 0–1; absent means default.
    #[serde(default)]
    pub fill: Option<[f64; 4]>,
}

/// Snapshot of viewport (pan/zoom).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewportSnapshot {
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
}

// Provide a sane default for the viewport when it is not present in the
// serialized snapshot. This helps with non-synced clients where the viewport
// should be local only.
impl Default for ViewportSnapshot {
    fn default() -> Self {
        ViewportSnapshot {
            x: -640.0,
            y: -400.0,
            zoom: 1.0,
        }
    }
}

/// Full canvas state snapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasSnapshot {
    pub nodes: Vec<NodeSnapshot>,
    pub next_id: usize,
    #[serde(default)]
    pub viewport: ViewportSnapshot,
}
