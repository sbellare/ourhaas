import { useMemo, useState } from "react";
import { addMonths, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek, eachDayOfInterval, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight, LayoutList, CalendarDays } from "lucide-react";
import { useListEvents, getListEventsQueryKey, type CommunityEvent } from "@workspace/api-client-react";
import { PageHero } from "@/components/site-layout";
import { EventDialog, EventRow, EventSkeleton, LoadError, UpcomingEmpty } from "@/components/event-bits";
import { CATEGORY_STYLE, parseDay, splitEvents, toDay, todayDay } from "@/lib/haas";

function MonthGrid({ events, onOpen }: { events: CommunityEvent[]; onOpen: (e: CommunityEvent) => void }) {
  const initial = useMemo(() => {
    const { upcoming, past } = splitEvents(events);
    const pick = upcoming[0] ?? past[0];
    return pick ? parseDay(pick.date) : new Date();
  }, [events]);
  const [month, setMonth] = useState(startOfMonth(initial));
  const byDay = useMemo(() => {
    const m = new Map<string, CommunityEvent[]>();
    events.forEach((e) => m.set(e.date, [...(m.get(e.date) ?? []), e]));
    return m;
  }, [events]);
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month)), end: endOfWeek(endOfMonth(month)) });
  const today = todayDay();

  return (
    <div className="overflow-hidden rounded-3xl border border-card-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <button type="button" onClick={() => setMonth((m) => subMonths(m, 1))} className="rounded-full p-2 hover:bg-muted" aria-label="Previous month" data-testid="button-prev-month"><ChevronLeft className="h-5 w-5" /></button>
        <p className="font-display text-2xl font-semibold" data-testid="text-month">{format(month, "MMMM yyyy")}</p>
        <button type="button" onClick={() => setMonth((m) => addMonths(m, 1))} className="rounded-full p-2 hover:bg-muted" aria-label="Next month" data-testid="button-next-month"><ChevronRight className="h-5 w-5" /></button>
      </div>
      <div className="grid grid-cols-7 border-b border-border bg-muted/50 text-center font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const key = toDay(d);
          const list = byDay.get(key) ?? [];
          return (
            <div key={key} className={`min-h-20 border-b border-r border-border/60 p-1.5 md:min-h-28 md:p-2 ${isSameMonth(d, month) ? "" : "bg-muted/30 text-muted-foreground/50"}`}>
              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${key === today ? "bg-primary text-primary-foreground" : ""}`}>{format(d, "d")}</span>
              <div className="mt-1 space-y-1">
                {list.map((e) => (
                  <button key={e.id} type="button" onClick={() => onOpen(e)} data-testid={`button-cal-event-${e.id}`} className={`flex w-full items-center gap-1 truncate rounded-md px-1.5 py-1 text-left text-[11px] font-medium transition hover:scale-[1.03] ${key < today ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${CATEGORY_STYLE[e.category]?.dot ?? "bg-primary"}`} />
                    <span className="truncate">{e.title}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Events() {
  const events = useListEvents({ query: { queryKey: getListEventsQueryKey(), refetchInterval: 30000 } });
  const [view, setView] = useState<"list" | "calendar">("list");
  const [open, setOpen] = useState<CommunityEvent | null>(null);
  const { upcoming, past } = splitEvents(events.data);

  return (
    <>
      <PageHero eyebrow="Events" title={<>Bhajans, festivals<br />and <em className="font-normal text-primary">gatherings</em></>}>
        Bhajan details come through Evite and the Our HAAS WhatsApp group. Tap any event for details.
      </PageHero>
      <div className="mx-auto max-w-7xl px-5 pt-10">
        <div className="inline-flex rounded-full border border-border bg-card p-1" role="tablist">
          {([["list", "List", LayoutList], ["calendar", "Calendar", CalendarDays]] as const).map(([v, label, Icon]) => (
            <button key={v} type="button" onClick={() => setView(v)} data-testid={`button-view-${v}`} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${view === v ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>
        <div className="mt-8">
          {events.isLoading ? <EventSkeleton /> : events.isError ? <LoadError what="events" onRetry={() => events.refetch()} /> : view === "calendar" ? (
            <MonthGrid events={events.data ?? []} onOpen={setOpen} />
          ) : (
            <div className="space-y-16">
              <section>
                <h2 className="font-display text-3xl font-semibold">Upcoming</h2>
                <div className="mt-5 space-y-3">{upcoming.length === 0 ? <UpcomingEmpty /> : upcoming.map((e) => <EventRow key={e.id} event={e} onOpen={setOpen} />)}</div>
              </section>
              <section>
                <h2 className="font-display text-3xl font-semibold">Past events</h2>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {past.length === 0 ? <p className="text-muted-foreground">No past events recorded yet.</p> : past.map((e) => <EventRow key={e.id} event={e} past onOpen={setOpen} />)}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
      <EventDialog event={open} onClose={() => setOpen(null)} />
    </>
  );
}
