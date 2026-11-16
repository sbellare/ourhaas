import { z } from "zod";
import { CreateEventBody } from "@workspace/api-zod";

export const eventFormSchema = CreateEventBody.extend({
  // Form controls always supply a string; the API also permits omission.
  zeffyUrl: z.string().trim().max(2000).regex(/^(https:\/\/(www\.)?zeffy\.com\/[^\s]*)?$/, "Use a full HTTPS Zeffy form link, or leave this blank."),
});

export type EventFormValues = z.infer<typeof eventFormSchema>;
