import { sqliteTable, text, primaryKey } from "drizzle-orm/sqlite-core"
import { ProductTable } from "../product/product.sql"
import { DesignSystemTable } from "./design-system.sql"

export const ProductDesignSystemTable = sqliteTable(
  "product_design_system",
  {
    product_id: text()
      .notNull()
      .references(() => ProductTable.id, { onDelete: "cascade" }),
    design_system_id: text()
      .notNull()
      .references(() => DesignSystemTable.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.product_id, table.design_system_id] })],
)
