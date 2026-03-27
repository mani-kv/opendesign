import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../storage/schema.sql"

export const DesignSystemTable = sqliteTable("design_system", {
  id: text().primaryKey(),
  name: text().notNull(),
  figma_file_key: text(),
  figma_file_name: text(),
  tokens: text({ mode: "json" }),
  components: text({ mode: "json" }),
  styles: text({ mode: "json" }),
  last_synced_at: integer(),
  ...Timestamps,
})
