import type { ComponentRef } from "../types/design-system"

/**
 * Group components by their package name.
 */
export function groupByPackage(components: ComponentRef[]): Record<string, ComponentRef[]> {
  const result: Record<string, ComponentRef[]> = {}
  for (const c of components) {
    const pkg = c.packageName
    if (!result[pkg]) result[pkg] = []
    result[pkg].push(c)
  }
  return result
}

/**
 * Search components by name (case-insensitive substring match).
 */
export function searchComponents(components: ComponentRef[], query: string): ComponentRef[] {
  const q = query.toLowerCase()
  return components.filter((c) => c.name.toLowerCase().includes(q))
}

/**
 * Generate an import statement for a component.
 */
export function componentImport(component: ComponentRef): string {
  return `import { ${component.name} } from "${component.importPath}"`
}
