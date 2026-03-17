import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

export const SessionCanvasTable = sqliteTable("session_canvas", {
  session_id: text("session_id").primaryKey(),
  state: text("state").notNull(),
  updated_at: integer("updated_at").notNull(),
})
