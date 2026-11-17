import { format } from "date-fns";
import type { CommunityEvent } from "@workspace/api-client-react";

/** Parse a YYYY-MM-DD calendar day as a LOCAL date (never via UTC). */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(0);
  // The multi-argument Date constructor remaps years 0–99 to 1900–1999.
  // Set all components together so leap days in year 0000 also survive.
  date.setFullYear(y, (m || 1) - 1, d || 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function toDay(date: Date): string {
  // Extended Gregorian years include 0000; yyyy is year-of-era (0001 BC).
  return format(date, "uuuu-MM-dd");
}

export function todayDay(): string {
  return toDay(new Date());
}

export function splitEvents(events: CommunityEvent[] | undefined) {
  const today = todayDay();
  const all = [...(events ?? [])];
  const upcoming = all.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = all.filter((e) => e.date < today).sort((a, b) => b.date.localeCompare(a.date));
  return { upcoming, past };
}

export const CATEGORY_STYLE: Record<string, { dot: string; chip: string; label: string }> = {
  Spiritual: { dot: "bg-accent", chip: "bg-accent/20 text-foreground border-accent/50", label: "Spiritual" },
  Community: { dot: "bg-secondary", chip: "bg-secondary/10 text-secondary border-secondary/30", label: "Community" },
  Cultural: { dot: "bg-primary", chip: "bg-primary/10 text-primary border-primary/30", label: "Cultural" },
};

export const CONTACT_EMAIL = "ourhaas@gmail.com";

export function initials(name: string) {
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}
