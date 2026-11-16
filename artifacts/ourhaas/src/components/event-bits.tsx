import { format } from "date-fns";
import { ArrowUpRight, Clock, MapPin } from "lucide-react";
import type { CommunityEvent } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CATEGORY_STYLE, CONTACT_EMAIL, parseDay } from "@/lib/haas";

export function CategoryChip({ category }: { category: string }) {
  const s = CATEGORY_STYLE[category] ?? CATEGORY_STYLE.Community;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] ${s.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function DateBlock({ date, muted }: { date: string; muted?: boolean }) {
  const d = parseDay(date);
  return (
    <div className={`flex w-20 shrink-0 flex-col items-center rounded-2xl border py-3 ${muted ? "border-border bg-muted/60 text-muted-foreground" : "border-primary/30 bg-primary text-primary-foreground"}`}>
      <span className="font-mono text-[10px] uppercase tracking-[0.2em]">{format(d, "MMM")}</span>
      <span className="font-display text-4xl font-semibold leading-none">{format(d, "d")}</span>
      <span className="font-mono text-[10px] opacity-80">{format(d, "yyyy")}</span>
    </div>
  );
}

export function EventRow({ event, past, onOpen }: { event: CommunityEvent; past?: boolean; onOpen: (e: CommunityEvent) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      data-testid={`card-event-${event.id}`}
      className="group flex w-full items-start gap-5 rounded-3xl border border-card-border bg-card p-4 text-left transition duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_18px_40px_-24px_hsl(var(--secondary)/.5)] md:p-5"
    >
      <DateBlock date={event.date} muted={past} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <CategoryChip category={event.category} />
          {past && <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Past</span>}
          {event.zeffyUrl && <span className="text-xs font-medium text-primary">Zeffy registration available</span>}
        </div>
        <h3 className="font-display mt-2 text-2xl font-semibold leading-tight transition-colors group-hover:text-primary">{event.title}</h3>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
          {event.time && <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{event.time}</span>}
          {event.location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{event.location}</span>}
        </div>
      </div>
    </button>
  );
}

export function EventDialog({ event, onClose }: { event: CommunityEvent | null; onClose: () => void }) {
  return (
    <Dialog open={!!event} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto rounded-3xl border-card-border bg-card">
        {event && (
          <>
            <DialogHeader>
              <div className="mb-2"><CategoryChip category={event.category} /></div>
              <DialogTitle className="font-display text-3xl font-semibold leading-tight" data-testid="text-event-title">{event.title}</DialogTitle>
              <DialogDescription className="font-mono text-xs uppercase tracking-[0.15em] text-primary">
                {format(parseDay(event.date), "EEEE, MMMM d, yyyy")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              {event.time && <p className="flex items-center gap-2"><Clock className="h-4 w-4 text-primary" />{event.time}</p>}
              {event.location && <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />{event.location}</p>}
              {event.description && <p className="whitespace-pre-line leading-relaxed text-foreground/85">{event.description}</p>}
              {event.zeffyUrl && (
                <section aria-label="Event registration" className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
                  <h3 className="font-display text-xl font-semibold">Event registration</h3>
                  <p className="mt-2 text-muted-foreground">Payment and registration are handled securely on Zeffy. Opens in a new tab.</p>
                  <a href={event.zeffyUrl} target="_blank" rel="noopener noreferrer" data-testid="link-event-zeffy" className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-center font-semibold text-primary-foreground hover:bg-primary/90">
                    Pay / Register with Zeffy <ArrowUpRight aria-hidden className="h-4 w-4 shrink-0" />
                  </a>
                </section>
              )}
              <p className="rounded-2xl bg-muted p-3 text-muted-foreground">
                Details are shared through Evite and the Our HAAS WhatsApp group. Questions? Write to{" "}
                <a className="text-primary underline" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(event.title)}`}>{CONTACT_EMAIL}</a>.
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function EventSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex animate-pulse gap-5 rounded-3xl border border-card-border bg-card p-5">
          <div className="h-24 w-20 rounded-2xl bg-muted" />
          <div className="flex-1 space-y-3 py-2"><div className="h-3 w-24 rounded bg-muted" /><div className="h-6 w-2/3 rounded bg-muted" /><div className="h-3 w-1/2 rounded bg-muted" /></div>
        </div>
      ))}
    </div>
  );
}

export function UpcomingEmpty() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-dashed border-primary/40 bg-card p-8 md:p-10" data-testid="empty-upcoming">
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/20" aria-hidden />
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">The lamp is lit, the calendar is open</p>
      <h3 className="font-display mt-3 text-3xl font-semibold">Next gatherings are being planned.</h3>
      <p className="mt-3 max-w-xl text-muted-foreground">
        New dates appear here as soon as the committee confirms them. Bhajan details are shared via Evite and the Our HAAS WhatsApp group. For anything else, contact the coordinator at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">{CONTACT_EMAIL}</a>.
      </p>
    </div>
  );
}

export function LoadError({ onRetry, what }: { onRetry: () => void; what: string }) {
  return (
    <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-6">
      <p className="font-display text-xl">We couldn't load {what}.</p>
      <button type="button" onClick={onRetry} data-testid="button-retry" className="mt-3 rounded-full bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground">Try again</button>
    </div>
  );
}
