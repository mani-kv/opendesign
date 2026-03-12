import { Show } from "solid-js"
import { Tabs } from "@opencode-ai/ui/tabs"
import { useLanguage } from "@/context/language"

export function SessionMobileTabs(props: {
  open: boolean
  mobileTab: "canvas" | "changes"
  hasReview: boolean
  reviewCount: number
  onCanvas: () => void
  onChanges: () => void
}) {
  const language = useLanguage()

  return (
    <Show when={props.open}>
      <Tabs value={props.mobileTab} class="h-auto">
        <Tabs.List>
          <Tabs.Trigger
            value="canvas"
            class="!w-1/2 !max-w-none"
            classes={{ button: "w-full" }}
            onClick={props.onCanvas}
          >
            {language.t("session.tab.canvas")}
          </Tabs.Trigger>
          <Tabs.Trigger
            value="changes"
            class="!w-1/2 !max-w-none !border-r-0"
            classes={{ button: "w-full" }}
            onClick={props.onChanges}
          >
            {props.hasReview
              ? language.t("session.review.filesChanged", { count: props.reviewCount })
              : language.t("session.review.change.other")}
          </Tabs.Trigger>
        </Tabs.List>
      </Tabs>
    </Show>
  )
}
