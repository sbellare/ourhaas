import { z } from "zod";
import {
  CreateEventBody as GeneratedCreateEventBody,
  UpdateEventBody as GeneratedUpdateEventBody,
  createEventBodyTitleMax,
  createEventBodyDateRegExp,
  createEventBodyZeffyUrlMax,
  createEventBodyZeffyUrlRegExp,
} from "./generated/api";

// Keep semantic input checks outside generated files so codegen cannot erase
// them. The public request schemas below are used by both the form and router.
const eventFields = {
  zeffyUrl: z.string().trim().max(createEventBodyZeffyUrlMax)
    .regex(createEventBodyZeffyUrlRegExp, "Use a full HTTPS Zeffy form link, or leave this blank.")
    .optional(),
  title: z.string().trim().min(1, "Title is required").max(createEventBodyTitleMax),
  date: z.string().regex(createEventBodyDateRegExp, "Pick a date").refine((value) => {
    if (value.length !== 10 || !createEventBodyDateRegExp.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    // Gregorian calendar arithmetic avoids Date rollover, timezone offsets,
    // and JavaScript's special treatment of years 00–99.
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
  }, "Pick a valid calendar date"),
};

export const CreateEventBody = GeneratedCreateEventBody.extend(eventFields);
export const UpdateEventBody = GeneratedUpdateEventBody.extend(eventFields);
