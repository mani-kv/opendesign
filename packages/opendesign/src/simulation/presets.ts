import type { ViewportPreset, A11yFilter } from "../types/simulation"

export const viewportPresets: ViewportPreset[] = [
  { name: "iPhone SE", width: 375, height: 667 },
  { name: "iPhone 15 Pro", width: 393, height: 852 },
  { name: "iPad Mini", width: 768, height: 1024 },
  { name: "iPad Pro 12.9", width: 1024, height: 1366 },
  { name: "Desktop", width: 1440, height: 900 },
  { name: "Desktop XL", width: 1920, height: 1080 },
]

const filterCss: Record<string, string> = {
  protanopia: "url('#protanopia')",
  deuteranopia: "url('#deuteranopia')",
  tritanopia: "url('#tritanopia')",
  "high-contrast": "contrast(1.5)",
}

export function a11yFilterCss(filter: A11yFilter): string {
  if (filter === "none") return ""
  return filterCss[filter] ?? ""
}

export function viewportByName(name: string): ViewportPreset | undefined {
  return viewportPresets.find((p) => p.name === name)
}
