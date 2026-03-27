import { base64Decode } from "@opencode-ai/util/encode"

export function decode64(value: string | undefined) {
  if (value === undefined) return
  try {
    const decoded = base64Decode(value)
    if (!decoded.startsWith("/")) return
    return decoded
  } catch {
    return
  }
}
