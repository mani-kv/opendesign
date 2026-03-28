import { sqliteTable, text, index } from "drizzle-orm/sqlite-core"
import { FeatureTable } from "../feature/feature.sql"
import { Timestamps } from "../storage/schema.sql"

export const AgentTable = sqliteTable("agent", {
  id: text().primaryKey(),
  feature_id: text().notNull().references(() => FeatureTable.id, { onDelete: "cascade" }),
  annotation_id: text(),
  branch: text(),
  status: text().notNull().default("working"),
  color: text(),
  title: text().notNull(),
  directory: text().notNull(),
  version: text().notNull(),
  permission: text({ mode: "json" }),
  ...Timestamps,
}, (table) => [
  index("agent_feature_idx").on(table.feature_id),
  index("agent_annotation_idx").on(table.annotation_id),
])
