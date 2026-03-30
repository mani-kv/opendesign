import { $ } from "bun"

await $`bun ./scripts/copy-icons.ts ${process.env.OPENCODE_CHANNEL ?? "dev"}`

// OpenDesign: skip TUI binary build — electron starts the server directly via bun
