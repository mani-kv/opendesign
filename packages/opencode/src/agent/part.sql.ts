import { sqliteTable, text, index } from "drizzle-orm/sqlite-core"
import { MessageTable } from "./message.sql"
import { Timestamps } from "../storage/schema.sql"

export const PartTable = sqliteTable("part", {
  id: text().primaryKey(),
  message_id: text().notNull().references(() => MessageTable.id, { onDelete: "cascade" }),
  agent_id: text().notNull(),
  ...Timestamps,
  data: text({ mode: "json" }).notNull(),
}, (table) => [
  index("part_message_idx").on(table.message_id),
  index("part_agent_idx").on(table.agent_id),
])
