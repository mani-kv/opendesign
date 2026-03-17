import { Database, eq } from "../storage/db"
import { SessionCanvasTable } from "./session-canvas.sql"

export namespace SessionCanvas {
  export function get(sessionID: string): string | undefined {
    const row = Database.use((db) =>
      db.select().from(SessionCanvasTable).where(eq(SessionCanvasTable.session_id, sessionID)).get(),
    )
    return row?.state
  }

  export function put(sessionID: string, state: string): void {
    Database.use((db) =>
      db
        .insert(SessionCanvasTable)
        .values({
          session_id: sessionID,
          state,
          updated_at: Date.now(),
        })
        .onConflictDoUpdate({
          target: SessionCanvasTable.session_id,
          set: {
            state,
            updated_at: Date.now(),
          },
        })
        .run(),
    )
  }
}
