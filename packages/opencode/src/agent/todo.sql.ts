import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core"
import { AgentTable } from "./agent.sql"
import { Timestamps } from "../storage/schema.sql"

export const TodoTable = sqliteTable(
  "todo",
  {
    agent_id: text()
      .notNull()
      .references(() => AgentTable.id, { onDelete: "cascade" }),
    content: text().notNull(),
    status: text().notNull(),
    priority: text().notNull(),
    position: integer().notNull(),
    ...Timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.agent_id, table.position] }),
    index("todo_agent_idx").on(table.agent_id),
  ],
)
