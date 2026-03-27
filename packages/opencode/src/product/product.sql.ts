import { sqliteTable, text } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../storage/schema.sql"

export const ProductTable = sqliteTable("product", {
  id: text().primaryKey(),
  name: text().notNull(),
  directory: text().notNull(),
  git_root: text(),
  ...Timestamps,
})
