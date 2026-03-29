import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  ParentProps,
  Show,
  untrack,
} from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { useLayout, LocalProject } from "@/context/layout"
import { useGlobalSync } from "@/context/global-sync"
import { Persist, persisted } from "@/utils/persist"
import { base64Encode } from "@opencode-ai/util/encode"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { Button } from "@opencode-ai/ui/button"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Dialog } from "@opencode-ai/ui/dialog"
import { getFilename } from "@opencode-ai/util/path"
import type { Agent, Message } from "@opencode-ai/sdk/v2/client"
import { usePlatform } from "@/context/platform"
import { useSettings } from "@/context/settings"
import { createStore, produce, reconcile } from "solid-js/store"
import { DragDropProvider, DragDropSensors, DragOverlay, SortableProvider, closestCenter } from "@thisbeyond/solid-dnd"
import type { DragEvent } from "@thisbeyond/solid-dnd"
import { useProviders } from "@/hooks/use-providers"
import { showToast, Toast, toaster } from "@opencode-ai/ui/toast"
import { useGlobalSDK } from "@/context/global-sdk"
import { clearWorkspaceTerminals } from "@/context/terminal"
import { dropSessionCaches, pickSessionCacheEvictions } from "@/context/global-sync/session-cache"
import { useNotification } from "@/context/notification"
import { usePermission } from "@/context/permission"
import { Binary } from "@opencode-ai/util/binary"
import { retry } from "@opencode-ai/util/retry"
import { playSound, soundSrc } from "@/utils/sound"
import { createAim } from "@/utils/aim"
import { setNavigate } from "@/utils/notification-click"
import { Worktree as WorktreeState } from "@/utils/worktree"
import { setSessionHandoff } from "@/pages/session/handoff"

import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useTheme, type ColorScheme } from "@opencode-ai/ui/theme"
import { DialogSelectProvider } from "@/components/dialog-select-provider"
import { DialogSelectServer } from "@/components/dialog-select-server"
import { DialogSettings } from "@/components/dialog-settings"
import { useCommand, type CommandOption } from "@/context/command"
import { ConstrainDragXAxis } from "@/utils/solid-dnd"
import { DialogSelectDirectory } from "@/components/dialog-select-directory"
import { DialogAddProject } from "@/components/dialog-add-project"
import { DialogAddWorkspace } from "@/components/dialog-add-workspace"
import { DialogEditProject } from "@/components/dialog-edit-project"
import { Titlebar } from "@/components/titlebar"
import { useServer } from "@/context/server"
import { useLanguage, type Locale } from "@/context/language"
import {
  displayName,
  effectiveWorkspaceOrder,
  errorMessage,
  getDraggableId,
  latestRootSession,
  sortedRootSessions,
  workspaceKey,
} from "./layout/helpers"
import {
  collectNewSessionDeepLinks,
  collectOpenProjectDeepLinks,
  deepLinkEvent,
  drainPendingDeepLinks,
} from "./layout/deep-links"
import { createInlineEditorController } from "./layout/inline-editor"
import {
  LocalWorkspace,
  SortableWorkspace,
  WorkspaceDragOverlay,
  type WorkspaceSidebarContext,
} from "./layout/sidebar-workspace"
import { workspaceOpenState } from "./layout/sidebar-workspace-helpers"
import { ProjectDragOverlay, SortableProject, type ProjectSidebarContext } from "./layout/sidebar-project"
import { SidebarContent } from "./layout/sidebar-shell"
import {
  SortableWorkspaceTile,
  WorkspaceDragOverlay as WorkspaceRailDragOverlay,
} from "./layout/sidebar-workspace-tile"
import { useWorkspace, type Workspace } from "@/context/workspace"

export default function Layout(props: ParentProps) {
  const layoutPageTarget = Persist.global("layout.page", ["layout.page.v2", "layout.page.v1"])
  const layoutPageMigrate = (v: unknown) => {
    if (typeof v !== "object" || v === null) return v
    const x = v as Record<string, unknown>
    const next = { ...x }
    const cur = x.lastProjectByWorkspace
    if (cur === undefined || cur === null) {
      next.lastProjectByWorkspace = {}
    } else if (typeof cur === "object") {
      const first = Object.values(cur)[0]
      if (first != null && typeof first === "object" && "projectId" in first) return v
      const legacy = cur as Record<string, string>
      next.lastProjectByWorkspace = Object.fromEntries(
        Object.entries(legacy).map(([k, id]) => [k, { projectId: id, at: Date.now() }]),
      )
    }
    return next
  }
  const [store, setStore, , ready] = persisted(
    { ...layoutPageTarget, migrate: layoutPageMigrate },
    createStore({
      lastProjectSession: {} as { [directory: string]: { directory: string; id: string; at: number } },
      lastProjectByWorkspace: {} as Record<string, { projectId: string; at: number }>,
      activeProject: undefined as string | undefined,
      activeWorkspace: undefined as string | undefined,
      activeWorkspaceId: undefined as string | undefined,
      activeProjectId: undefined as string | undefined,
      workspaceOrder: {} as Record<string, string[]>,
      workspaceName: {} as Record<string, string>,
      workspaceBranchName: {} as Record<string, Record<string, string>>,
      workspaceExpanded: {} as Record<string, boolean>,
      gettingStartedDismissed: false,
    }),
  )

  const pageReady = createMemo(() => ready())

  let scrollContainerRef: HTMLDivElement | undefined

  const params = useParams()
  const globalSDK = useGlobalSDK()
  const globalSync = useGlobalSync()
  const layout = useLayout()
  const workspace = useWorkspace()
  const layoutReady = createMemo(() => layout.ready())
  const platform = usePlatform()
  const settings = useSettings()
  const server = useServer()
  const notification = useNotification()
  const permission = usePermission()
  const navigate = useNavigate()
  setNavigate(navigate)
  const providers = useProviders()
  const dialog = useDialog()
  const command = useCommand()
  const theme = useTheme()
  const language = useLanguage()
  const featureHref = (productId: string, featureId: string) =>
    `/product/${productId}/feature/${featureId}`
  /** @deprecated — session routes removed; kept as stub for dead code paths */
  const sessionHref = (_dir: string, _sessionId?: string) => "/"
  /** @deprecated */
  const projectDir = (proj: { id: string }) => {
    const home = globalSync.data.path.home ?? "/"
    return `${home.replace(/[/\\]+$/, "")}/.opendesign/projects/${proj.id}`
  }
  /** @deprecated */
  const projectIdFromDir = (dir: string) => {
    const home = globalSync.data.path.home ?? "/"
    const prefix = `${home.replace(/[/\\]+$/, "")}/.opendesign/projects/`
    return dir.startsWith(prefix) ? dir.slice(prefix.length).split(/[/\\]/)[0] : undefined
  }
  const currentProjectId = createMemo(() => params.projectId ?? "")
  const currentDir = createMemo(() => {
    const pid = currentProjectId()
    if (!pid) return ""
    const proj = workspace.projects.get(pid)
    if (!proj) return ""
    return projectDir(proj)
  })
  const availableThemeEntries = createMemo(() => Object.entries(theme.themes()))
  const colorSchemeOrder: ColorScheme[] = ["system", "light", "dark"]
  const colorSchemeKey: Record<ColorScheme, "theme.scheme.system" | "theme.scheme.light" | "theme.scheme.dark"> = {
    system: "theme.scheme.system",
    light: "theme.scheme.light",
    dark: "theme.scheme.dark",
  }
  const colorSchemeLabel = (scheme: ColorScheme) => language.t(colorSchemeKey[scheme])

  const [state, setState] = createStore({
    autoselect: !params.projectId,
    busyWorkspaces: {} as Record<string, boolean>,
    hoverSession: undefined as string | undefined,
    hoverProject: undefined as string | undefined,
    scrollSessionKey: undefined as string | undefined,
    nav: undefined as HTMLElement | undefined,
  })

  const editor = createInlineEditorController()

  const workspaceList = createMemo(() => (workspace.ready() ? workspace.workspaces.list() : []))

  const selectedWorkspace = createMemo(() => {
    const id = store.activeWorkspaceId ?? workspaceList()[0]?.id
    return id ? workspace.workspaces.get(id) : undefined
  })

  createEffect(() => {
    if (!workspace.ready()) return
    workspace.workspaces.ensureDefault()
  })

  createEffect(() => {
    if (!workspace.ready()) return
    if (store.activeWorkspaceId) return
    const first = workspaceList()[0]
    if (first) setStore("activeWorkspaceId", first.id)
  })

  createEffect(() => {
    if (!pageReady()) return
    const pid = params.projectId
    if (pid) setStore("activeProjectId", pid)
  })

  const MS_24H = 24 * 60 * 60 * 1000
  const selectWorkspace = (w: Workspace) => {
    setStore("activeWorkspaceId", w.id)
    const projects = workspace.projects.list(w.id)()
    if (projects.length === 0) {
      navigateWithSidebarReset("/")
      return
    }
    const last = store.lastProjectByWorkspace[w.id]
    const within24h = last && Date.now() - last.at < MS_24H
    const proj = (within24h ? projects.find((p) => p.id === last!.projectId) : undefined) ?? projects[0]
    setStore("activeProjectId", proj.id)
    setStore("lastProjectByWorkspace", w.id, { projectId: proj.id, at: Date.now() })
    const path = proj.productId
      ? featureHref(proj.productId, proj.id)
      : sessionHref(projectDir(proj), proj.sessionId)
    navigateWithSidebarReset(path)
  }
  createEffect(() => {
    if (!pageReady() || !workspace.ready()) return
    if (params.projectId || params.productId) return
    const wsId = store.activeWorkspaceId ?? workspaceList()[0]?.id
    if (!wsId) return
    const list = workspace.projects.list(wsId)
    const projects = list()
    if (projects.length === 0) return
    const last = store.lastProjectByWorkspace[wsId]
    const within24h = last && Date.now() - last.at < MS_24H
    const proj = (within24h && projects.find((p) => p.id === last.projectId)) ?? projects[0]
    if (!proj) return
    setStore("activeProjectId", proj.id)
    const path = proj.productId
      ? featureHref(proj.productId, proj.id)
      : proj.sessionId ? `/project/${proj.id}/session/${proj.sessionId}` : `/project/${proj.id}/session`
    navigateWithSidebarReset(path)
  })

  const setBusy = (directory: string, value: boolean) => {
    const key = workspaceKey(directory)
    if (value) {
      setState("busyWorkspaces", key, true)
      return
    }
    setState(
      "busyWorkspaces",
      produce((draft) => {
        delete draft[key]
      }),
    )
  }
  const isBusy = (directory: string) => !!state.busyWorkspaces[workspaceKey(directory)]
  const navLeave = { current: undefined as number | undefined }
  const contextBarExpandTimeout = { current: undefined as number | undefined }
  const [sortNow, setSortNow] = createSignal(Date.now())
  const [sizing, setSizing] = createSignal(false)
  const [contextBarExpanded, setContextBarExpanded] = createSignal(false)
  const [isXl, setIsXl] = createSignal(
    typeof window !== "undefined" && window.matchMedia("(min-width: 1280px)").matches,
  )
  let sizet: number | undefined
  let sortNowInterval: ReturnType<typeof setInterval> | undefined
  const sortNowTimeout = setTimeout(
    () => {
      setSortNow(Date.now())
      sortNowInterval = setInterval(() => setSortNow(Date.now()), 60_000)
    },
    60_000 - (Date.now() % 60_000),
  )

  const aim = createAim({
    enabled: () => !layout.sidebar.opened(),
    active: () => state.hoverProject,
    el: () => state.nav?.querySelector<HTMLElement>("[data-component='sidebar-rail']") ?? state.nav,
    onActivate: (directory) => {
      globalSync.child(directory)
      setState("hoverProject", directory)
      setState("hoverSession", undefined)
    },
  })

  onCleanup(() => {
    if (navLeave.current !== undefined) clearTimeout(navLeave.current)
    if (contextBarExpandTimeout.current !== undefined) clearTimeout(contextBarExpandTimeout.current)
    clearTimeout(sortNowTimeout)
    if (sortNowInterval) clearInterval(sortNowInterval)
    if (sizet !== undefined) clearTimeout(sizet)
    aim.reset()
  })

  onMount(() => {
    const stop = () => setSizing(false)
    window.addEventListener("pointerup", stop)
    window.addEventListener("pointercancel", stop)
    window.addEventListener("blur", stop)
    const mq = window.matchMedia("(min-width: 1280px)")
    const onResize = () => setIsXl(mq.matches)
    mq.addEventListener("change", onResize)
    onCleanup(() => {
      window.removeEventListener("pointerup", stop)
      window.removeEventListener("pointercancel", stop)
      window.removeEventListener("blur", stop)
      mq.removeEventListener("change", onResize)
    })
  })

  const sidebarHovering = createMemo(() => false)
  const sidebarExpanded = createMemo(() => layout.sidebar.opened())
  const setHoverProject = (value: string | undefined) => {
    setState("hoverProject", value)
    if (value !== undefined) return
    aim.reset()
  }
  const clearHoverProjectSoon = () => queueMicrotask(() => setHoverProject(undefined))
  const setHoverSession = (id: string | undefined) => setState("hoverSession", id)

  const disarm = () => {
    if (navLeave.current === undefined) return
    clearTimeout(navLeave.current)
    navLeave.current = undefined
  }

  const arm = () => {
    if (layout.sidebar.opened()) return
    if (state.hoverProject === undefined) return
    disarm()
    navLeave.current = window.setTimeout(() => {
      navLeave.current = undefined
      setHoverProject(undefined)
      setState("hoverSession", undefined)
    }, 300)
  }

  const autoselecting = createMemo(() => {
    if (params.projectId) return false
    if (!state.autoselect) return false
    if (!pageReady()) return true
    if (!layoutReady()) return true
    const list = layout.projects.list()
    if (list.length > 0) return true
    return !!server.projects.last()
  })

  createEffect(() => {
    if (!state.autoselect) return
    const pid = params.projectId
    if (!pid) return
    setState("autoselect", false)
  })

  const editorOpen = editor.editorOpen
  const openEditor = editor.openEditor
  const closeEditor = editor.closeEditor
  const setEditor = editor.setEditor
  const InlineEditor = editor.InlineEditor

  const clearSidebarHoverState = () => {
    if (layout.sidebar.opened()) return
    setState("hoverSession", undefined)
    setHoverProject(undefined)
  }

  const navigateWithSidebarReset = (href: string) => {
    clearSidebarHoverState()
    navigate(href)
    layout.mobileSidebar.hide()
  }

  function cycleTheme(direction = 1) {
    const ids = availableThemeEntries().map(([id]) => id)
    if (ids.length === 0) return
    const currentIndex = ids.indexOf(theme.themeId())
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + direction + ids.length) % ids.length
    const nextThemeId = ids[nextIndex]
    theme.setTheme(nextThemeId)
    const nextTheme = theme.themes()[nextThemeId]
    showToast({
      title: language.t("toast.theme.title"),
      description: nextTheme?.name ?? nextThemeId,
    })
  }

  function cycleColorScheme(direction = 1) {
    const current = theme.colorScheme()
    const currentIndex = colorSchemeOrder.indexOf(current)
    const nextIndex =
      currentIndex === -1 ? 0 : (currentIndex + direction + colorSchemeOrder.length) % colorSchemeOrder.length
    const next = colorSchemeOrder[nextIndex]
    theme.setColorScheme(next)
    showToast({
      title: language.t("toast.scheme.title"),
      description: colorSchemeLabel(next),
    })
  }

  function setLocale(next: Locale) {
    if (next === language.locale()) return
    language.setLocale(next)
    showToast({
      title: language.t("toast.language.title"),
      description: language.t("toast.language.description", { language: language.label(next) }),
    })
  }

  function cycleLanguage(direction = 1) {
    const locales = language.locales
    const currentIndex = locales.indexOf(language.locale())
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + direction + locales.length) % locales.length
    const next = locales[nextIndex]
    if (!next) return
    setLocale(next)
  }

  const useUpdatePolling = () =>
    onMount(() => {
      if (!platform.checkUpdate || !platform.update || !platform.restart) return

      let toastId: number | undefined
      let interval: ReturnType<typeof setInterval> | undefined

      const pollUpdate = () =>
        platform.checkUpdate!().then(({ updateAvailable, version }) => {
          if (!updateAvailable) return
          if (toastId !== undefined) return
          toastId = showToast({
            persistent: true,
            icon: "download",
            title: language.t("toast.update.title"),
            description: language.t("toast.update.description", { version: version ?? "" }),
            actions: [
              {
                label: language.t("toast.update.action.installRestart"),
                onClick: async () => {
                  await platform.update!()
                  await platform.restart!()
                },
              },
              {
                label: language.t("toast.update.action.notYet"),
                onClick: "dismiss",
              },
            ],
          })
        })

      createEffect(() => {
        if (!settings.ready()) return

        if (!settings.updates.startup()) {
          if (interval === undefined) return
          clearInterval(interval)
          interval = undefined
          return
        }

        if (interval !== undefined) return
        void pollUpdate()
        interval = setInterval(pollUpdate, 10 * 60 * 1000)
      })

      onCleanup(() => {
        if (interval === undefined) return
        clearInterval(interval)
      })
    })

  const useSDKNotificationToasts = () =>
    onMount(() => {
      const toastBySession = new Map<string, number>()
      const alertedAtBySession = new Map<string, number>()
      const cooldownMs = 5000

      const dismissSessionAlert = (sessionKey: string) => {
        const toastId = toastBySession.get(sessionKey)
        if (toastId === undefined) return
        toaster.dismiss(toastId)
        toastBySession.delete(sessionKey)
        alertedAtBySession.delete(sessionKey)
      }

      const unsub = globalSDK.event.listen((e) => {
        if (e.details?.type === "worktree.ready") {
          setBusy(e.name, false)
          WorktreeState.ready(e.name)
          return
        }

        if (e.details?.type === "worktree.failed") {
          setBusy(e.name, false)
          WorktreeState.failed(e.name, e.details.properties?.message ?? language.t("common.requestFailed"))
          return
        }

        if (
          e.details?.type === "question.replied" ||
          e.details?.type === "question.rejected" ||
          e.details?.type === "permission.replied"
        ) {
          const props = e.details.properties as { sessionID: string }
          const sessionKey = `${e.name}:${props.sessionID}`
          dismissSessionAlert(sessionKey)
          return
        }

        if (e.details?.type !== "permission.asked" && e.details?.type !== "question.asked") return
        const title =
          e.details.type === "permission.asked"
            ? language.t("notification.permission.title")
            : language.t("notification.question.title")
        const icon = e.details.type === "permission.asked" ? ("checklist" as const) : ("bubble-5" as const)
        const directory = e.name
        const props = e.details.properties
        if (e.details.type === "permission.asked" && permission.autoResponds(e.details.properties, directory)) return

        const [store] = globalSync.child(directory, { bootstrap: false })
        const targetID = "agentID" in props ? (props as any).agentID : (props as any).sessionID
        const session = store.session.find((s) => s.id === targetID)
        const sessionKey = `${directory}:${targetID}`

        const sessionTitle = session?.title ?? language.t("command.session.new")
        const projectName = getFilename(directory)
        const description =
          e.details.type === "permission.asked"
            ? language.t("notification.permission.description", { sessionTitle, projectName })
            : language.t("notification.question.description", { sessionTitle, projectName })
        const href = sessionHref(directory, targetID)

        const now = Date.now()
        const lastAlerted = alertedAtBySession.get(sessionKey) ?? 0
        if (now - lastAlerted < cooldownMs) return
        alertedAtBySession.set(sessionKey, now)

        if (e.details.type === "permission.asked") {
          if (settings.sounds.permissionsEnabled()) {
            playSound(soundSrc(settings.sounds.permissions()))
          }
          if (settings.notifications.permissions()) {
            void platform.notify(title, description, href)
          }
        }

        if (e.details.type === "question.asked") {
          if (settings.notifications.agent()) {
            void platform.notify(title, description, href)
          }
        }

        const currentSession = params.id
        if (directory === currentDir() && targetID === currentSession) return

        dismissSessionAlert(sessionKey)

        const toastId = showToast({
          persistent: true,
          icon,
          title,
          description,
          actions: [
            {
              label: language.t("notification.action.goToSession"),
              onClick: () => navigate(href),
            },
            {
              label: language.t("common.dismiss"),
              onClick: "dismiss",
            },
          ],
        })
        toastBySession.set(sessionKey, toastId)
      })
      onCleanup(unsub)

      createEffect(() => {
        const currentSession = params.id
        if (!currentDir() || !currentSession) return
        const sessionKey = `${currentDir()}:${currentSession}`
        dismissSessionAlert(sessionKey)
        const [store] = globalSync.child(currentDir(), { bootstrap: false })
        // parentID removed from Agent type
      })
    })

  useUpdatePolling()
  useSDKNotificationToasts()

  function scrollToSession(sessionId: string, sessionKey: string) {
    if (!scrollContainerRef) return
    if (state.scrollSessionKey === sessionKey) return
    const element = scrollContainerRef.querySelector(`[data-session-id="${sessionId}"]`)
    if (!element) return
    const containerRect = scrollContainerRef.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()
    if (elementRect.top >= containerRect.top && elementRect.bottom <= containerRect.bottom) {
      setState("scrollSessionKey", sessionKey)
      return
    }
    setState("scrollSessionKey", sessionKey)
    element.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }

  const currentProject = createMemo(() => {
    const directory = currentDir()
    if (!directory) return

    const projects = layout.projects.list()

    const sandbox = projects.find((p) => p.sandboxes?.includes(directory))
    if (sandbox) return sandbox

    const direct = projects.find((p) => p.worktree === directory)
    if (direct) return direct

    const [child] = globalSync.child(directory, { bootstrap: false })
    const id = child.project
    if (!id) return

    const meta = globalSync.data.project.find((p) => p.id === id)
    const root = meta?.worktree
    if (!root) return

    return projects.find((p) => p.worktree === root)
  })

  const contextBarProjectName = createMemo(() => {
    const fromRoute = currentProject()
    if (fromRoute) return displayName(fromRoute)
    const pid = store.activeProjectId
    if (!pid) return
    const ws = selectedWorkspace()
    if (!ws) return
    const proj = workspace.projects
      .list(ws.id)()
      .find((p) => p.id === pid)
    return proj?.name
  })

  createEffect(
    on(
      () => ({
        ready: pageReady(),
        layoutReady: layoutReady(),
        projectId: params.projectId,
        list: layout.projects.list(),
      }),
      (value) => {
        if (!value.ready) return
        if (!value.layoutReady) return
        if (!state.autoselect) return
        if (value.projectId) return

        const last = server.projects.last()

        if (value.list.length === 0) {
          if (!last) return
          setState("autoselect", false)
          openProject(last, false)
          navigateToProject(last)
          return
        }

        const next = value.list.find((project) => project.worktree === last) ?? value.list[0]
        if (!next) return
        setState("autoselect", false)
        openProject(next.worktree, false)
        navigateToProject(next.worktree)
      },
    ),
  )

  const workspaceName = (directory: string, projectId?: string, branch?: string) => {
    const key = workspaceKey(directory)
    const direct = store.workspaceName[key] ?? store.workspaceName[directory]
    if (direct) return direct
    if (!projectId) return
    if (!branch) return
    return store.workspaceBranchName[projectId]?.[branch]
  }

  const setWorkspaceName = (directory: string, next: string, projectId?: string, branch?: string) => {
    const key = workspaceKey(directory)
    setStore("workspaceName", key, next)
    if (!projectId) return
    if (!branch) return
    if (!store.workspaceBranchName[projectId]) {
      setStore("workspaceBranchName", projectId, {})
    }
    setStore("workspaceBranchName", projectId, branch, next)
  }

  const workspaceLabel = (directory: string, branch?: string, projectId?: string) =>
    workspaceName(directory, projectId, branch) ?? branch ?? getFilename(directory)

  const workspaceSetting = createMemo(() => {
    const project = currentProject()
    if (!project) return false
    if (project.vcs !== "git") return false
    return layout.sidebar.workspaces(project.worktree)()
  })

  const visibleSessionDirs = createMemo(() => {
    const project = currentProject()
    if (!project) return [] as string[]
    if (!workspaceSetting()) return [project.worktree]

    const activeDir = currentDir()
    return workspaceIds(project).filter((directory) => {
      const expanded = store.workspaceExpanded[directory] ?? directory === project.worktree
      const active = directory === activeDir
      return expanded || active
    })
  })

  createEffect(() => {
    if (!pageReady()) return
    if (!layoutReady()) return
    const projects = layout.projects.list()
    for (const [directory, expanded] of Object.entries(store.workspaceExpanded)) {
      if (!expanded) continue
      const project = projects.find((item) => item.worktree === directory || item.sandboxes?.includes(directory))
      if (!project) continue
      if (project.vcs === "git" && layout.sidebar.workspaces(project.worktree)()) continue
      setStore("workspaceExpanded", directory, false)
    }
  })

  const currentSessions = createMemo(() => {
    const now = Date.now()
    const dirs = visibleSessionDirs()
    if (dirs.length === 0) return [] as Agent[]

    const result: Agent[] = []
    for (const dir of dirs) {
      const [dirStore] = globalSync.child(dir, { bootstrap: true })
      const dirSessions = sortedRootSessions(dirStore, now)
      result.push(...dirSessions)
    }
    return result
  })

  type PrefetchQueue = {
    inflight: Set<string>
    pending: string[]
    pendingSet: Set<string>
    running: number
  }

  const prefetchChunk = 200
  const prefetchConcurrency = 1
  const prefetchPendingLimit = 6
  const prefetchToken = { value: 0 }
  const prefetchQueues = new Map<string, PrefetchQueue>()

  const PREFETCH_MAX_SESSIONS_PER_DIR = 10
  const prefetchedByDir = new Map<string, Set<string>>()

  const lruFor = (directory: string) => {
    const existing = prefetchedByDir.get(directory)
    if (existing) return existing
    const created = new Set<string>()
    prefetchedByDir.set(directory, created)
    return created
  }

  const markPrefetched = (directory: string, sessionID: string) => {
    const lru = lruFor(directory)
    return pickSessionCacheEvictions({
      seen: lru,
      keep: sessionID,
      limit: PREFETCH_MAX_SESSIONS_PER_DIR,
      preserve: directory === currentDir() && params.id ? [params.id] : undefined,
    })
  }

  createEffect(() => {
    params.projectId
    globalSDK.url

    prefetchToken.value += 1
    for (const q of prefetchQueues.values()) {
      q.pending.length = 0
      q.pendingSet.clear()
    }
  })

  const queueFor = (directory: string) => {
    const existing = prefetchQueues.get(directory)
    if (existing) return existing

    const created: PrefetchQueue = {
      inflight: new Set(),
      pending: [],
      pendingSet: new Set(),
      running: 0,
    }
    prefetchQueues.set(directory, created)
    return created
  }

  const mergeByID = <T extends { id: string }>(current: T[], incoming: T[]) => {
    if (current.length === 0) {
      return incoming.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    }

    const map = new Map<string, T>()
    for (const item of current) {
      map.set(item.id, item)
    }
    for (const item of incoming) {
      map.set(item.id, item)
    }
    return [...map.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  }

  async function prefetchMessages(directory: string, sessionID: string, token: number) {
    const [store, setStore] = globalSync.child(directory, { bootstrap: false })

    return retry(() => globalSDK.client.agent.messages({ agentID: sessionID, limit: prefetchChunk }))
      .then((messages: any) => {
        if (prefetchToken.value !== token) return
        if (!lruFor(directory).has(sessionID)) return

        const raw = Array.isArray(messages.data) ? messages.data : []
        const items = (raw as Array<{ info: Message; parts: any[] }>).filter((x: any) => !!x?.info?.id)
        const next = items.map((x: any) => x.info).filter((m: any): m is Message => !!m?.id)
        const sorted = mergeByID([], next)

        const current = store.message[sessionID] ?? []
        const merged = mergeByID(
          current.filter((item): item is Message => !!item?.id),
          sorted,
        )

        batch(() => {
          setStore("message", sessionID, reconcile(merged, { key: "id" }))

          for (const message of items as any[]) {
            const currentParts = store.part[message.info.id] ?? []
            const mergedParts = mergeByID(
              currentParts.filter((item): item is (typeof currentParts)[number] & { id: string } => !!item?.id),
              message.parts.filter((item: any): item is any => !!item?.id),
            )

            setStore("part", message.info.id, reconcile(mergedParts, { key: "id" }))
          }
        })
      })
      .catch(() => undefined)
  }

  const pumpPrefetch = (directory: string) => {
    const q = queueFor(directory)
    if (q.running >= prefetchConcurrency) return

    const sessionID = q.pending.shift()
    if (!sessionID) return

    q.pendingSet.delete(sessionID)
    q.inflight.add(sessionID)
    q.running += 1

    const token = prefetchToken.value

    void prefetchMessages(directory, sessionID, token).finally(() => {
      q.running -= 1
      q.inflight.delete(sessionID)
      pumpPrefetch(directory)
    })
  }

  const prefetchSession = (session: Agent, priority: "high" | "low" = "low") => {
    const directory = session.directory
    if (!directory) return

    const [store] = globalSync.child(directory, { bootstrap: false })
    const cached = untrack(() => store.message[session.id] !== undefined)
    if (cached) return

    const q = queueFor(directory)
    if (q.inflight.has(session.id)) return
    if (q.pendingSet.has(session.id)) return

    const lru = lruFor(directory)
    const known = lru.has(session.id)
    if (!known && lru.size >= PREFETCH_MAX_SESSIONS_PER_DIR && priority !== "high") return
    const stale = markPrefetched(directory, session.id)
    if (stale.length > 0) {
      const [, setStore] = globalSync.child(directory, { bootstrap: false })
      for (const id of stale) {
        globalSync.todo.set(id, undefined)
      }
      setStore(
        produce((draft) => {
          dropSessionCaches(draft, stale)
        }),
      )
    }

    if (priority === "high") q.pending.unshift(session.id)
    if (priority !== "high") q.pending.push(session.id)
    q.pendingSet.add(session.id)

    while (q.pending.length > prefetchPendingLimit) {
      const dropped = q.pending.pop()
      if (!dropped) continue
      q.pendingSet.delete(dropped)
    }

    pumpPrefetch(directory)
  }

  createEffect(() => {
    const sessions = currentSessions()
    const id = params.id

    if (!id) {
      const first = sessions[0]
      if (first) prefetchSession(first)

      const second = sessions[1]
      if (second) prefetchSession(second)
      return
    }

    const index = sessions.findIndex((s) => s.id === id)
    if (index === -1) return

    const next = sessions[index + 1]
    if (next) prefetchSession(next)

    const prev = sessions[index - 1]
    if (prev) prefetchSession(prev)
  })

  function navigateSessionByOffset(offset: number) {
    const sessions = currentSessions()
    if (sessions.length === 0) return

    const sessionIndex = params.id ? sessions.findIndex((s) => s.id === params.id) : -1

    let targetIndex: number
    if (sessionIndex === -1) {
      targetIndex = offset > 0 ? 0 : sessions.length - 1
    } else {
      targetIndex = (sessionIndex + offset + sessions.length) % sessions.length
    }

    const session = sessions[targetIndex]
    if (!session) return

    const next = sessions[(targetIndex + 1) % sessions.length]
    const prev = sessions[(targetIndex - 1 + sessions.length) % sessions.length]

    if (offset > 0) {
      if (next) prefetchSession(next, "high")
      if (prev) prefetchSession(prev)
    }

    if (offset < 0) {
      if (prev) prefetchSession(prev, "high")
      if (next) prefetchSession(next)
    }

    navigateToSession(session)
  }

  function navigateSessionByUnseen(offset: number) {
    const sessions = currentSessions()
    if (sessions.length === 0) return

    const hasUnseen = sessions.some((session) => notification.session.unseenCount(session.id) > 0)
    if (!hasUnseen) return

    const activeIndex = params.id ? sessions.findIndex((s) => s.id === params.id) : -1
    const start = activeIndex === -1 ? (offset > 0 ? -1 : 0) : activeIndex

    for (let i = 1; i <= sessions.length; i++) {
      const index = offset > 0 ? (start + i) % sessions.length : (start - i + sessions.length) % sessions.length
      const session = sessions[index]
      if (!session) continue
      if (notification.session.unseenCount(session.id) === 0) continue

      prefetchSession(session, "high")

      const next = sessions[(index + 1) % sessions.length]
      const prev = sessions[(index - 1 + sessions.length) % sessions.length]

      if (offset > 0) {
        if (next) prefetchSession(next, "high")
        if (prev) prefetchSession(prev)
      }

      if (offset < 0) {
        if (prev) prefetchSession(prev, "high")
        if (next) prefetchSession(next)
      }

      navigateToSession(session)
      return
    }
  }

  async function archiveSession(session: Agent) {
    const [store, setStore] = globalSync.child(session.directory)
    const sessions = store.session ?? []
    const index = sessions.findIndex((s) => s.id === session.id)
    const nextSession = sessions[index + 1] ?? sessions[index - 1]

    await globalSDK.client.agent.delete({
      agentID: session.id,
    })
    setStore(
      produce((draft) => {
        const match = Binary.search(draft.session, session.id, (s) => s.id)
        if (match.found) draft.session.splice(match.index, 1)
      }),
    )
    if (session.id === params.id) {
      const dir = currentDir()
      if (nextSession) {
        navigate(sessionHref(dir, nextSession.id))
      } else {
        navigate(sessionHref(dir))
      }
    }
  }

  command.register("layout", () => {
    const commands: CommandOption[] = [
      {
        id: "sidebar.toggle",
        title: language.t("command.sidebar.toggle"),
        category: language.t("command.category.view"),
        keybind: "mod+b",
        onSelect: () => layout.sidebar.toggle(),
      },
      {
        id: "project.open",
        title: language.t("command.project.open"),
        category: language.t("command.category.project"),
        keybind: "mod+o",
        onSelect: () => chooseProject(),
      },
      {
        id: "provider.connect",
        title: language.t("command.provider.connect"),
        category: language.t("command.category.provider"),
        onSelect: () => connectProvider(),
      },
      {
        id: "server.switch",
        title: language.t("command.server.switch"),
        category: language.t("command.category.server"),
        onSelect: () => openServer(),
      },
      {
        id: "settings.open",
        title: language.t("command.settings.open"),
        category: language.t("command.category.settings"),
        keybind: "mod+comma",
        onSelect: () => openSettings(),
      },
      {
        id: "session.previous",
        title: language.t("command.session.previous"),
        category: language.t("command.category.session"),
        keybind: "alt+arrowup",
        onSelect: () => navigateSessionByOffset(-1),
      },
      {
        id: "session.next",
        title: language.t("command.session.next"),
        category: language.t("command.category.session"),
        keybind: "alt+arrowdown",
        onSelect: () => navigateSessionByOffset(1),
      },
      {
        id: "session.previous.unseen",
        title: language.t("command.session.previous.unseen"),
        category: language.t("command.category.session"),
        keybind: "shift+alt+arrowup",
        onSelect: () => navigateSessionByUnseen(-1),
      },
      {
        id: "session.next.unseen",
        title: language.t("command.session.next.unseen"),
        category: language.t("command.category.session"),
        keybind: "shift+alt+arrowdown",
        onSelect: () => navigateSessionByUnseen(1),
      },
      {
        id: "session.archive",
        title: language.t("command.session.archive"),
        category: language.t("command.category.session"),
        keybind: "mod+shift+backspace",
        disabled: !params.projectId || !params.id,
        onSelect: () => {
          const session = currentSessions().find((s) => s.id === params.id)
          if (session) archiveSession(session)
        },
      },
      {
        id: "workspace.new",
        title: language.t("workspace.new"),
        category: language.t("command.category.workspace"),
        keybind: "mod+shift+w",
        disabled: !workspaceSetting(),
        onSelect: () => {
          const project = currentProject()
          if (!project) return
          return createWorkspace(project)
        },
      },
      {
        id: "workspace.toggle",
        title: language.t("command.workspace.toggle"),
        description: language.t("command.workspace.toggle.description"),
        category: language.t("command.category.workspace"),
        slash: "workspace",
        disabled: !currentProject() || currentProject()?.vcs !== "git",
        onSelect: () => {
          const project = currentProject()
          if (!project) return
          if (project.vcs !== "git") return
          const wasEnabled = layout.sidebar.workspaces(project.worktree)()
          layout.sidebar.toggleWorkspaces(project.worktree)
          showToast({
            title: wasEnabled
              ? language.t("toast.workspace.disabled.title")
              : language.t("toast.workspace.enabled.title"),
            description: wasEnabled
              ? language.t("toast.workspace.disabled.description")
              : language.t("toast.workspace.enabled.description"),
          })
        },
      },
      {
        id: "theme.cycle",
        title: language.t("command.theme.cycle"),
        category: language.t("command.category.theme"),
        keybind: "mod+shift+t",
        onSelect: () => cycleTheme(1),
      },
    ]

    for (const [id, definition] of availableThemeEntries()) {
      commands.push({
        id: `theme.set.${id}`,
        title: language.t("command.theme.set", { theme: definition.name ?? id }),
        category: language.t("command.category.theme"),
        onSelect: () => theme.commitPreview(),
        onHighlight: () => {
          theme.previewTheme(id)
          return () => theme.cancelPreview()
        },
      })
    }

    commands.push({
      id: "theme.scheme.cycle",
      title: language.t("command.theme.scheme.cycle"),
      category: language.t("command.category.theme"),
      keybind: "mod+shift+s",
      onSelect: () => cycleColorScheme(1),
    })

    for (const scheme of colorSchemeOrder) {
      commands.push({
        id: `theme.scheme.${scheme}`,
        title: language.t("command.theme.scheme.set", { scheme: colorSchemeLabel(scheme) }),
        category: language.t("command.category.theme"),
        onSelect: () => theme.commitPreview(),
        onHighlight: () => {
          theme.previewColorScheme(scheme)
          return () => theme.cancelPreview()
        },
      })
    }

    commands.push({
      id: "language.cycle",
      title: language.t("command.language.cycle"),
      category: language.t("command.category.language"),
      onSelect: () => cycleLanguage(1),
    })

    for (const locale of language.locales) {
      commands.push({
        id: `language.set.${locale}`,
        title: language.t("command.language.set", { language: language.label(locale) }),
        category: language.t("command.category.language"),
        onSelect: () => setLocale(locale),
      })
    }

    return commands
  })

  function connectProvider() {
    dialog.show(() => <DialogSelectProvider />)
  }

  function openServer() {
    dialog.show(() => <DialogSelectServer />)
  }

  function openSettings() {
    dialog.show(() => <DialogSettings />)
  }

  function projectRoot(directory: string) {
    const project = layout.projects
      .list()
      .find((item) => item.worktree === directory || item.sandboxes?.includes(directory))
    if (project) return project.worktree

    const known = Object.entries(store.workspaceOrder).find(
      ([root, dirs]) => root === directory || dirs.includes(directory),
    )
    if (known) return known[0]

    const [child] = globalSync.child(directory, { bootstrap: false })
    const id = child.project
    if (!id) return directory

    const meta = globalSync.data.project.find((item) => item.id === id)
    return meta?.worktree ?? directory
  }

  function activeProjectRoot(directory: string) {
    return currentProject()?.worktree ?? projectRoot(directory)
  }

  function touchProjectRoute() {
    const root = currentProject()?.worktree
    if (!root) return
    if (server.projects.last() !== root) server.projects.touch(root)
    return root
  }

  function rememberSessionRoute(directory: string, id: string, root = activeProjectRoot(directory)) {
    setStore("lastProjectSession", root, { directory, id, at: Date.now() })
    return root
  }

  function clearLastProjectSession(root: string) {
    if (!store.lastProjectSession[root]) return
    setStore(
      "lastProjectSession",
      produce((draft) => {
        delete draft[root]
      }),
    )
  }

  function syncSessionRoute(directory: string, id: string, root = activeProjectRoot(directory)) {
    rememberSessionRoute(directory, id, root)
    notification.session.markViewed(id)
    const expanded = untrack(() => store.workspaceExpanded[directory])
    if (expanded === false) {
      setStore("workspaceExpanded", directory, true)
    }
    requestAnimationFrame(() => scrollToSession(id, `${directory}:${id}`))
    return root
  }

  async function navigateToProject(directory: string | undefined) {
    if (!directory) return
    const root = projectRoot(directory)
    server.projects.touch(root)
    const project = layout.projects.list().find((item) => item.worktree === root)
    let dirs = project
      ? effectiveWorkspaceOrder(root, [root, ...(project.sandboxes ?? [])], store.workspaceOrder[root])
      : [root]
    const canOpen = (value: string | undefined) => {
      if (!value) return false
      return dirs.some((item) => workspaceKey(item) === workspaceKey(value))
    }
    const refreshDirs = async (target?: string) => {
      if (!target || target === root || canOpen(target)) return canOpen(target)
      const listed = await globalSDK.client.worktree
        .list({ directory: root })
        .then((x) => x.data ?? [])
        .catch(() => [] as string[])
      dirs = effectiveWorkspaceOrder(root, [root, ...listed], store.workspaceOrder[root])
      return canOpen(target)
    }
    const openSession = async (target: { directory: string; id: string }) => {
      if (!canOpen(target.directory)) return false
      const [data] = globalSync.child(target.directory, { bootstrap: false })
      if (data.session.some((item) => item.id === target.id)) {
        setStore("lastProjectSession", root, { directory: target.directory, id: target.id, at: Date.now() })
        navigateWithSidebarReset(sessionHref(target.directory, target.id))
        return true
      }
      const resolved = await globalSDK.client.agent
        .get({ agentID: target.id })
        .then((x: any) => x.data)
        .catch(() => undefined)
      if (!resolved?.directory) return false
      if (!canOpen(resolved.directory)) return false
      setStore("lastProjectSession", root, { directory: resolved.directory, id: resolved.id, at: Date.now() })
      navigateWithSidebarReset(sessionHref(resolved.directory, resolved.id))
      return true
    }

    const projectSession = store.lastProjectSession[root]
    if (projectSession?.id) {
      await refreshDirs(projectSession.directory)
      const opened = await openSession(projectSession)
      if (opened) return
      clearLastProjectSession(root)
    }

    const latest = latestRootSession(
      dirs.map((item) => globalSync.child(item, { bootstrap: false })[0]),
      Date.now(),
    )
    if (latest && (await openSession(latest))) {
      return
    }

    const fetched = latestRootSession(
      await Promise.all(
        dirs.map(async (item) => ({
          path: { directory: item },
          session: await globalSDK.client.agent
            .list({ directory: item } as any)
            .then((x: any) => x.data ?? [])
            .catch(() => []),
        })),
      ),
      Date.now(),
    )
    if (fetched && (await openSession(fetched))) {
      return
    }

    navigateWithSidebarReset(sessionHref(root))
  }

  function navigateToSession(session: Agent | undefined) {
    if (!session) return
    navigateWithSidebarReset(sessionHref(session.directory, session.id))
  }

  function openProject(directory: string, navigate = true) {
    layout.projects.open(directory)
    if (navigate) navigateToProject(directory)
  }

  const handleDeepLinks = (urls: string[]) => {
    if (!server.isLocal()) return

    for (const directory of collectOpenProjectDeepLinks(urls)) {
      openProject(directory)
    }

    for (const link of collectNewSessionDeepLinks(urls)) {
      openProject(link.directory, false)
      const pid = projectIdFromDir(link.directory)
      const slug = pid ?? base64Encode(link.directory)
      if (link.prompt) {
        setSessionHandoff(slug, { prompt: link.prompt })
      }
      const base = pid ? `/project/${pid}/session` : `/${base64Encode(link.directory)}/session`
      const href = link.prompt ? `${base}?prompt=${encodeURIComponent(link.prompt)}` : base
      navigateWithSidebarReset(href)
    }
  }

  onMount(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ urls: string[] }>).detail
      const urls = detail?.urls ?? []
      if (urls.length === 0) return
      handleDeepLinks(urls)
    }

    handleDeepLinks(drainPendingDeepLinks(window))
    window.addEventListener(deepLinkEvent, handler as EventListener)
    onCleanup(() => window.removeEventListener(deepLinkEvent, handler as EventListener))
  })

  async function renameProject(project: LocalProject, next: string) {
    const current = displayName(project)
    if (next === current) return
    const name = next === getFilename(project.worktree) ? "" : next

    if (project.id && project.id !== "global") {
      await globalSDK.client.product.update({ projectID: project.id, directory: project.worktree, name })
      return
    }

    globalSync.project.meta(project.worktree, { name })
  }

  const renameWorkspace = (directory: string, next: string, projectId?: string, branch?: string) => {
    const current = workspaceName(directory, projectId, branch) ?? branch ?? getFilename(directory)
    if (current === next) return
    setWorkspaceName(directory, next, projectId, branch)
  }

  function closeProject(directory: string) {
    const list = layout.projects.list()
    const index = list.findIndex((x) => x.worktree === directory)
    const active = currentProject()?.worktree === directory
    if (index === -1) return
    const next = list[index + 1]

    if (!active) {
      layout.projects.close(directory)
      return
    }

    if (!next) {
      layout.projects.close(directory)
      navigate("/")
      return
    }

    navigateWithSidebarReset(sessionHref(next.worktree))
    layout.projects.close(directory)
    queueMicrotask(() => {
      void navigateToProject(next.worktree)
    })
  }

  function toggleProjectWorkspaces(project: LocalProject) {
    const enabled = layout.sidebar.workspaces(project.worktree)()
    if (enabled) {
      layout.sidebar.toggleWorkspaces(project.worktree)
      return
    }
    if (project.vcs !== "git") return
    layout.sidebar.toggleWorkspaces(project.worktree)
  }

  const showEditProjectDialog = (project: LocalProject) => dialog.show(() => <DialogEditProject project={project} />)

  async function chooseProject() {
    function resolve(result: string | string[] | null) {
      if (Array.isArray(result)) {
        for (const directory of result) {
          openProject(directory, false)
        }
        navigateToProject(result[0])
      } else if (result) {
        openProject(result)
      }
    }

    if (platform.openDirectoryPickerDialog && server.isLocal()) {
      const result = await platform.openDirectoryPickerDialog?.({
        title: language.t("command.project.open"),
        multiple: true,
      })
      resolve(result)
    } else {
      dialog.show(
        () => <DialogSelectDirectory multiple={true} onSelect={resolve} />,
        () => resolve(null),
      )
    }
  }

  const deleteWorkspace = async (root: string, directory: string, leaveDeletedWorkspace = false) => {
    if (directory === root) return

    const current = currentDir()
    const currentKey = workspaceKey(current)
    const deletedKey = workspaceKey(directory)
    const shouldLeave = leaveDeletedWorkspace || (!!params.projectId && currentKey === deletedKey)
    if (!leaveDeletedWorkspace && shouldLeave) {
      navigateWithSidebarReset(`/${base64Encode(root)}/session`)
    }

    setBusy(directory, true)

    const result = await globalSDK.client.worktree
      .remove({ directory: root, worktreeRemoveInput: { directory } })
      .then((x) => x.data)
      .catch((err) => {
        showToast({
          title: language.t("workspace.delete.failed.title"),
          description: errorMessage(err, language.t("common.requestFailed")),
        })
        return false
      })

    setBusy(directory, false)

    if (!result) return

    if (workspaceKey(store.lastProjectSession[root]?.directory ?? "") === workspaceKey(directory)) {
      clearLastProjectSession(root)
    }

    globalSync.set(
      "project",
      produce((draft) => {
        const project = draft.find((item) => item.worktree === root)
        if (!project) return
        project.sandboxes = (project.sandboxes ?? []).filter((sandbox) => sandbox !== directory)
      }),
    )
    setStore("workspaceOrder", root, (order) => (order ?? []).filter((workspace) => workspace !== directory))

    layout.projects.close(directory)
    layout.projects.open(root)

    if (shouldLeave) return

    const nextCurrent = currentDir()
    const nextKey = workspaceKey(nextCurrent)
    const project = layout.projects.list().find((item) => item.worktree === root)
    const dirs = project
      ? effectiveWorkspaceOrder(root, [root, ...(project.sandboxes ?? [])], store.workspaceOrder[root])
      : [root]
    const valid = dirs.some((item) => workspaceKey(item) === nextKey)

    if (params.projectId && projectRoot(nextCurrent) === root && !valid) {
      navigateWithSidebarReset(sessionHref(root))
    }
  }

  const resetWorkspace = async (root: string, directory: string) => {
    if (directory === root) return
    setBusy(directory, true)

    const progress = showToast({
      persistent: true,
      title: language.t("workspace.resetting.title"),
      description: language.t("workspace.resetting.description"),
    })
    const dismiss = () => toaster.dismiss(progress)

    const sessions: Agent[] = await globalSDK.client.agent
      .list({ directory } as any)
      .then((x: any) => x.data ?? [])
      .catch(() => [])

    clearWorkspaceTerminals(
      directory,
      sessions.map((s) => s.id),
      platform,
    )
    await globalSDK.client.instance.dispose({ directory }).catch(() => undefined)

    const result = await globalSDK.client.worktree
      .reset({ directory: root, worktreeResetInput: { directory } })
      .then((x) => x.data)
      .catch((err) => {
        showToast({
          title: language.t("workspace.reset.failed.title"),
          description: errorMessage(err, language.t("common.requestFailed")),
        })
        return false
      })

    if (!result) {
      setBusy(directory, false)
      dismiss()
      return
    }

    const archivedAt = Date.now()
    await Promise.all(
      sessions
        .map((session) =>
          globalSDK.client.agent
            .delete({
              agentID: session.id,
            })
            .catch(() => undefined),
        ),
    )

    setBusy(directory, false)
    dismiss()

    showToast({
      title: language.t("workspace.reset.success.title"),
      description: language.t("workspace.reset.success.description"),
      actions: [
        {
          label: language.t("command.session.new"),
          onClick: () => {
            const href = sessionHref(directory)
            navigate(href)
            layout.mobileSidebar.hide()
          },
        },
        {
          label: language.t("common.dismiss"),
          onClick: "dismiss",
        },
      ],
    })
  }

  function DialogDeleteWorkspace(props: { root: string; directory: string }) {
    const name = createMemo(() => getFilename(props.directory))
    const [data, setData] = createStore({
      status: "loading" as "loading" | "ready" | "error",
      dirty: false,
    })

    onMount(() => {
      globalSDK.client.file
        .status({ directory: props.directory })
        .then((x) => {
          const files = x.data ?? []
          const dirty = files.length > 0
          setData({ status: "ready", dirty })
        })
        .catch(() => {
          setData({ status: "error", dirty: false })
        })
    })

    const handleDelete = () => {
      const leaveDeletedWorkspace = !!params.projectId && workspaceKey(currentDir()) === workspaceKey(props.directory)
      if (leaveDeletedWorkspace) {
        navigateWithSidebarReset(sessionHref(props.root))
      }
      dialog.close()
      void deleteWorkspace(props.root, props.directory, leaveDeletedWorkspace)
    }

    const description = () => {
      if (data.status === "loading") return language.t("workspace.status.checking")
      if (data.status === "error") return language.t("workspace.status.error")
      if (!data.dirty) return language.t("workspace.status.clean")
      return language.t("workspace.status.dirty")
    }

    return (
      <Dialog title={language.t("workspace.delete.title")} fit>
        <div class="flex flex-col gap-4 pl-6 pr-2.5 pb-3">
          <div class="flex flex-col gap-1">
            <span class="text-14-regular text-text-strong">
              {language.t("workspace.delete.confirm", { name: name() })}
            </span>
            <span class="text-12-regular text-text-weak">{description()}</span>
          </div>
          <div class="flex justify-end gap-2">
            <Button variant="ghost" size="large" onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </Button>
            <Button variant="primary" size="large" disabled={data.status === "loading"} onClick={handleDelete}>
              {language.t("workspace.delete.button")}
            </Button>
          </div>
        </div>
      </Dialog>
    )
  }

  function DialogResetWorkspace(props: { root: string; directory: string }) {
    const name = createMemo(() => getFilename(props.directory))
    const [state, setState] = createStore({
      status: "loading" as "loading" | "ready" | "error",
      dirty: false,
      sessions: [] as Agent[],
    })

    const refresh = async () => {
      const sessions = await globalSDK.client.agent
        .list({ directory: props.directory } as any)
        .then((x: any) => x.data ?? [])
        .catch(() => [])
      const active = sessions.filter((session: any) => !!session?.id)
      setState({ sessions: active })
    }

    onMount(() => {
      globalSDK.client.file
        .status({ directory: props.directory })
        .then((x) => {
          const files = x.data ?? []
          const dirty = files.length > 0
          setState({ status: "ready", dirty })
          void refresh()
        })
        .catch(() => {
          setState({ status: "error", dirty: false })
        })
    })

    const handleReset = () => {
      dialog.close()
      void resetWorkspace(props.root, props.directory)
    }

    const archivedCount = () => state.sessions.length

    const description = () => {
      if (state.status === "loading") return language.t("workspace.status.checking")
      if (state.status === "error") return language.t("workspace.status.error")
      if (!state.dirty) return language.t("workspace.status.clean")
      return language.t("workspace.status.dirty")
    }

    const archivedLabel = () => {
      const count = archivedCount()
      if (count === 0) return language.t("workspace.reset.archived.none")
      if (count === 1) return language.t("workspace.reset.archived.one")
      return language.t("workspace.reset.archived.many", { count })
    }

    return (
      <Dialog title={language.t("workspace.reset.title")} fit>
        <div class="flex flex-col gap-4 pl-6 pr-2.5 pb-3">
          <div class="flex flex-col gap-1">
            <span class="text-14-regular text-text-strong">
              {language.t("workspace.reset.confirm", { name: name() })}
            </span>
            <span class="text-12-regular text-text-weak">
              {description()} {archivedLabel()} {language.t("workspace.reset.note")}
            </span>
          </div>
          <div class="flex justify-end gap-2">
            <Button variant="ghost" size="large" onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </Button>
            <Button variant="primary" size="large" disabled={state.status === "loading"} onClick={handleReset}>
              {language.t("workspace.reset.button")}
            </Button>
          </div>
        </div>
      </Dialog>
    )
  }

  const activeRoute = {
    session: "",
    sessionProject: "",
  }

  createEffect(
    on(
      () => [pageReady(), params.projectId, params.id, currentDir(), currentProject()?.worktree] as const,
      ([ready, projectId, id, directory]) => {
        if (!ready || !projectId || !directory) {
          activeRoute.session = ""
          activeRoute.sessionProject = ""
          return
        }

        const root = touchProjectRoute() ?? activeProjectRoot(directory)

        if (!id) {
          activeRoute.session = ""
          activeRoute.sessionProject = ""
          return
        }

        const session = `${projectId}/${id}`
        if (session !== activeRoute.session) {
          activeRoute.session = session
          activeRoute.sessionProject = syncSessionRoute(directory, id, root)
          return
        }

        if (root === activeRoute.sessionProject) return
        activeRoute.sessionProject = rememberSessionRoute(directory, id, root)
      },
    ),
  )

  createEffect(() => {
    const sidebarWidth = layout.sidebar.opened() ? layout.sidebar.width() : 48
    document.documentElement.style.setProperty("--dialog-left-margin", `${sidebarWidth}px`)
  })

  const loadedSessionDirs = new Set<string>()

  createEffect(
    on(
      visibleSessionDirs,
      (dirs) => {
        if (dirs.length === 0) {
          loadedSessionDirs.clear()
          return
        }

        const next = new Set(dirs)
        for (const directory of next) {
          if (loadedSessionDirs.has(directory)) continue
          globalSync.project.loadSessions(directory)
        }

        loadedSessionDirs.clear()
        for (const directory of next) {
          loadedSessionDirs.add(directory)
        }
      },
      { defer: true },
    ),
  )

  function handleWorkspaceRailDragStart(event: unknown) {
    const id = getDraggableId(event)
    if (!id) return
    setStore("activeWorkspace", id)
  }

  function handleWorkspaceRailDragOver(event: DragEvent) {
    const { draggable, droppable } = event
    if (!draggable || !droppable) return
    const list = workspaceList()
    const fromIndex = list.findIndex((w) => w.id === draggable.id.toString())
    const toIndex = list.findIndex((w) => w.id === droppable.id.toString())
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return
    const ids = list.map((w) => w.id)
    const [item] = ids.splice(fromIndex, 1)
    if (!item) return
    ids.splice(toIndex, 0, item)
    workspace.workspaces.reorder(ids)
  }

  function handleWorkspaceRailDragEnd() {
    setStore("activeWorkspace", undefined)
  }

  function addWorkspace() {
    dialog.show(() => (
      <DialogAddWorkspace
        onAdded={(id) => {
          setStore("activeWorkspaceId", id)
          layout.sidebar.open()
        }}
      />
    ))
  }

  function workspaceIds(project: LocalProject | undefined) {
    if (!project) return []
    const local = project.worktree
    const dirs = [local, ...(project.sandboxes ?? [])]
    const active = currentProject()
    const directory = active?.worktree === project.worktree ? currentDir() : undefined
    const extra = directory && directory !== local && !dirs.includes(directory) ? directory : undefined
    const pending = extra ? WorktreeState.get(extra)?.status === "pending" : false

    const ordered = effectiveWorkspaceOrder(local, dirs, store.workspaceOrder[project.worktree])
    if (pending && extra) return [local, extra, ...ordered.filter((item) => item !== local)]
    if (!extra) return ordered
    if (pending) return ordered
    return [...ordered, extra]
  }

  const sidebarProject = createMemo(() => currentProject())

  function handleWorkspaceDragStart(event: unknown) {
    const id = getDraggableId(event)
    if (!id) return
    setStore("activeWorkspace", id)
  }

  function handleWorkspaceDragOver(event: DragEvent) {
    const { draggable, droppable } = event
    if (!draggable || !droppable) return

    const project = sidebarProject()
    if (!project) return

    const ids = workspaceIds(project)
    const fromIndex = ids.findIndex((dir) => dir === draggable.id.toString())
    const toIndex = ids.findIndex((dir) => dir === droppable.id.toString())
    if (fromIndex === -1 || toIndex === -1) return
    if (fromIndex === toIndex) return

    const result = ids.slice()
    const [item] = result.splice(fromIndex, 1)
    if (!item) return
    result.splice(toIndex, 0, item)
    setStore(
      "workspaceOrder",
      project.worktree,
      result.filter((directory) => workspaceKey(directory) !== workspaceKey(project.worktree)),
    )
  }

  function handleWorkspaceDragEnd() {
    setStore("activeWorkspace", undefined)
  }

  const createWorkspace = async (project: LocalProject) => {
    clearSidebarHoverState()
    const created = await globalSDK.client.worktree
      .create({ directory: project.worktree })
      .then((x) => x.data)
      .catch((err) => {
        showToast({
          title: language.t("workspace.create.failed.title"),
          description: errorMessage(err, language.t("common.requestFailed")),
        })
        return undefined
      })

    if (!created?.directory) return

    setWorkspaceName(created.directory, created.branch, project.id, created.branch)

    const local = project.worktree
    const key = workspaceKey(created.directory)
    const root = workspaceKey(local)

    setBusy(created.directory, true)
    WorktreeState.pending(created.directory)
    setStore("workspaceExpanded", key, true)
    if (key !== created.directory) {
      setStore("workspaceExpanded", created.directory, true)
    }
    setStore("workspaceOrder", project.worktree, (prev) => {
      const existing = prev ?? []
      const next = existing.filter((item) => {
        const id = workspaceKey(item)
        return id !== root && id !== key
      })
      return [created.directory, ...next]
    })

    globalSync.child(created.directory)
    navigateWithSidebarReset(sessionHref(created.directory))
  }

  const workspaceSidebarCtx: WorkspaceSidebarContext = {
    currentDir,
    sidebarExpanded,
    sidebarHovering,
    nav: () => state.nav,
    hoverAgent: () => state.hoverSession,
    setHoverAgent: setHoverSession,
    clearHoverProjectSoon,
    prefetchAgent: prefetchSession,
    archiveAgent: archiveSession,
    workspaceName,
    renameWorkspace,
    editorOpen,
    openEditor,
    closeEditor,
    setEditor,
    InlineEditor,
    isBusy,
    workspaceExpanded: (directory, local) => workspaceOpenState(store.workspaceExpanded, directory, local),
    setWorkspaceExpanded: (directory, value) => setStore("workspaceExpanded", directory, value),
    showResetWorkspaceDialog: (root, directory) =>
      dialog.show(() => <DialogResetWorkspace root={root} directory={directory} />),
    showDeleteWorkspaceDialog: (root, directory) =>
      dialog.show(() => <DialogDeleteWorkspace root={root} directory={directory} />),
    setScrollContainerRef: (el, mobile) => {
      if (!mobile) scrollContainerRef = el
    },
  }

  const projectSidebarCtx: ProjectSidebarContext = {
    currentDir,
    sidebarOpened: () => layout.sidebar.opened(),
    sidebarHovering,
    hoverProject: () => state.hoverProject,
    nav: () => state.nav,
    onProjectMouseEnter: (worktree, event) => aim.enter(worktree, event),
    onProjectMouseLeave: (worktree) => aim.leave(worktree),
    onProjectFocus: (worktree) => aim.activate(worktree),
    navigateToProject,
    openSidebar: () => layout.sidebar.open(),
    closeProject,
    showEditProjectDialog,
    toggleProjectWorkspaces,
    workspacesEnabled: (project) => project.vcs === "git" && layout.sidebar.workspaces(project.worktree)(),
    workspaceIds,
    workspaceLabel,
    sessionProps: {
      sidebarExpanded,
      sidebarHovering,
      nav: () => state.nav,
      hoverAgent: () => state.hoverSession,
      setHoverAgent: setHoverSession,
      clearHoverProjectSoon,
      prefetchAgent: prefetchSession,
      archiveAgent: archiveSession,
    },
    setHoverSession,
  }

  const projectList = (wid: string) => createMemo(() => workspace.projects.list(wid)())

  const hasWorkspaceProjects = createMemo(() => {
    const ws = selectedWorkspace()
    if (!ws) return false
    return workspace.projects.list(ws.id)().length > 0
  })

  const addProject = (wid: string) => {
    dialog.show(() => (
      <DialogAddProject
        workspaceId={wid}
        onAdded={(featureId, productId) => {
          setStore("activeProjectId", featureId)
          setStore("lastProjectByWorkspace", wid, { projectId: featureId, at: Date.now() })
          navigateWithSidebarReset(featureHref(productId, featureId))
        }}
      />
    ))
  }

  const showDeleteSidebarWorkspaceDialog = (w: Workspace) => {
    dialog.show(() => (
      <Dialog title={language.t("sidebar.workspace.delete.title")} fit>
        <div class="flex flex-col gap-4 pl-6 pr-2.5 pb-3">
          <span class="text-14-regular text-text-strong">
            {language.t("sidebar.workspace.delete.confirm", { name: w.name })}
          </span>
          <div class="flex justify-end gap-2">
            <Button variant="ghost" size="large" onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              size="large"
              onClick={async () => {
                const client = globalSDK.createClient({})
                const features = workspace.projects.list(w.id)()
                await Promise.all(
                  features
                    .filter((p) => !!(p as any).productId)
                    .map((p) => client.feature.remove({ featureID: p.id }).catch(() => {})),
                )
                workspace.workspaces.remove(w.id)
                const list = workspaceList().filter((x) => x.id !== w.id)
                const next = list[0]
                if (next) selectWorkspace(next)
                else navigateWithSidebarReset("/")
                dialog.close()
              }}
            >
              {language.t("sidebar.workspace.delete.button")}
            </Button>
          </div>
        </div>
      </Dialog>
    ))
  }

  const showDeleteSidebarProjectDialog = (proj: { id: string; name: string; workspaceId: string }) => {
    dialog.show(() => (
      <Dialog title={language.t("sidebar.project.delete.title")} fit>
        <div class="flex flex-col gap-4 pl-6 pr-2.5 pb-3">
          <span class="text-14-regular text-text-strong">
            {language.t("sidebar.project.delete.confirm", { name: proj.name })}
          </span>
          <div class="flex justify-end gap-2">
            <Button variant="ghost" size="large" onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              size="large"
              onClick={async () => {
                const wasActive = store.activeProjectId === proj.id
                if ((proj as any).productId) {
                  const client = globalSDK.createClient({})
                  await client.feature.remove({ featureID: proj.id }).catch(() => {})
                }
                workspace.projects.remove(proj.id)
                if (wasActive) {
                  const list = workspace.projects.list(proj.workspaceId)()
                  const next = list[0]
                  if (next) {
                    setStore("activeProjectId", next.id)
                    setStore("lastProjectByWorkspace", proj.workspaceId, { projectId: next.id, at: Date.now() })
                    const nextPath = (next as any).productId
                      ? featureHref((next as any).productId, next.id)
                      : sessionHref(projectDir(next), next.sessionId)
                    navigateWithSidebarReset(nextPath)
                  } else {
                    setStore("activeProjectId", undefined)
                    navigateWithSidebarReset("/")
                  }
                }
                dialog.close()
              }}
            >
              {language.t("sidebar.project.delete.button")}
            </Button>
          </div>
        </div>
      </Dialog>
    ))
  }

  const SidebarPanel = (panelProps: { workspace: Workspace; mobile?: boolean; merged?: boolean }) => {
    const merged = createMemo(() => panelProps.mobile || (panelProps.merged ?? layout.sidebar.opened()))
    const hover = createMemo(() => !panelProps.mobile && panelProps.merged === false && !layout.sidebar.opened())
    const ws = panelProps.workspace
    const projects = projectList(ws.id)

    const renameWorkspace = (next: string) => {
      if (next.trim()) workspace.workspaces.update(ws.id, { name: next.trim() })
    }

    return (
      <div
        classList={{
          "flex flex-col min-h-0 min-w-0 box-border rounded-tl-[12px]": true,
          "border border-b-0 border-border-weak-base": !merged(),
          "border-l border-t border-border-weaker-base": merged(),
          "bg-background-base": merged() || hover(),
          "bg-background-stronger": !merged() && !hover(),
          "flex-1 min-w-0": panelProps.mobile,
          "max-w-full overflow-hidden": panelProps.mobile,
        }}
        style={{
          width: panelProps.mobile ? undefined : `${Math.max(Math.max(layout.sidebar.width(), 244) - 64, 0)}px`,
        }}
      >
        <div class="shrink-0 px-2 py-1">
          <div class="group/workspace flex items-start justify-between gap-2 p-2 pr-1">
            <div class="flex flex-col min-w-0 flex-1 h-fit gap-0">
              <span class="mb-0.5 shrink-0 text-[10px] font-medium text-text-weak uppercase tracking-wide">
                {language.t("sidebar.context.workspace")}
              </span>
              <InlineEditor
                id={`workspace:${ws.id}`}
                value={() => ws.name}
                onSave={renameWorkspace}
                class="text-14-medium text-text-strong truncate"
                displayClass="text-14-medium text-text-strong truncate"
                stopPropagation
              />
            </div>
            <DropdownMenu modal={!sidebarHovering()}>
              <DropdownMenu.Trigger
                as={IconButton}
                icon="dot-grid"
                variant="ghost"
                data-action="workspace-menu"
                data-workspace={ws.id}
                class="shrink-0 size-6 rounded-md data-[expanded]:bg-surface-base-active"
                classList={{
                  "opacity-0 group-hover/workspace:opacity-100 data-[expanded]:opacity-100": !panelProps.mobile,
                }}
                aria-label={language.t("common.moreOptions")}
              />
              <DropdownMenu.Portal>
                <DropdownMenu.Content class="mt-1">
                  <DropdownMenu.Item onSelect={() => {}}>
                    <DropdownMenu.ItemLabel>{language.t("common.edit")}</DropdownMenu.ItemLabel>
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item onSelect={() => showDeleteSidebarWorkspaceDialog(ws)}>
                    <DropdownMenu.ItemLabel>{language.t("common.delete")}</DropdownMenu.ItemLabel>
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu>
          </div>
        </div>

        <div class="flex-1 min-h-0 flex flex-col">
          <div class="shrink-0 py-4 px-4 border-t border-border-weaker-base">
            <div class="flex items-center justify-between gap-2">
              <span class="text-[14px] font-medium text-white capitalize tracking-wide">
                {language.t("sidebar.context.projects")}
              </span>
              <Button size="small" variant="secondary" icon="plus-small" onClick={() => addProject(ws.id)}>
                {language.t("command.project.add")}
              </Button>
            </div>
          </div>
          <div
            ref={(el) => {
              if (!panelProps.mobile) scrollContainerRef = el
            }}
            class="size-full flex flex-col py-2 px-2 gap-1 overflow-y-auto no-scrollbar [overflow-anchor:none]"
          >
            <For each={projects()}>
              {(proj) => (
                <div
                  class="group/project flex w-full items-center rounded-md px-0.5 hover:bg-surface-base-hover"
                  classList={{
                    "bg-surface-base-active": store.activeProjectId === proj.id,
                  }}
                >
                  <button
                    type="button"
                    class="flex-1 min-w-0 px-2 py-2 text-left text-14-regular text-text-strong"
                    classList={{
                      "text-text-strong": store.activeProjectId === proj.id,
                    }}
                    onClick={() => {
                      setStore("activeProjectId", proj.id)
                      setStore("lastProjectByWorkspace", ws.id, { projectId: proj.id, at: Date.now() })
                      const path = proj.productId
                        ? featureHref(proj.productId, proj.id)
                        : sessionHref(projectDir(proj), proj.sessionId)
                      navigateWithSidebarReset(path)
                    }}
                  >
                    <span class="block truncate">{proj.name}</span>
                  </button>
                  <DropdownMenu modal={!sidebarHovering()}>
                    <DropdownMenu.Trigger
                      as={IconButton}
                      icon="dot-grid"
                      variant="ghost"
                      class="shrink-0 size-6 rounded-md opacity-0 group-hover/project:opacity-100 data-[expanded]:opacity-100"
                      onClick={(e: MouseEvent) => e.stopPropagation()}
                      aria-label={language.t("common.moreOptions")}
                    />
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content>
                        <DropdownMenu.Item onSelect={() => showDeleteSidebarProjectDialog(proj)}>
                          <DropdownMenu.ItemLabel>{language.t("common.delete")}</DropdownMenu.ItemLabel>
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu>
                </div>
              )}
            </For>
          </div>
        </div>

        <div
          class="shrink-0 px-3 py-3"
          classList={{
            hidden: store.gettingStartedDismissed || !(providers.all().length > 0 && providers.paid().length === 0),
          }}
        >
          <div class="rounded-xl bg-background-base shadow-xs-border-base" data-component="getting-started">
            <div class="p-3 flex flex-col gap-6">
              <div class="flex flex-col gap-2">
                <div class="text-14-medium text-text-strong">{language.t("sidebar.gettingStarted.title")}</div>
                <div class="text-14-regular text-text-base" style={{ "line-height": "var(--line-height-normal)" }}>
                  {language.t("sidebar.gettingStarted.line1")}
                </div>
                <div class="text-14-regular text-text-base" style={{ "line-height": "var(--line-height-normal)" }}>
                  {language.t("sidebar.gettingStarted.line2")}
                </div>
              </div>
              <div data-component="getting-started-actions">
                <Button size="large" icon="plus-small" onClick={connectProvider}>
                  {language.t("command.provider.connect")}
                </Button>
                <Button size="large" variant="ghost" onClick={() => setStore("gettingStartedDismissed", true)}>
                  Not yet
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div class="relative bg-background-base flex-1 min-h-0 min-w-0 flex flex-col select-none [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text">
      <Titlebar />
      <div class="flex-1 min-h-0 min-w-0 flex">
        <div class="flex-1 min-h-0 relative">
          <div class="size-full relative overflow-x-hidden">
            <nav
              aria-label={language.t("sidebar.nav.projectsAndSessions")}
              data-component="sidebar-nav-desktop"
              classList={{
                "hidden xl:block": true,
                "absolute inset-y-0 left-0": true,
                "z-10": true,
              }}
              style={{ width: `${Math.max(layout.sidebar.width(), 244)}px` }}
              ref={(el) => {
                setState("nav", el)
              }}
              onMouseEnter={() => {
                disarm()
              }}
              onMouseLeave={() => {
                aim.reset()
                arm()
              }}
            >
              <div class="@container w-full h-full contain-strict">
                <SidebarContent
                  opened={() => layout.sidebar.opened()}
                  aimMove={aim.move}
                  workspaces={() => workspaceList()}
                  renderWorkspace={(w) => (
                    <SortableWorkspaceTile
                      workspace={w}
                      selected={() => store.activeWorkspaceId === w.id}
                      overlay={() => !layout.sidebar.opened()}
                      onSelect={() => selectWorkspace(w)}
                      onDelete={() => showDeleteSidebarWorkspaceDialog(w)}
                    />
                  )}
                  handleDragStart={handleWorkspaceRailDragStart}
                  handleDragEnd={handleWorkspaceRailDragEnd}
                  handleDragOver={handleWorkspaceRailDragOver}
                  addWorkspaceLabel={language.t("command.workspace.new")}
                  addWorkspaceKeybind={() => command.keybind("project.open")}
                  onAddWorkspace={addWorkspace}
                  renderWorkspaceOverlay={() => (
                    <WorkspaceRailDragOverlay
                      workspaces={() => workspaceList()}
                      activeWorkspace={() => store.activeWorkspace}
                    />
                  )}
                  settingsLabel={() => language.t("sidebar.settings")}
                  settingsKeybind={() => command.keybind("settings.open")}
                  onOpenSettings={openSettings}
                  helpLabel={() => language.t("sidebar.help")}
                  onOpenHelp={() => platform.openLink("https://opencode.ai/desktop-feedback")}
                  renderPanel={() => (
                    <Show when={selectedWorkspace()} keyed>
                      {(w) => <SidebarPanel workspace={w} merged />}
                    </Show>
                  )}
                />
              </div>
              <Show when={layout.sidebar.opened()}>
                <div onPointerDown={() => setSizing(true)}>
                  <ResizeHandle
                    direction="horizontal"
                    size={layout.sidebar.width()}
                    min={244}
                    max={typeof window === "undefined" ? 1000 : window.innerWidth * 0.3 + 64}
                    collapseThreshold={244}
                    onResize={(w) => {
                      setSizing(true)
                      if (sizet !== undefined) clearTimeout(sizet)
                      sizet = window.setTimeout(() => setSizing(false), 120)
                      layout.sidebar.resize(w)
                    }}
                    onCollapse={layout.sidebar.close}
                  />
                </div>
              </Show>
            </nav>

            <div
              class="hidden xl:block pointer-events-none absolute top-0 right-0 z-0 border-t border-border-weaker-base"
              style={{ left: "calc(4rem + 12px)" }}
            />

            <div class="xl:hidden">
              <div
                classList={{
                  "fixed inset-x-0 top-10 bottom-0 z-40 transition-opacity duration-200": true,
                  "opacity-100 pointer-events-auto": layout.mobileSidebar.opened(),
                  "opacity-0 pointer-events-none": !layout.mobileSidebar.opened(),
                }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) layout.mobileSidebar.hide()
                }}
              />
              <nav
                aria-label={language.t("sidebar.nav.projectsAndSessions")}
                data-component="sidebar-nav-mobile"
                classList={{
                  "fixed top-10 bottom-0 left-0 z-50 overflow-hidden border-r border-border-weaker-base bg-background-base transition-transform duration-200 ease-out": true,
                  "w-[min(100%,400px)]": true,
                  "translate-x-0": layout.mobileSidebar.opened(),
                  "-translate-x-full": !layout.mobileSidebar.opened(),
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div class="@container w-full h-full contain-strict min-w-0">
                  <SidebarContent
                    mobile
                    opened={() => layout.sidebar.opened()}
                    aimMove={aim.move}
                    workspaces={() => workspaceList()}
                    renderWorkspace={(w) => (
                      <SortableWorkspaceTile
                        workspace={w}
                        mobile
                        selected={() => store.activeWorkspaceId === w.id}
                        overlay={() => !layout.sidebar.opened()}
                        onSelect={() => selectWorkspace(w)}
                      />
                    )}
                    handleDragStart={handleWorkspaceRailDragStart}
                    handleDragEnd={handleWorkspaceRailDragEnd}
                    handleDragOver={handleWorkspaceRailDragOver}
                    addWorkspaceLabel={language.t("command.workspace.new")}
                    addWorkspaceKeybind={() => command.keybind("project.open")}
                    onAddWorkspace={addWorkspace}
                    renderWorkspaceOverlay={() => (
                      <WorkspaceRailDragOverlay
                        workspaces={() => workspaceList()}
                        activeWorkspace={() => store.activeWorkspace}
                      />
                    )}
                    settingsLabel={() => language.t("sidebar.settings")}
                    settingsKeybind={() => command.keybind("settings.open")}
                    onOpenSettings={openSettings}
                    helpLabel={() => language.t("sidebar.help")}
                    onOpenHelp={() => platform.openLink("https://opencode.ai/desktop-feedback")}
                    renderPanel={() => (
                      <Show when={selectedWorkspace()} keyed>
                        {(w) => <SidebarPanel workspace={w} mobile />}
                      </Show>
                    )}
                  />
                </div>
              </nav>
            </div>

            <div
              classList={{
                "absolute inset-0 flex flex-col": true,
                "xl:inset-y-0 xl:right-0 xl:left-[var(--main-left)]": true,
                "z-20": true,
                "transition-[left] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[left] motion-reduce:transition-none":
                  !sizing(),
              }}
              style={{
                "--main-left": layout.sidebar.opened() ? `${Math.max(layout.sidebar.width(), 244)}px` : "4rem",
              }}
            >
              <div
                classList={{
                  "block shrink-0 overflow-hidden transition-[height,max-height] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none xl:rounded-tl-[12px] border-t xl:border-l border-border-weak-base": true,
                  "h-9 max-h-9": (!isXl() || !layout.sidebar.opened()) && !contextBarExpanded(),
                  "h-[56px] max-h-[56px]": (!isXl() || !layout.sidebar.opened()) && contextBarExpanded(),
                  "h-0 max-h-0": isXl() && layout.sidebar.opened(),
                }}
              >
                <div
                  classList={{
                    "flex min-h-9 h-9 min-w-0 w-fit flex-col items-start justify-center gap-0.5 overflow-hidden px-4 py-1.5 transition-[height] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none bg-background-base border-0 xl:rounded-tl-[12px] cursor-pointer": true,
                    "h-[56px] justify-start": contextBarExpanded(),
                  }}
                  onClick={() =>
                    (window.matchMedia("(min-width: 1280px)").matches ? layout.sidebar : layout.mobileSidebar).toggle()
                  }
                  onMouseEnter={() => {
                    if (contextBarExpandTimeout.current !== undefined) clearTimeout(contextBarExpandTimeout.current)
                    contextBarExpandTimeout.current = window.setTimeout(() => {
                      contextBarExpandTimeout.current = undefined
                      setContextBarExpanded(true)
                    }, 800)
                  }}
                  onMouseLeave={() => {
                    if (contextBarExpandTimeout.current !== undefined) {
                      clearTimeout(contextBarExpandTimeout.current)
                      contextBarExpandTimeout.current = undefined
                    }
                    setContextBarExpanded(false)
                  }}
                >
                  <div
                    classList={{
                      "flex min-h-0 shrink-0 items-center overflow-hidden transition-[max-height] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none": true,
                      "max-h-0": !contextBarExpanded(),
                      "max-h-4": contextBarExpanded(),
                    }}
                  >
                    <span class="text-[10px] font-medium uppercase tracking-wide text-text-weak">
                      {language.t("sidebar.context.workspace")} / {language.t("sidebar.context.project")}
                    </span>
                  </div>
                  <div class="flex min-w-0 w-fit items-center gap-1.5 overflow-hidden">
                    <span class="truncate text-14-medium text-text-weak">{selectedWorkspace()?.name ?? "—"}</span>
                    <Show when={contextBarProjectName()}>
                      {(name) => (
                        <>
                          <span class="shrink-0 text-14-medium text-text-weak">/</span>
                          <span class="truncate text-14-medium text-text-strong">{name()}</span>
                        </>
                      )}
                    </Show>
                  </div>
                </div>
              </div>
              <main
                classList={{
                  "flex-1 min-h-0 overflow-x-hidden flex flex-col items-start contain-strict border-t border-border-weak-base bg-background-base xl:border-l xl:rounded-tl-[12px]": true,
                }}
              >
                <Show when={!autoselecting()} fallback={<div class="size-full" />}>
                  <Show
                    when={hasWorkspaceProjects()}
                    fallback={
                      <div class="size-full flex flex-col items-center justify-center gap-6 px-4">
                        <div class="flex flex-col gap-2 text-center max-w-sm">
                          <div class="text-14-medium text-text-strong">{language.t("workspace.empty.title")}</div>
                          <div
                            class="text-14-regular text-text-weak"
                            style={{ "line-height": "var(--line-height-normal)" }}
                          >
                            {language.t("workspace.empty.description")}
                          </div>
                        </div>
                        <Show when={selectedWorkspace()} keyed>
                          {(ws) => (
                            <Button size="large" icon="plus-small" onClick={() => addProject(ws.id)}>
                              {language.t("command.project.add")}
                            </Button>
                          )}
                        </Show>
                      </div>
                    }
                  >
                    {props.children}
                  </Show>
                </Show>
              </main>
            </div>
          </div>
        </div>
      </div>
      <Toast.Region />
    </div>
  )
}
