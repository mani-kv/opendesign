import { useParams } from "@solidjs/router"
import { useWorkspace } from "@/context/workspace"

export default function ProjectPage() {
  const params = useParams()
  const workspace = useWorkspace()
  const project = () => (params.projectId ? workspace.projects.get(params.projectId) : undefined)

  return (
    <div class="flex size-full flex-col items-center justify-center gap-4 bg-background-base p-8">
      <div class="text-14-regular text-text-weak">
        {project() ? `Project: ${project()?.name}` : "Project not found"}
      </div>
      <div class="text-12-regular text-text-weak">Canvas coming soon</div>
    </div>
  )
}
