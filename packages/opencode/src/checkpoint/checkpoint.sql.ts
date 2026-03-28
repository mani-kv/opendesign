import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { FeatureTable } from "../feature/feature.sql"
import { VariationTable } from "../variation/variation.sql"

export const CheckpointTable = sqliteTable(
  "checkpoint",
  {
    id: text().primaryKey(),
    feature_id: text()
      .notNull()
      .references(() => FeatureTable.id, { onDelete: "cascade" }),
    parent_id: text(),
    variation_id: text().references(() => VariationTable.id, { onDelete: "set null" }),
    label: text().notNull(),
    git_ref: text().notNull(),
    time_created: integer().notNull(),
  },
  (table) => [index("checkpoint_feature_idx").on(table.feature_id)],
)
