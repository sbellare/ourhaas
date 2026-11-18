import { pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pageOverridesTable = pgTable("haas_page_overrides", {
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  markdown: text("markdown").notNull(),
});
export const insertPageOverrideSchema = createInsertSchema(pageOverridesTable);
export type InsertPageOverride = z.infer<typeof insertPageOverrideSchema>;
