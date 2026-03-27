import { sqliteTable, text } from "drizzle-orm/sqlite-core"
import { ProductTable } from "../product/product.sql"
import type { PermissionNext } from "./next"
import { Timestamps } from "../storage/schema.sql"

export const PermissionTable = sqliteTable("permission", {
  product_id: text()
    .primaryKey()
    .references(() => ProductTable.id, { onDelete: "cascade" }),
  ...Timestamps,
  data: text({ mode: "json" }).notNull().$type<PermissionNext.Ruleset>(),
})
