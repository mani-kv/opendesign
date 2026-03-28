import { sqliteTable, text, index } from "drizzle-orm/sqlite-core"
import { ProductTable } from "../product/product.sql"
import { Timestamps } from "../storage/schema.sql"

export const FeatureTable = sqliteTable(
  "feature",
  {
    id: text().primaryKey(),
    product_id: text()
      .notNull()
      .references(() => ProductTable.id, { onDelete: "cascade" }),
    name: text().notNull(),
    branch: text().notNull(),
    status: text().notNull().default("active"),
    figma_url: text(),
    canvas_state: text({ mode: "json" }),
    ...Timestamps,
  },
  (table) => [index("feature_product_idx").on(table.product_id)],
)
