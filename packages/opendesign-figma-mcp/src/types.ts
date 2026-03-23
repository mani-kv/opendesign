export interface CommandSender {
  sendCommand(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<unknown>
}
