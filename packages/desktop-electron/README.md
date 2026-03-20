# OpenCode Desktop (Electron)

Native OpenCode desktop app built with Electron. It wraps `packages/app`.

## Development

From the repo root:

```bash
bun install
bun run --cwd packages/desktop-electron dev
```

## Build

```bash
bun run --cwd packages/desktop-electron build
```

Package installers via `electron-builder` (see `package.json` scripts).
