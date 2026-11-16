import { integer, pgTable, serial, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const committeeTable = pgTable("haas_committee", {
  id: serial("id").primaryKey(),
  role: text("role").notNull().unique(),
  name: text("name").notNull(),
  position: integer("position").notNull(),
});
export const insertCommitteeSchema = createInsertSchema(committeeTable).omit({ id: true });
export type InsertCommitteeMember = z.infer<typeof insertCommitteeSchema>;
