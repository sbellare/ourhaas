import { z } from "zod";
import { CreateEventBody } from "@workspace/api-zod";

export const eventFormSchema = CreateEventBody.extend({
  // Form controls always supply a string; the API also permits omission.
  zeffyUrl: CreateEventBody.shape.zeffyUrl.unwrap(),
});

export type EventFormValues = z.infer<typeof eventFormSchema>;
