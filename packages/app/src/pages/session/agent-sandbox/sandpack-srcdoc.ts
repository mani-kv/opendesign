/**
 * Sandpack srcdoc template — real React 18 runtime for agent-generated prototypes.
 *
 * createSandpackSrcdoc(files, entry?) → HTML string for iframe srcdoc
 *   files: Record<string, string>  — path → source content (e.g. "/src/App.jsx", "/src/tokens.css")
 *   entry: string                  — entry module path (default "/src/App.js")
 *
 * Features:
 *  - React 18 + ReactDOM from unpkg CDN
 *  - Babel standalone for JSX/TS transform
 *  - Minimal require() module system for local files + react/react-dom
 *  - Path resolution: tries .js, .jsx, .ts, .tsx, /index.js
 *  - CSS files injected as <style> tags (tokens.css custom properties work)
 *  - Styled error overlay for syntax / runtime errors
 *  - Listens for sandpack:update-files postMessage to hot-reload
 */

export function createSandpackSrcdoc(files: Record<string, string>, entry = "/src/App.js"): string {
  // Serialize files as JSON to embed in the HTML
  const filesJson = JSON.stringify(files)
  const entryJson = JSON.stringify(entry)

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#root{width:100%;height:100%}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
#__error-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);color:#ff6b6b;font-family:monospace;font-size:12px;padding:20px;overflow:auto;z-index:9999;white-space:pre-wrap;word-break:break-word}
#__error-overlay.visible{display:block}
#__error-overlay h2{color:#ff6b6b;font-size:14px;margin-bottom:8px}
#__error-overlay pre{background:rgba(255,255,255,.05);padding:12px;border-radius:6px;overflow:auto}
</style>
</head>
<body>
<div id="root"></div>
<div id="__error-overlay"><h2 id="__error-title"></h2><pre id="__error-body"></pre></div>
<script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js" crossorigin></script>
<script>
(function() {
  // ── file registry ─────────────────────────────────────────────────────────
  var FILES = ${filesJson};
  var ENTRY = ${entryJson};

  // ── error overlay ─────────────────────────────────────────────────────────
  function showError(title, body) {
    var el = document.getElementById('__error-overlay');
    document.getElementById('__error-title').textContent = title;
    document.getElementById('__error-body').textContent = body || '';
    el.classList.add('visible');
  }
  function clearError() {
    document.getElementById('__error-overlay').classList.remove('visible');
  }

  // ── CSS injection ─────────────────────────────────────────────────────────
  function injectCss(content, id) {
    var existing = document.getElementById(id);
    if (existing) existing.remove();
    var tag = document.createElement('style');
    tag.id = id;
    tag.textContent = content;
    document.head.appendChild(tag);
  }

  // ── module cache ──────────────────────────────────────────────────────────
  var moduleCache = {};

  // Normalise a path: resolve relative segments from a base
  function resolvePath(base, rel) {
    if (!rel) return base;
    // Absolute path — return as-is
    if (rel.startsWith('/')) return rel;
    // URL-style join
    var parts = base.split('/');
    parts.pop(); // remove filename
    rel.split('/').forEach(function(seg) {
      if (seg === '..') { parts.pop(); }
      else if (seg !== '.') { parts.push(seg); }
    });
    return parts.join('/');
  }

  // Try candidate paths with extension fallbacks
  var EXT = ['.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.jsx', '/index.ts', '/index.tsx'];
  function resolveFile(path) {
    // Exact match
    if (FILES[path] !== undefined) return path;
    // Try extensions
    for (var i = 0; i < EXT.length; i++) {
      var candidate = path + EXT[i];
      if (FILES[candidate] !== undefined) return candidate;
    }
    return null;
  }

  // ── require() ─────────────────────────────────────────────────────────────
  function makeRequire(baseFile) {
    return function require(id) {
      // Built-ins
      if (id === 'react') return window.React;
      if (id === 'react-dom') return window.ReactDOM;
      if (id === 'react-dom/client') return window.ReactDOM;
      if (id === 'react/jsx-runtime') {
        return { jsx: window.React.createElement, jsxs: window.React.createElement, Fragment: window.React.Fragment };
      }

      // Resolve relative / absolute path
      var abs = id.startsWith('.') ? resolvePath(baseFile, id) : '/' + id.replace(/^\\//, '');
      var resolved = resolveFile(abs);
      if (resolved === null) {
        throw new Error('Module not found: ' + id + ' (resolved: ' + abs + ')');
      }
      return loadModule(resolved);
    };
  }

  function loadModule(path) {
    if (moduleCache[path] !== undefined) return moduleCache[path].exports;

    var src = FILES[path];
    if (src === undefined) throw new Error('File not found: ' + path);

    // CSS → inject as style tag, export empty object
    if (path.endsWith('.css')) {
      injectCss(src, 'css-' + path.replace(/[^a-zA-Z0-9]/g, '_'));
      moduleCache[path] = { exports: {} };
      return moduleCache[path].exports;
    }

    // Transform with Babel
    var transformed;
    try {
      transformed = Babel.transform(src, {
        filename: path,
        presets: [
          ['env', { targets: { browsers: ['last 2 Chrome versions'] }, modules: 'commonjs' }],
          'react',
          'typescript',
        ],
        plugins: [],
        sourceType: 'module',
      }).code;
    } catch (e) {
      throw new SyntaxError('Babel error in ' + path + ': ' + e.message);
    }

    // Execute module
    var mod = { exports: {}, id: path };
    moduleCache[path] = mod;
    try {
      var fn = new Function('require', 'module', 'exports', '__filename', '__dirname', transformed);
      fn(makeRequire(path), mod, mod.exports, path, path.split('/').slice(0, -1).join('/'));
    } catch (e) {
      delete moduleCache[path];
      throw e;
    }
    return mod.exports;
  }

  // ── boot ──────────────────────────────────────────────────────────────────
  function boot() {
    // Pre-inject all CSS files in order so tokens.css lands first
    Object.keys(FILES).forEach(function(p) {
      if (p.endsWith('.css')) loadModule(p);
    });

    var exports;
    try {
      exports = loadModule(ENTRY);
    } catch (e) {
      showError(e.name || 'Error', e.stack || e.message);
      return;
    }

    var App = exports.default || exports;
    if (typeof App !== 'function') {
      showError('Error', 'Entry module does not export a React component as default export.\\nExport a function/class as the default export from ' + ENTRY);
      return;
    }

    try {
      var container = document.getElementById('root');
      var root = window.ReactDOM.createRoot(container);
      root.render(window.React.createElement(App));
      clearError();
    } catch (e) {
      showError('Render error', e.stack || e.message);
    }
  }

  // ── hot reload via postMessage ─────────────────────────────────────────────
  window.addEventListener('message', function(ev) {
    if (!ev.data || ev.data.type !== 'sandpack:update-files') return;
    var updated = ev.data.files;
    if (updated) {
      Object.keys(updated).forEach(function(p) { FILES[p] = updated[p]; });
    }
    // Clear cache and re-boot
    moduleCache = {};
    // Remove injected CSS
    document.querySelectorAll('style[id^="css-"]').forEach(function(el) { el.remove(); });
    boot();
  });

  // ── initial render ─────────────────────────────────────────────────────────
  window.addEventListener('error', function(ev) {
    showError('Runtime error', ev.error ? (ev.error.stack || ev.error.message) : ev.message);
  });
  window.addEventListener('unhandledrejection', function(ev) {
    showError('Unhandled promise rejection', ev.reason ? (ev.reason.stack || String(ev.reason)) : String(ev));
  });

  // Wait for CDN scripts to finish loading before booting
  if (window.React && window.ReactDOM && window.Babel) {
    boot();
  } else {
    window.addEventListener('load', boot);
  }
})();
</script>
</body>
</html>`
}

/** Backward-compatible constant — empty project renders the runtime with no files. */
export const SANDPACK_SRCDOC: string = createSandpackSrcdoc({})
