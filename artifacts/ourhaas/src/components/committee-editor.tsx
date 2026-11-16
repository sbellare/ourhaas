import { useState } from "react";
import { COMMITTEE_TERM } from "@workspace/haas-content";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCommittee, useUpdateCommitteeMember,
  getListCommitteeQueryKey, getListContentPagesQueryKey,
  type CommitteeMember,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { LoadError } from "@/components/event-bits";
import { useToast } from "@/hooks/use-toast";

export function CommitteeEditor() {
  const members = useListCommittee({ query: { queryKey: getListCommitteeQueryKey(), refetchInterval: 30000 } });
  const update = useUpdateCommitteeMember();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<CommitteeMember | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  return (
    <section id="committee" className="mb-14 scroll-mt-28 rounded-3xl border border-card-border bg-card p-5 sm:p-8">
      <h2 className="font-display text-3xl font-semibold">Committee members</h2>
      <p className="mt-2 text-sm text-muted-foreground">{COMMITTEE_TERM}. Edit a name below; saved changes appear across the website. Roles and term dates stay unchanged.</p>
      {members.isLoading ? <p className="mt-6" role="status">Loading committee…</p> :
        members.isError ? <LoadError what="committee members" onRetry={() => members.refetch()} /> :
        <div className="mt-6 divide-y divide-border">
          {members.data?.map((member) => (
            <div key={member.id} className="py-4" data-testid={`admin-committee-${member.id}`}>
              {editing?.id === member.id ? (
                <form onSubmit={(event) => {
                  event.preventDefault();
                  const trimmed = name.trim();
                  if (!trimmed || trimmed.length > 120) { setError("Enter a name between 1 and 120 characters."); return; }
                  setError("");
                  update.mutate({ id: member.id, data: { name: trimmed } }, {
                    onSuccess: (saved) => {
                      qc.setQueryData<CommitteeMember[]>(getListCommitteeQueryKey(), (previous) =>
                        previous?.map((entry) => entry.id === saved.id ? saved : entry));
                      qc.invalidateQueries({ queryKey: getListCommitteeQueryKey() });
                      qc.invalidateQueries({ queryKey: getListContentPagesQueryKey() });
                      setEditing(null);
                      toast({ title: "Committee member updated", description: saved.name });
                    },
                    onError: () => setError("Could not save. Your changes are kept here. Check your admin sign-in and try again."),
                  });
                }} className="space-y-3">
                  <label htmlFor={`committee-name-${member.id}`} className="block font-medium">{member.role} name</label>
                  <Input id={`committee-name-${member.id}`} value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required autoFocus disabled={update.isPending} aria-invalid={!!error} aria-describedby={error ? "committee-error" : undefined} />
                  {error && <p id="committee-error" role="alert" className="text-sm text-destructive">{error}</p>}
                  <div className="flex flex-wrap gap-3">
                    <button type="submit" disabled={update.isPending || !name.trim()} className="rounded-full bg-primary px-5 py-2 font-semibold text-primary-foreground disabled:opacity-50">{update.isPending ? "Saving…" : "Save name"}</button>
                    <button type="button" disabled={update.isPending} onClick={() => { setEditing(null); setError(""); }} className="rounded-full border border-border px-5 py-2 disabled:opacity-50">Cancel</button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{member.role}</p>
                    <p className="font-display break-words text-xl font-semibold">{member.name}</p>
                  </div>
                  <button type="button" disabled={!!editing} onClick={() => { setEditing(member); setName(member.name); setError(""); }} aria-label={`Edit ${member.role} name`} className="rounded-full border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-40">Edit name</button>
                </div>
              )}
            </div>
          ))}
        </div>}
    </section>
  );
}
