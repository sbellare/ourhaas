import { useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListContentPages, getListContentPagesQueryKey, useUpdateContentPage,
  type ContentPage, type ContentPageInput,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LoadError } from "@/components/event-bits";
import { useToast } from "@/hooks/use-toast";

export function EventPaymentsEditor() {
  const pages = useListContentPages({
    query: { queryKey: getListContentPagesQueryKey(), refetchInterval: 30000 },
  });
  const update = useUpdateContentPage();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState<ContentPageInput | null>(null);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const page = pages.data?.find((entry) => entry.slug === "event-payments");

  return (
    <section id="event-payments" className="mb-12 scroll-mt-28 rounded-[2rem] border border-card-border bg-card p-5 sm:p-8">
      <h2 className="font-display text-3xl font-semibold">Event Payments page</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Edit the page title, payment instructions, contact details, policies, and links.
        This changes the information page, not individual events’ registration links.
      </p>
      {pages.isLoading && <p role="status" className="mt-6">Loading Event Payments…</p>}
      {pages.isError && <LoadError what="the Event Payments page" onRetry={() => pages.refetch()} />}
      {!pages.isLoading && !pages.isError && !page && <p role="alert" className="mt-6">The Event Payments page could not be found.</p>}
      {page && !draft && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <Link href="/resources/event-payments" className="font-medium text-primary underline">View Event Payments page</Link>
          <button type="button" className="rounded-full border border-primary px-5 py-2 font-semibold text-primary hover:bg-primary/5"
            onClick={() => { setDraft({ title: page.title, markdown: page.markdown }); setError(""); }}>
            Edit Event Payments
          </button>
        </div>
      )}
      {draft && (
        <form className="mt-6 space-y-5" onSubmit={(event) => {
          event.preventDefault();
          if (saving.current || update.isPending) return;
          const data = { title: draft.title.trim(), markdown: draft.markdown.trim() };
          if (!data.title || data.title.length > 200 || !data.markdown || data.markdown.length > 50000
            || /[\u0000-\u001f\u007f]/.test(data.title)
            || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(data.markdown)) {
            setError("Enter a title of 1–200 characters and page text of 1–50,000 characters without invalid characters.");
            return;
          }
          saving.current = true;
          setError("");
          void qc.cancelQueries({ queryKey: getListContentPagesQueryKey() });
          update.mutate({ slug: "event-payments", data }, {
            onSuccess: (saved) => {
              qc.setQueryData<ContentPage[]>(getListContentPagesQueryKey(), (current) =>
                current?.map((entry) => entry.slug === saved.slug ? saved : entry));
              void qc.invalidateQueries({ queryKey: getListContentPagesQueryKey() });
              setDraft(null);
              toast({ title: "Event Payments updated", description: "The saved information is now available on the public page." });
            },
            onError: () => setError("Could not save. Your edits are kept here. Check your connection and administrator sign-in, then try again."),
            onSettled: () => { saving.current = false; },
          });
        }}>
          <fieldset disabled={update.isPending} className="space-y-5">
            <div>
              <label htmlFor="event-payments-title" className="mb-2 block font-medium">Page title</label>
              <Input id="event-payments-title" required maxLength={200} value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            </div>
            <div>
              <label htmlFor="event-payments-markdown" className="mb-2 block font-medium">Page text</label>
              <Textarea id="event-payments-markdown" required maxLength={50000} rows={16} value={draft.markdown}
                onChange={(event) => setDraft({ ...draft, markdown: event.target.value })} />
              <p className="mt-2 text-sm text-muted-foreground">
                Use Markdown for formatting: **bold**, # Heading, and [link text](https://example.com).
                Payment links stay unchanged unless you edit them here.
              </p>
            </div>
          </fieldset>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={update.isPending} className="rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground disabled:opacity-50">
              {update.isPending ? "Saving…" : "Save Event Payments"}
            </button>
            <button type="button" disabled={update.isPending} className="rounded-full border border-border px-5 py-2.5 font-semibold disabled:opacity-50"
              onClick={() => { setDraft(null); setError(""); }}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}
