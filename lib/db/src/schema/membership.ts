import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const membershipTable = pgTable("haas_membership", {
  id: integer("id").primaryKey(),
  year: integer("year").notNull(),
  registrationUrl: text("registration_url").notNull(),
  description: text("description").notNull(),
  calendarPolicy: text("calendar_policy").notNull(),
  chequePolicy: text("cheque_policy").notNull(),
  discountPolicy: text("discount_policy").notNull(),
  refundPolicy: text("refund_policy").notNull(),
});
export const insertMembershipSchema = createInsertSchema(membershipTable);
export type InsertMembership = z.infer<typeof insertMembershipSchema>;
