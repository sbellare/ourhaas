import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarIcon, Pencil, Plus, ShieldAlert, Trash2, LogIn } from "lucide-react";
import {
  useCreateEvent, useDeleteEvent, useGetAdminStatus, useListEvents, useUpdateEvent,
  getGetAdminStatusQueryKey, getListEventsQueryKey, type CommunityEvent,
} from "@workspace/api-client-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { CategoryChip, DateBlock, EventSkeleton, LoadError } from "@/components/event-bits";
import { parseDay, splitEvents, toDay } from "@/lib/haas";
import { CommitteeEditor } from "@/components/committee-editor";
import { MembershipEditor } from "@/components/membership-editor";

const schema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  time: z.string().max(100),
  location: z.string().max(300),
  description: z.string().max(5000),
  category: z.enum(["Spiritual", "Community", "Cultural"]),
});
type FormValues = z.infer<typeof schema>;
const blank: FormValues = { title: "", date: "", time: "", location: "", description: "", category: "Spiritual" };

function EventForm({ initial, onDone }: { initial: CommunityEvent | null; onDone: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const create = useCreateEvent();
  const update = useUpdateEvent();
  const [pickerOpen, setPickerOpen] = useState(false);
  // Initialize before Radix Select mounts. Resetting after mount makes its
  // native form control emit an empty value and clears the saved category.
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: initial ? {
      title: initial.title, date: initial.date, time: initial.time,
      location: initial.location, description: initial.description, category: initial.category,
    } : blank,
  });

  const pending = create.isPending || update.isPending;
  const submit = (v: FormValues) => {
    const opts = {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListEventsQueryKey() });
        toast({ title: initial ? "Event updated" : "Event added", description: v.title });
        onDone();
      },
      onError: () => toast({ title: "Could not save", description: "Please check the fields and try again.", variant: "destructive" as const }),
    };
    if (initial) update.mutate({ id: initial.id, data: v }, opts);
    else create.mutate({ data: v }, opts);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
        <FormField control={form.control} name="title" render={({ field }) => (
          <FormItem><FormLabel>Title</FormLabel><FormControl><Input {...field} data-testid="input-title" /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="date" render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>Date</FormLabel>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <button type="button" data-testid="button-date-picker" className="flex items-center justify-between rounded-xl border-2 border-primary/40 bg-primary/5 px-4 py-3 text-left font-medium transition hover:border-primary">
                  <span className={field.value ? "" : "text-muted-foreground"}>{field.value ? format(parseDay(field.value), "EEEE, MMMM d, yyyy") : "Choose a date on the calendar"}</span>
                  <CalendarIcon className="h-5 w-5 text-primary" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto rounded-2xl p-2" align="start">
                <Calendar
                  mode="single"
                  selected={field.value ? parseDay(field.value) : undefined}
                  defaultMonth={field.value ? parseDay(field.value) : new Date()}
                  onSelect={(d) => { if (d) { field.onChange(toDay(d)); setPickerOpen(false); } }}
                />
              </PopoverContent>
            </Popover>
            <FormMessage />
          </FormItem>
        )} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField control={form.control} name="time" render={({ field }) => (
            <FormItem><FormLabel>Time</FormLabel><FormControl><Input placeholder="e.g. 6:00 PM" {...field} data-testid="input-time" /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="category" render={({ field }) => (
            <FormItem><FormLabel>Category</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger data-testid="select-category"><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="Spiritual">Spiritual</SelectItem>
                  <SelectItem value="Community">Community</SelectItem>
                  <SelectItem value="Cultural">Cultural</SelectItem>
                </SelectContent>
              </Select><FormMessage /></FormItem>
          )} />
        </div>
        <FormField control={form.control} name="location" render={({ field }) => (
          <FormItem><FormLabel>Location</FormLabel><FormControl><Input {...field} data-testid="input-location" /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="description" render={({ field }) => (
          <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea rows={4} {...field} data-testid="input-description" /></FormControl><FormMessage /></FormItem>
        )} />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onDone} className="rounded-full px-4 py-2 text-sm hover:bg-muted">Cancel</button>
          <button type="submit" disabled={pending} data-testid="button-save-event" className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {pending ? "Saving..." : initial ? "Save changes" : "Add event"}
          </button>
        </div>
      </form>
    </Form>
  );
}

function Manager() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const events = useListEvents();
  const del = useDeleteEvent();
  const [editing, setEditing] = useState<CommunityEvent | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<CommunityEvent | null>(null);
  const { upcoming, past } = splitEvents(events.data);

  const openNew = () => { setEditing(null); setFormOpen(true); };
  const Row = ({ e, isPast }: { e: CommunityEvent; isPast?: boolean }) => (
    <div className="flex items-center gap-4 rounded-3xl border border-card-border bg-card p-4" data-testid={`row-admin-event-${e.id}`}>
      <DateBlock date={e.date} muted={isPast} />
      <div className="min-w-0 flex-1">
        <CategoryChip category={e.category} />
        <p className="font-display mt-1 truncate text-xl font-semibold">{e.title}</p>
        <p className="truncate text-sm text-muted-foreground">{[e.time, e.location].filter(Boolean).join(" · ")}</p>
      </div>
      <button type="button" onClick={() => { setEditing(e); setFormOpen(true); }} className="rounded-full p-2.5 hover:bg-muted" aria-label="Edit" data-testid={`button-edit-${e.id}`}><Pencil className="h-4 w-4" /></button>
      <button type="button" onClick={() => setToDelete(e)} className="rounded-full p-2.5 text-destructive hover:bg-destructive/10" aria-label="Delete" data-testid={`button-delete-${e.id}`}><Trash2 className="h-4 w-4" /></button>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <CommitteeEditor />
      <MembershipEditor />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">Event admin</p>
          <h1 className="font-display mt-2 text-5xl font-semibold">Manage the calendar</h1>
        </div>
        <button type="button" onClick={openNew} data-testid="button-new-event" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-semibold text-primary-foreground transition hover:-translate-y-0.5"><Plus className="h-4 w-4" /> New event</button>
      </div>
      <div className="mt-10 space-y-10">
        {events.isLoading ? <EventSkeleton /> : events.isError ? <LoadError what="events" onRetry={() => events.refetch()} /> : (
          <>
            <section>
              <h2 className="font-display text-2xl font-semibold">Upcoming ({upcoming.length})</h2>
              <div className="mt-4 space-y-3">
                {upcoming.length === 0 ? (
                  <button type="button" onClick={openNew} className="w-full rounded-3xl border border-dashed border-primary/40 p-8 text-center text-muted-foreground hover:bg-primary/5">No upcoming events yet. <span className="text-primary underline">Add the next one</span></button>
                ) : upcoming.map((e) => <Row key={e.id} e={e} />)}
              </div>
            </section>
            <section>
              <h2 className="font-display text-2xl font-semibold">Past ({past.length})</h2>
              <div className="mt-4 space-y-3">{past.map((e) => <Row key={e.id} e={e} isPast />)}</div>
            </section>
          </>
        )}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto rounded-3xl">
          <DialogHeader><DialogTitle className="font-display text-3xl">{editing ? "Edit event" : "New event"}</DialogTitle></DialogHeader>
          <EventForm key={editing?.id ?? "new"} initial={editing} onDone={() => setFormOpen(false)} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl">Delete this event?</AlertDialogTitle>
            <AlertDialogDescription>"{toDelete?.title}" will be removed from the public calendar. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-delete" className="bg-destructive text-destructive-foreground" onClick={() => {
              if (!toDelete) return;
              del.mutate({ id: toDelete.id }, {
                onSuccess: () => { qc.invalidateQueries({ queryKey: getListEventsQueryKey() }); toast({ title: "Event deleted" }); },
                onError: () => toast({ title: "Could not delete", variant: "destructive" }),
              });
              setToDelete(null);
            }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-xl px-5 py-24">
      <div className="rounded-[2rem] border border-card-border bg-card p-10 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-primary" />
        <h1 className="font-display mt-4 text-3xl font-semibold" data-testid="text-admin-notice">{title}</h1>
        <div className="mt-3 text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

export default function Admin() {
  const status = useGetAdminStatus({ query: { queryKey: getGetAdminStatusQueryKey(), retry: false } });
  if (status.isLoading) return <div className="mx-auto max-w-5xl px-5 py-12"><EventSkeleton /></div>;
  if (status.isError) return <div className="mx-auto max-w-xl px-5 py-24"><LoadError what="your access status" onRetry={() => status.refetch()} /></div>;
  if (!status.data?.signedIn)
    return (
      <Notice title="Committee sign in">
        <p>Committee, membership, and event management are for the HAAS administrator. Sign in with the assigned HAAS admin email address.</p>
        <Link href="/sign-in" data-testid="link-admin-signin" className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground"><LogIn className="h-4 w-4" /> Sign in</Link>
      </Notice>
    );
  if (!status.data.isAdmin)
    return (
      <Notice title="Access restricted">
        <p>This account doesn't have admin access. Only the assigned HAAS admin email, once verified, can edit committee names, membership information, and events.</p>
        <Link href="/events" className="mt-6 inline-block text-primary underline">View public events</Link>
      </Notice>
    );
  return <Manager />;
}
