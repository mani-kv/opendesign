import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core"
import { FeatureTable } from "../feature/feature.sql"
import { Timestamps } from "../storage/schema.sql"

export const AnnotationTable = sqliteTable(
  "annotation",
  {
    id: text().primaryKey(),
    feature_id: text()
      .notNull()
      .references(() => FeatureTable.id, { onDelete: "cascade" }),
    component_node_id: text(),
    component_name: text(),
    prompt: text().notNull(),
    ds_slider: real().notNull().default(0.5),
    variation_count: integer().notNull().default(4),
    enrichments: text({ mode: "json" }),
    ...Timestamps,
  },
  (table) => [index("annotation_feature_idx").on(table.feature_id)],
)
