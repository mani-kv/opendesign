// This crate is WASM-only. Compiling it for native targets is a no-op.
#![cfg(target_arch = "wasm32")]
//! WebAssembly entry point for the Vello canvas.
//!
//! On WASM we cannot block the thread for async operations, so the surface
//! must be created *before* the event loop is started.  The pattern is:
//!
//!   1. Create the winit window and append its canvas to <body>.
//!   2. Resize the canvas to match the browser viewport.
//!   3. Asynchronously create the wgpu surface / device via `spawn_local`.
//!   4. Inside that future, start the event loop with `run_app`.

use std::cell::{Cell, RefCell};
use std::sync::Arc;

use canvas_core::{CanvasState, ContextMenuTarget, Drag, Tool, CANVAS_BG};
use vello::util::{RenderContext, RenderSurface};
use vello::{AaConfig, Renderer, RendererOptions};
use vello::wgpu;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::js_sys;
use winit::application::ApplicationHandler;
use winit::dpi::PhysicalSize;
use winit::event::{ElementState, MouseButton, WindowEvent};
use winit::event_loop::{ActiveEventLoop, EventLoop};
use winit::keyboard::{Key, NamedKey};
use winit::window::{CursorIcon, Window};

// ── Shared zoom state ─────────────────────────────────────────────────────────
//
// Chrome/Edge/Firefox send trackpad pinch-to-zoom as WheelEvent with
// ctrlKey=true.  Winit only synthesises PinchGesture for Safari (via
// gesturechange events).  We install a non-passive JS wheel listener that
// catches the ctrlKey case, prevents the browser from zooming the page, and
// accumulates a zoom delta here.  WebApp::about_to_wait drains and applies it.

thread_local! {
    static PENDING_ZOOM: Cell<f64> = const { Cell::new(0.0) };
    static PENDING_RESIZE: Cell<Option<(u32, u32)>> = const { Cell::new(None) };
    /// Last `performance.now()` when we called `resize_surface` (redraw-throttled path).
    static LAST_RESIZE_MS: Cell<f64> = const { Cell::new(0.0) };
    static PENDING_SAVE: RefCell<Option<js_sys::Function>> = const { RefCell::new(None) };
    static PENDING_LOAD: RefCell<Option<String>> = const { RefCell::new(None) };
    static CANVAS_WINDOW: RefCell<Option<Arc<Window>>> = const { RefCell::new(None) };
}

/// Wake the winit event loop so `about_to_wait` processes pending save/load.
/// Without this, queued operations only run on the next user-input event.
fn wake_event_loop() {
    CANVAS_WINDOW.with(|r| {
        if let Some(w) = r.borrow().as_ref() {
            w.request_redraw();
        }
    });
}

fn performance_now_ms() -> f64 {
    js_sys::Date::now()
}

// ── Render state ──────────────────────────────────────────────────────────────

struct RenderState {
    surface:       RenderSurface<'static>,
    valid_surface: bool,
    window:        Arc<Window>,
}

// ── WebApp ────────────────────────────────────────────────────────────────────

struct WebApp {
    context:   RenderContext,
    renderers: Vec<Option<Renderer>>,
    state:     Option<RenderState>,
    canvas:    CanvasState,
}

impl WebApp {
    /// Apply pending logical size to the GPU surface.
    /// `throttle`: when true (RedrawRequested path), cap how often we reconfigure the surface.
    /// `CursorMoved` requests redraw every frame while dragging a splitter, so without this we
    /// still hit `resize_surface` ~60×/s and the canvas flickers. `about_to_wait` uses
    /// `throttle = false` so the final size always settles when the event loop goes idle.
    fn flush_pending_resize(&mut self, throttle: bool) -> bool {
        let pending = PENDING_RESIZE.with(|c| c.get());
        let Some((w, h)) = pending else { return false };
        let Some(rs) = &mut self.state else { return false };

        if w == 0 || h == 0 {
            PENDING_RESIZE.with(|c| c.set(None));
            rs.valid_surface = false;
            return false;
        }

        let cw = rs.surface.config.width;
        let ch = rs.surface.config.height;
        if cw == w && ch == h {
            PENDING_RESIZE.with(|c| c.set(None));
            return false;
        }

        if throttle {
            let now = performance_now_ms();
            let last = LAST_RESIZE_MS.with(|c| c.get());
            if now - last < 33.0 {
                return false;
            }
            LAST_RESIZE_MS.with(|c| c.set(now));
        } else {
            LAST_RESIZE_MS.with(|c| c.set(performance_now_ms()));
        }

        PENDING_RESIZE.with(|c| c.set(None));
        self.context.resize_surface(&mut rs.surface, w, h);
        rs.valid_surface = true;
        true
    }

    fn new(context: RenderContext, render_state: RenderState) -> Self {
        let mut renderers = Vec::new();
        renderers.resize_with(context.devices.len(), || None);
        let id = render_state.surface.dev_id;
        let renderer = Renderer::new(
            &context.devices[id].device,
            RendererOptions::default(),
        )
        .expect("renderer");
        renderers[id] = Some(renderer);

        Self {
            context,
            renderers,
            state: Some(render_state),
            canvas: CanvasState::new(),
        }
    }
}

/// Store the right-click hit-test result in `window.__velloCtxTarget` so
/// the SolidJS `contextmenu` handler can read it synchronously.
///
/// This avoids custom DOM event dispatch entirely — the browser's native
/// `contextmenu` event (which fires reliably on every right-click, after
/// `pointerdown`/`mousedown`) is the sole trigger for showing the menu.
///
/// Notify the Solid app that a click happened on the canvas (left or right).
/// The DOM mousedown event doesn't reach document when winit handles it,
/// so we call this from Rust to close the context menu before handling the click.
fn notify_context_menu_close() {
    use web_sys::js_sys;
    let Some(win) = web_sys::window() else { return };
    let cb = js_sys::Reflect::get(&win, &"__velloCloseContextMenu".into()).ok();
    let Some(cb) = cb else { return };
    let Some(f) = cb.dyn_ref::<js_sys::Function>() else { return };
    let _ = f.call0(&win);
}

fn store_context_target(target: &ContextMenuTarget) {
    use wasm_bindgen::JsValue;
    use web_sys::js_sys;

    let Some(win) = web_sys::window() else { return };

    let obj = js_sys::Object::new();
    match target {
        ContextMenuTarget::Object { node_ids } => {
            let _ = js_sys::Reflect::set(&obj, &"targetType".into(), &"object".into());
            let arr = js_sys::Array::new();
            for &id in node_ids { arr.push(&JsValue::from_f64(id as f64)); }
            let _ = js_sys::Reflect::set(&obj, &"nodeIds".into(), &arr);
        }
        ContextMenuTarget::Canvas => {
            let _ = js_sys::Reflect::set(&obj, &"targetType".into(), &"canvas".into());
            let _ = js_sys::Reflect::set(&obj, &"nodeIds".into(), &js_sys::Array::new());
        }
    }

    let _ = js_sys::Reflect::set(&win, &"__velloCtxTarget".into(), &obj);
}

impl ApplicationHandler for WebApp {
    fn resumed(&mut self, _event_loop: &ActiveEventLoop) {
        // Surface is already created before the event loop starts on WASM.
    }

    fn suspended(&mut self, _event_loop: &ActiveEventLoop) {}

    /// Drain any zoom accumulated by the JS wheel listener and apply it once
    /// per event-loop iteration, before the next redraw.
    fn about_to_wait(&mut self, _event_loop: &ActiveEventLoop) {
        // Don't flush resize here — the unthrottled path caused flicker during
        // continuous split-pane drag.  Just request a redraw so RedrawRequested
        // can apply the resize through its throttled path.
        if PENDING_RESIZE.with(|c| c.get().is_some()) {
            if let Some(rs) = &self.state {
                rs.window.request_redraw();
            }
        }

        let delta = PENDING_ZOOM.with(|c| {
            let v = c.get();
            c.set(0.0);
            v
        });
        if delta.abs() > 1e-9 {
            self.canvas.on_pinch(delta);
            if let Some(rs) = &self.state {
                rs.window.request_redraw();
            }
        }

        // Process pending canvas save BEFORE load. When both are queued in the
        // same tick (project switch: save old → load new), the save must capture
        // the current state before the load replaces it.
        if let Some(cb) = PENDING_SAVE.with(|r| r.borrow_mut().take()) {
            if let Ok(json) = self.canvas.to_snapshot_json() {
                let win = web_sys::window().unwrap();
                let _ = cb.call1(&win, &JsValue::from_str(&json));
            }
        }

        // Process pending canvas load (deserialize and replace state).
        if let Some(json) = PENDING_LOAD.with(|r| r.borrow_mut().take()) {
            if self.canvas.load_snapshot_json(&json).is_ok() {
                if let Some(rs) = &self.state {
                    rs.window.request_redraw();
                }
            }
        }
    }

    fn window_event(
        &mut self,
        event_loop: &ActiveEventLoop,
        window_id: winit::window::WindowId,
        event: WindowEvent,
    ) {
        let Some(render_state) = &self.state else { return; };
        if render_state.window.id() != window_id { return; }
        let window = render_state.window.clone();

        match event {
            WindowEvent::CloseRequested => event_loop.exit(),

            WindowEvent::Resized(sz) => {
                let w = sz.width;
                let h = sz.height;
                if w > 0 && h > 0 {
                    PENDING_RESIZE.with(|c| c.set(Some((w, h))));
                } else {
                    PENDING_RESIZE.with(|c| c.set(None));
                    if let Some(rs) = &mut self.state {
                        rs.valid_surface = false;
                    }
                }
                window.request_redraw();
            }

            WindowEvent::ModifiersChanged(mods) => {
                self.canvas.shift_held = mods.state().shift_key();
            }

            WindowEvent::KeyboardInput { event: ke, .. } => {
                let pressed = ke.state == ElementState::Pressed;
                match &ke.logical_key {
                    Key::Named(NamedKey::Space) => {
                        self.canvas.space_held = pressed;
                        window.set_cursor(self.canvas.cursor_for_state());
                    }
                    Key::Named(NamedKey::Escape) if pressed => {
                        self.canvas.cancel();
                        window.set_cursor(self.canvas.cursor_for_state());
                        window.request_redraw();
                    }
                    Key::Named(NamedKey::Delete) if pressed => {
                        self.canvas.delete_selected();
                        window.request_redraw();
                    }
                    Key::Character(s) if pressed => match s.as_str() {
                        "v" | "V" => {
                            self.canvas.set_tool_select();
                            window.set_cursor(self.canvas.cursor_for_state());
                            window.request_redraw();
                        }
                        "r" | "R" => {
                            self.canvas.set_tool_rectangle();
                            window.set_cursor(CursorIcon::Crosshair);
                            window.request_redraw();
                        }
                        _ => {}
                    },
                    _ => {}
                }
            }

            WindowEvent::CursorMoved { position, .. } => {
                self.canvas.on_cursor_moved(position.x, position.y);
                if matches!(self.canvas.drag, Drag::None) && self.canvas.tool == Tool::Select {
                    window.set_cursor(self.canvas.cursor_for_state());
                }
                window.request_redraw();
            }

            WindowEvent::MouseWheel { delta, .. } => {
                // Only handle non-pinch scroll here (pan).
                // ctrlKey+wheel (pinch) is handled by the JS listener → PENDING_ZOOM.
                match delta {
                    winit::event::MouseScrollDelta::LineDelta(_, dy) => {
                        self.canvas.on_scroll_line(dy);
                    }
                    winit::event::MouseScrollDelta::PixelDelta(p) => {
                        self.canvas.on_scroll_pixel(p.x, p.y);
                    }
                }
                window.request_redraw();
            }

            // PinchGesture fires on Safari via gesturechange events; keep it
            // for Safari compatibility.  Chrome/Edge/Firefox are handled by
            // the JS wheel listener above.
            WindowEvent::PinchGesture { delta, .. } => {
                self.canvas.on_pinch(delta as f64);
                window.request_redraw();
            }

            WindowEvent::MouseInput { state, button, .. } => {
                match (button, state) {
                    (MouseButton::Left, ElementState::Pressed) => {
                        notify_context_menu_close();
                        let cursor = self.canvas.on_lmb_press();
                        window.set_cursor(cursor);
                    }
                    (MouseButton::Left, ElementState::Released) => {
                        self.canvas.on_lmb_release();
                        window.set_cursor(self.canvas.cursor_for_state());
                        window.request_redraw();
                    }
                    (MouseButton::Right, ElementState::Pressed) => {
                        notify_context_menu_close(); // close existing menu before opening new one
                        let target = self.canvas.on_rmb_press();
                        store_context_target(&target);
                        window.request_redraw();
                    }
                    (MouseButton::Middle, ElementState::Pressed) => {
                        self.canvas.drag = Drag::Pan {
                            last_sx: self.canvas.mouse_sx,
                            last_sy: self.canvas.mouse_sy,
                        };
                        window.set_cursor(CursorIcon::Grabbing);
                    }
                    (MouseButton::Middle, ElementState::Released) => {
                        if matches!(self.canvas.drag, Drag::Pan { .. }) {
                            self.canvas.drag = Drag::None;
                        }
                        window.set_cursor(self.canvas.cursor_for_state());
                    }
                    _ => {}
                }
                window.request_redraw();
            }

            WindowEvent::RedrawRequested => {
                let applied = self.flush_pending_resize(true);
                // If throttle skipped the resize, request another redraw so it
                // settles once the throttle window passes.
                if !applied && PENDING_RESIZE.with(|c| c.get().is_some()) {
                    window.request_redraw();
                }
                let Some(rs) = &self.state else { return; };
                if !rs.valid_surface { return; }
                let width  = rs.surface.config.width;
                let height = rs.surface.config.height;
                let dev_id = rs.surface.dev_id;

                self.canvas.build_scene(width, height);

                let Some(rs) = &self.state else { return; };
                let dh = &self.context.devices[dev_id];
                self.renderers[dev_id].as_mut().unwrap()
                    .render_to_texture(
                        &dh.device, &dh.queue, &self.canvas.scene,
                        &rs.surface.target_view,
                        &vello::RenderParams {
                            base_color: CANVAS_BG,
                            width,
                            height,
                            antialiasing_method: AaConfig::Msaa16,
                        },
                    )
                    .expect("render");

                let Some(rs) = &self.state else { return; };
                let surface_texture = rs.surface.surface
                    .get_current_texture()
                    .expect("surface_texture");
                let mut enc = dh.device.create_command_encoder(
                    &wgpu::CommandEncoderDescriptor { label: Some("Blit") });
                rs.surface.blitter.copy(
                    &dh.device, &mut enc,
                    &rs.surface.target_view,
                    &surface_texture.texture.create_view(
                        &wgpu::TextureViewDescriptor::default(),
                    ),
                );
                dh.queue.submit([enc.finish()]);
                surface_texture.present();
                dh.device.poll(wgpu::PollType::Poll).unwrap();
            }

            _ => {}
        }
    }
}

// ── WASM entry point ──────────────────────────────────────────────────────────

fn show_webgpu_error() {
    if let Some(win) = web_sys::window() {
        if let Some(doc) = win.document() {
            if let Some(el) = doc.get_element_by_id("webgpu-error") {
                let _ = el.set_attribute("class", "visible");
            }
        }
    }
}

/// Install a non-passive wheel event listener on `target`.
///
/// When `ctrlKey` is held (trackpad pinch on Chrome/Edge/Firefox):
///  - `preventDefault()` stops the browser from zooming the page.
///  - The zoom delta is accumulated in `PENDING_ZOOM`.
///
/// Regular scroll (no ctrlKey) falls through to winit's own listener which
/// emits `MouseWheel { PixelDelta }` → canvas pan.
fn install_wheel_zoom_listener(target: &web_sys::EventTarget) {
    let on_wheel = Closure::<dyn FnMut(_)>::new(|event: web_sys::WheelEvent| {
        if event.ctrl_key() {
            event.prevent_default();
            // deltaY: negative = pinch in (zoom in), positive = pinch out.
            // DOM_DELTA_PIXEL (0) is the normal mode for trackpad pinch.
            let raw = event.delta_y();
            let delta = match event.delta_mode() {
                0 => -raw / 100.0, // pixel: typical range ±3–30 per frame
                1 => -raw * 0.3,   // line: each step ≈ 3 lines → similar feel
                _ => 0.0,
            };
            PENDING_ZOOM.with(|c| c.set(c.get() + delta));
        }
        // Non-ctrlKey wheel events: do nothing here; winit's listener handles them.
    });

    let opts = web_sys::AddEventListenerOptions::new();
    opts.set_passive(false);

    target
        .add_event_listener_with_callback_and_add_event_listener_options(
            "wheel",
            on_wheel.as_ref().unchecked_ref::<web_sys::js_sys::Function>(),
            &opts,
        )
        .expect("add wheel listener");

    // Leak the closure so it lives for the page lifetime.
    on_wheel.forget();
}

/// Suppress the browser's built-in context menu on `target`.
///
/// Without this, right-clicking the canvas shows the OS/browser context menu
/// in addition to (or instead of) the Solid context menu.
/// Request a canvas save. The callback will be invoked with the JSON string
/// on the next event loop tick. Call from JS when switching away from a project.
#[wasm_bindgen]
pub fn save_canvas_request(callback: js_sys::Function) {
    PENDING_SAVE.with(|r| *r.borrow_mut() = Some(callback));
    wake_event_loop();
}

/// Request a canvas load from JSON. Applied on the next event loop tick.
/// Call from JS when switching to a project.
/// Uses JsValue to avoid wasm-bindgen &str ABI issues that can drop the string.
#[wasm_bindgen]
pub fn load_canvas_request(json: JsValue) {
    let s = json.as_string().unwrap_or_default();
    PENDING_LOAD.with(|r| *r.borrow_mut() = Some(s));
    wake_event_loop();
}

fn install_contextmenu_suppressor(target: &web_sys::EventTarget) {
    let on_contextmenu = Closure::<dyn FnMut(_)>::new(|event: web_sys::MouseEvent| {
        event.prevent_default();
    });

    target
        .add_event_listener_with_callback(
            "contextmenu",
            on_contextmenu.as_ref().unchecked_ref::<web_sys::js_sys::Function>(),
        )
        .expect("add contextmenu listener");

    on_contextmenu.forget();
}

#[wasm_bindgen(start)]
pub fn start() {
    std::panic::set_hook(Box::new(console_error_panic_hook::hook));
    console_log::init_with_level(log::Level::Warn).expect("logger init");

    use winit::platform::web::WindowExtWebSys;

    let event_loop = EventLoop::new().expect("event loop");
    #[allow(deprecated)]
    let window = Arc::new(
        event_loop
            .create_window(
                Window::default_attributes()
                    .with_title("Vello Canvas")
                    .with_resizable(true),
            )
            .expect("window"),
    );

    // Store the window so save/load requests can wake the event loop.
    CANVAS_WINDOW.with(|r| *r.borrow_mut() = Some(window.clone()));

    // Mount winit's canvas into the SolidJS Chrome container (#canvas-container).
    // The SolidJS app.js renders synchronously before this WASM start() runs,
    // so the container element is guaranteed to be in the DOM at this point.
    let canvas = window.canvas().expect("canvas");
    let web_win = web_sys::window().expect("web window");
    let document = web_win.document().expect("document");

    let container = document
        .get_element_by_id("canvas-container")
        .unwrap_or_else(|| {
            // Fallback: mount directly on body if the Chrome hasn't rendered yet.
            document.body().expect("body").into()
        });

    // Make the canvas fill its container via CSS.
    // winit's internal ResizeObserver on the canvas will pick up container
    // resize events and fire WindowEvent::Resized automatically.
    let _ = canvas.set_attribute(
        "style",
        "position:absolute;top:0;left:0;\
         width:100%!important;height:100%!important;\
         display:block;touch-action:none;outline:none;",
    );

    container.append_child(canvas.as_ref()).expect("append canvas");

    // Give the canvas focus so keyboard events fire immediately.
    let html_canvas: web_sys::HtmlElement = canvas.clone().unchecked_into();
    let _ = html_canvas.focus();

    // Install our non-passive wheel listener for pinch-to-zoom.
    // Must be done AFTER the canvas is in the DOM so winit's own listeners
    // (which are already attached) are already registered.
    let canvas_target: web_sys::EventTarget = canvas.clone().unchecked_into();
    install_wheel_zoom_listener(&canvas_target);
    install_contextmenu_suppressor(&canvas_target);

    // Attempt to read the container's logical CSS dimensions for the initial
    // physical size request.  Falls back to the window size if the container
    // hasn't been laid out yet (getBoundingClientRect returns 0×0).
    let scale = web_win.device_pixel_ratio();
    let rect  = container.get_bounding_client_rect();
    let (css_w, css_h) = {
        let cw = rect.width();
        let ch = rect.height();
        if cw > 1.0 && ch > 1.0 {
            (cw, ch)
        } else {
            (
                web_win.inner_width().unwrap().as_f64().unwrap(),
                web_win.inner_height().unwrap().as_f64().unwrap(),
            )
        }
    };
    let phys = PhysicalSize::from_logical::<_, f64>((css_w, css_h), scale);
    let _ = window.request_inner_size(phys);

    let mut render_cx = RenderContext::new();
    let win_clone = window.clone();

    wasm_bindgen_futures::spawn_local(async move {
        let surface = render_cx
            .create_surface(
                win_clone.clone(),
                phys.width,
                phys.height,
                wgpu::PresentMode::AutoVsync,
            )
            .await;

        match surface {
            Ok(surface) => {
                let render_state = RenderState {
                    window: win_clone,
                    surface,
                    valid_surface: true,
                };
                let mut app = WebApp::new(render_cx, render_state);
                event_loop.run_app(&mut app).expect("event loop run");
            }
            Err(e) => {
                log::error!("Failed to create wgpu surface: {e:?}");
                show_webgpu_error();
            }
        }
    });
}
