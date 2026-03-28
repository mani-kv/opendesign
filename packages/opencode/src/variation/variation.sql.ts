import { sqliteTable, text, index } from "drizzle-orm/sqlite-core"
import { AgentTable } from "../agent/agent.sql"
import { AnnotationTable } from "../annotation/annotation.sql"
import { Timestamps } from "../storage/schema.sql"

export const VariationTable = sqliteTable(
  "variation",
  {
    id: text().primaryKey(),
    agent_id: text()
      .notNull()
      .references(() => AgentTable.id, { onDelete: "cascade" }),
    annotation_id: text()
      .notNull()
      .references(() => AnnotationTable.id, { onDelete: "cascade" }),
    label: text(),
    rationale: text(),
    branch_path: text(),
    status: text().notNull().default("pending"),
    ...Timestamps,
  },
  (table) => [
    index("variation_agent_idx").on(table.agent_id),
    index("variation_annotation_idx").on(table.annotation_id),
  ],
)
