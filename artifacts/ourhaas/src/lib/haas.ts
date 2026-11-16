import { format } from "date-fns";
import type { CommunityEvent } from "@workspace/api-client-react";

/** Parse a YYYY-MM-DD calendar day as a LOCAL date (never via UTC). */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function toDay(date: Date): string {
  return format(date, "yyyy-MM-dd");
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
export const ZEFFY_URL = "https://www.zeffy.com/en-US/ticketing/haas-2026-membership";

export const COMMITTEE = [
  { role: "President", name: "Mahesh Nagarkatti" },
  { role: "Vice President", name: "Sachin Bellare" },
  { role: "Secretary", name: "Keerthi Shenoy" },
  { role: "Treasurer", name: "Prateek Karkal" },
  { role: "Events", name: "Mahesh Sashital" },
  { role: "Food", name: "Arundhati Bijoor" },
];

export function initials(name: string) {
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}
