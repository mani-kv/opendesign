import { $ } from "bun"

import { copyBinaryToSidecarFolder, getCurrentSidecar, windowsify } from "./utils"

const RUST_TARGET = Bun.env.TAURI_ENV_TARGET_TRIPLE
const cfg = getCurrentSidecar(RUST_TARGET)

// On Apple Silicon with x86_64 Rust (e.g. Rosetta-installed rustup), build arm64 opencode
// but copy to x86_64 filename so the Tauri app (running under Rosetta) can find it.
const useArm64Fallback =
  process.platform === "darwin" &&
  process.arch === "arm64" &&
  cfg.rustTarget === "x86_64-apple-darwin"
const buildConfig = useArm64Fallback
  ? { ocBinary: "opencode-darwin-arm64", rustTarget: cfg.rustTarget }
  : cfg

const binaryPath = windowsify(`../opencode/dist/${buildConfig.ocBinary}/bin/opencode`)

await (buildConfig.ocBinary.includes("-baseline")
  ? $`cd ../opencode && bun run build --single --baseline`
  : $`cd ../opencode && bun run build --single`)

await copyBinaryToSidecarFolder(binaryPath, cfg.rustTarget)
