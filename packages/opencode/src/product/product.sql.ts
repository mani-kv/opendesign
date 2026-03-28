import { sqliteTable, text } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../storage/schema.sql"

export const ProductTable = sqliteTable("product", {
  id: text().primaryKey(),
  name: text().notNull(),
  directory: text().notNull(),
  worktree: text().notNull(),
  git_root: text(),
  icon: text({ mode: "json" }),
  commands: text({ mode: "json" }),
  sandboxes: text({ mode: "json" }),
  ...Timestamps,
})
