import { useLanguage } from "@/context/language"

export function AgentsPanel() {
  const language = useLanguage()

  return (
    <div class="flex flex-col min-h-0 h-full bg-background-stronger shrink-0">
      <div class="shrink-0 px-3 py-3">
        <div class="text-14-medium text-text-strong">{language.t("agents.panel.title")}</div>
      </div>
      <div class="flex-1 min-h-0 overflow-y-auto px-3 py-2">
        <div class="text-12-regular text-text-weak">{language.t("agents.panel.empty")}</div>
      </div>
    </div>
  )
}
