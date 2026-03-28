import type { Agent, PermissionRequest, QuestionRequest } from "@opencode-ai/sdk/v2/client"

function sessionTreeRequest<T>(
  _session: Agent[],
  request: Record<string, T[] | undefined>,
  sessionID?: string,
  include: (item: T) => boolean = () => true,
) {
  if (!sessionID) return

  // parentID removed from Agent type — just check the current session
  return request[sessionID]?.find(include)
}

export function sessionPermissionRequest(
  session: Agent[],
  request: Record<string, PermissionRequest[] | undefined>,
  sessionID?: string,
  include?: (item: PermissionRequest) => boolean,
) {
  return sessionTreeRequest(session, request, sessionID, include)
}

export function sessionQuestionRequest(
  session: Agent[],
  request: Record<string, QuestionRequest[] | undefined>,
  sessionID?: string,
  include?: (item: QuestionRequest) => boolean,
) {
  return sessionTreeRequest(session, request, sessionID, include)
}
