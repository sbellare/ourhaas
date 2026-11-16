import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMembershipQueryKey, useGetMembership, useUpdateMembership, type MembershipSettings } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LoadError } from "@/components/event-bits";
import { useToast } from "@/hooks/use-toast";

const detailFields = [
  ["description", "Membership introduction", 2000],
  ["calendarPolicy", "Membership period", 1000],
  ["chequePolicy", "Cheque payments", 1000],
  ["discountPolicy", "Partial-year policy", 1000],
  ["refundPolicy", "Refund policy", 1000],
] as const;

export function MembershipEditor() {
  const membership = useGetMembership();
  const update = useUpdateMembership();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState<MembershipSettings | null>(null);
  const [error, setError] = useState("");
  const setField = <K extends keyof MembershipSettings>(field: K, value: MembershipSettings[K]) =>
    setDraft((current) => current ? { ...current, [field]: value } : current);

  return (
    <section id="membership" className="mb-12 scroll-mt-28 rounded-[2rem] border border-card-border bg-card p-5 sm:p-8">
      <h2 className="font-display text-3xl font-semibold">Membership settings</h2>
      <p className="mt-2 text-sm text-muted-foreground">Update the membership year, Zeffy registration link, and details shown on the membership page and homepage.</p>
      {membership.isLoading && <p role="status" className="mt-6">Loading membership information…</p>}
      {membership.isError && <LoadError what="membership information" onRetry={() => membership.refetch()} />}
      {membership.data && !draft && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <p className="font-display break-words text-xl font-semibold">HAAS {membership.data.year} Membership</p>
          <button type="button" onClick={() => { setDraft({ ...membership.data! }); setError(""); }} className="rounded-full border border-primary px-5 py-2 font-semibold text-primary hover:bg-primary/5">Edit membership</button>
        </div>
      )}
      {draft && (
        <form className="mt-6 space-y-5" onSubmit={(event) => {
          event.preventDefault();
          if (update.isPending) return;
          const data = { ...draft };
          for (const [field] of detailFields) data[field] = data[field].trim();
          try {
            const url = new URL(data.registrationUrl.trim());
            if (url.protocol !== "https:" || !["zeffy.com", "www.zeffy.com"].includes(url.hostname) || url.username || url.password) throw new Error();
            data.registrationUrl = url.href;
          } catch {
            setError("Enter a secure https://www.zeffy.com registration link.");
            return;
          }
          if (!Number.isInteger(data.year) || data.year < 2000 || data.year > 2200 || detailFields.some(([field]) => !data[field])) {
            setError("Enter a year between 2000 and 2200 and complete all membership details.");
            return;
          }
          setError("");
          update.mutate({ data }, {
            onSuccess: (saved) => {
              qc.setQueryData(getGetMembershipQueryKey(), saved);
              qc.invalidateQueries({ queryKey: getGetMembershipQueryKey() });
              setDraft(null);
              toast({ title: "Membership updated", description: `HAAS ${saved.year} Membership is now shown on the website.` });
            },
            onError: () => setError("Could not save. Your edits are kept here. Check your admin sign-in and try again."),
          });
        }}>
          <fieldset disabled={update.isPending} className="space-y-5">
            <div>
              <label htmlFor="membership-year" className="mb-2 block font-medium">Membership year</label>
              <Input id="membership-year" type="number" min={2000} max={2200} step={1} required value={Number.isNaN(draft.year) ? "" : draft.year} onChange={(event) => setField("year", event.target.valueAsNumber)} />
            </div>
            <div>
              <label htmlFor="membership-registration" className="mb-2 block font-medium">Zeffy registration URL</label>
              <Input id="membership-registration" type="url" required maxLength={2000} value={draft.registrationUrl} onChange={(event) => setField("registrationUrl", event.target.value)} />
              <p className="mt-2 text-sm text-muted-foreground">Use the full HTTPS link to the correct Zeffy membership form. Changing the year does not change this link automatically.</p>
            </div>
            {detailFields.map(([field, label, limit]) => (
              <div key={field}>
                <label htmlFor={`membership-${field}`} className="mb-2 block font-medium">{label}</label>
                <Textarea id={`membership-${field}`} required maxLength={limit} rows={3} value={draft[field]} onChange={(event) => setField(field, event.target.value)} />
              </div>
            ))}
          </fieldset>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={update.isPending} className="rounded-full bg-primary px-5 py-2 font-semibold text-primary-foreground disabled:opacity-50">{update.isPending ? "Saving…" : "Save membership"}</button>
            <button type="button" disabled={update.isPending} onClick={() => { setDraft(null); setError(""); }} className="rounded-full border border-border px-5 py-2 disabled:opacity-50">Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}
