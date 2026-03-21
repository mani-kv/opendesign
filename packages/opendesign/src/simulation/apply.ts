import type { SimulationMode } from "../types/simulation"
import { a11yFilterCss } from "./presets"

/**
 * Generate CSS styles to apply a simulation mode to an iframe.
 */
export function simulationStyles(mode: SimulationMode): Record<string, string> {
  const styles: Record<string, string> = {}

  if (mode.viewport) {
    styles.width = `${mode.viewport.width}px`
    styles.height = `${mode.viewport.height}px`
  }

  if (mode.a11yFilter && mode.a11yFilter !== "none") {
    const filter = a11yFilterCss(mode.a11yFilter)
    if (filter) styles.filter = filter
  }

  return styles
}

/**
 * Generate HTML attributes for simulation (e.g., dir for RTL).
 */
export function simulationAttrs(mode: SimulationMode): Record<string, string> {
  const attrs: Record<string, string> = {}

  if (mode.rtl) attrs.dir = "rtl"
  if (mode.language) attrs.lang = mode.language

  return attrs
}

/**
 * Build a style string from a simulation mode.
 */
export function simulationStyleString(mode: SimulationMode): string {
  const styles = simulationStyles(mode)
  return Object.entries(styles)
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ")
}
