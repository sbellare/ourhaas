import { date, pgTable, serial, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const eventsTable = pgTable("haas_events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  time: text("time").notNull().default(""),
  location: text("location").notNull().default(""),
  description: text("description").notNull().default(""),
  category: text("category").notNull(),
});
export const insertEventSchema = createInsertSchema(eventsTable).omit({ id: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof eventsTable.$inferSelect;

export const setupTable = pgTable("haas_setup", {
  key: text("key").primaryKey(),
});
