import { sqliteTable, text, index } from "drizzle-orm/sqlite-core"
import { AgentTable } from "./agent.sql"
import { Timestamps } from "../storage/schema.sql"

export const MessageTable = sqliteTable(
  "message",
  {
    id: text().primaryKey(),
    agent_id: text()
      .notNull()
      .references(() => AgentTable.id, { onDelete: "cascade" }),
    ...Timestamps,
    data: text({ mode: "json" }).notNull(),
  },
  (table) => [index("message_agent_idx").on(table.agent_id)],
)
