import { Link } from "wouter";
import { ArrowUpRight, Mail, Landmark, CalendarRange, BadgePercent, Ban } from "lucide-react";
import { PageHero } from "@/components/site-layout";
import { CONTACT_EMAIL, initials } from "@/lib/haas";
import { useListCommittee, getListCommitteeQueryKey, useGetAdminStatus, useGetMembership, getGetMembershipQueryKey } from "@workspace/api-client-react";
import { LoadError } from "@/components/event-bits";

export function Membership() {
  const membership = useGetMembership({ query: { queryKey: getGetMembershipQueryKey(), refetchInterval: 30000 } });
  const admin = useGetAdminStatus();
  const details = membership.data;
  const rules = [
    { icon: CalendarRange, title: "Membership period", body: details?.calendarPolicy },
    { icon: Landmark, title: "Cheque payments", body: details?.chequePolicy },
    { icon: BadgePercent, title: "Partial-year policy", body: details?.discountPolicy },
    { icon: Ban, title: "Refund policy", body: details?.refundPolicy },
  ];
  return (
    <>
      <PageHero eyebrow={details ? `Membership ${details.year}` : "Membership"} title={<>Be part of the <em className="font-normal text-primary">Samaj</em></>}>
        <span className="whitespace-pre-line">{details?.description}</span>
        {admin.data?.isAdmin && <Link href="/admin#membership" className="mt-5 block text-sm font-semibold text-primary underline">Edit membership</Link>}
      </PageHero>
      {membership.isLoading && <p role="status" className="mx-auto max-w-7xl px-5 py-14">Loading membership information…</p>}
      {membership.isError && <div className="mx-auto max-w-7xl px-5 py-14"><LoadError what="membership information" onRetry={() => membership.refetch()} /></div>}
      {details &&
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-[1.2fr_1fr]">
        <div className="grid gap-4 sm:grid-cols-2">
          {rules.map((r) => (
            <div key={r.title} className="rounded-3xl border border-card-border bg-card p-6 transition hover:-translate-y-1">
              <r.icon className="h-6 w-6 text-primary" />
              <h3 className="font-display mt-4 text-2xl font-semibold">{r.title}</h3>
              <p className="mt-2 whitespace-pre-line text-muted-foreground">{r.body}</p>
            </div>
          ))}
        </div>
        <div className="sticky top-28 h-fit rounded-[2rem] bg-primary p-8 text-primary-foreground">
          <p className="font-mono text-xs uppercase tracking-[0.2em] opacity-80">HAAS {details.year} Membership</p>
          <p className="font-display mt-3 text-4xl font-semibold leading-tight">Register on Zeffy</p>
          <a href={details.registrationUrl} target="_blank" rel="noreferrer" data-testid="link-zeffy" className="mt-8 inline-flex items-center gap-2 rounded-full bg-background px-6 py-3 font-semibold text-foreground transition hover:-translate-y-0.5">Open membership page <ArrowUpRight className="h-4 w-4" /></a>
          <p className="mt-6 text-sm opacity-85">Questions about membership? <a className="underline" href={`mailto:${CONTACT_EMAIL}?subject=Membership`}>{CONTACT_EMAIL}</a></p>
        </div>
      </div>}
    </>
  );
}

export function About() {
  const committee = useListCommittee({ query: { queryKey: getListCommitteeQueryKey(), refetchInterval: 30000 } });
  const admin = useGetAdminStatus();
  return (
    <>
      <PageHero eyebrow="About HAAS" title={<>Houston Area <em className="font-normal text-primary">Amchigele</em> Samaj</>}>
        A community for Mangalorean Konkani families in the Houston area, bringing people of every generation together through bhajans, festivals and shared community life.
      </PageHero>
      <section className="mx-auto max-w-7xl px-5 py-14">
        <h2 className="font-display text-4xl font-semibold">Committee Jan 2027 – Dec 2028</h2>
        {admin.data?.isAdmin && <Link href="/admin#committee" className="mt-4 inline-block rounded-full border border-primary px-5 py-2 font-semibold text-primary">Edit committee names</Link>}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {committee.isLoading ? <p role="status">Loading committee…</p> : committee.isError ? <LoadError what="committee members" onRetry={() => committee.refetch()} /> : committee.data?.map((m, i) => (
            <div key={m.id} className="flex items-center gap-5 rounded-3xl border border-card-border bg-card p-5" data-testid={`card-member-${i}`}>
              <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl font-display text-2xl font-semibold ${i % 2 ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground"}`}>{initials(m.name)}</div>
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{m.role}</p>
                <p className="font-display break-words text-xl font-semibold">{m.name}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap gap-3">
          <Link href="/resources" className="rounded-full border-2 border-secondary px-5 py-2.5 font-semibold text-secondary hover:bg-secondary hover:text-secondary-foreground">Read the original pages</Link>
          <Link href="/contact" className="rounded-full px-5 py-2.5 font-semibold text-primary hover:underline">Contact the committee</Link>
        </div>
      </section>
    </>
  );
}

export function Contact() {
  return (
    <>
      <PageHero eyebrow="Contact" title={<>Write to <em className="font-normal text-primary">us</em></>}>
        For events, bhajans, membership or anything else, email the coordinator. Your email app will open with a fresh message.
      </PageHero>
      <div className="mx-auto max-w-7xl px-5 py-14">
        <a href={`mailto:${CONTACT_EMAIL}`} data-testid="link-contact-email" className="group block rounded-[2.5rem] bg-secondary p-10 text-secondary-foreground transition hover:-translate-y-1 md:p-16">
          <Mail className="h-10 w-10 text-accent transition group-hover:rotate-[-8deg]" />
          <p className="font-display mt-6 break-all text-4xl font-semibold md:text-7xl">{CONTACT_EMAIL}</p>
          <p className="mt-4 inline-flex items-center gap-2 text-accent">Open email <ArrowUpRight className="h-4 w-4" /></p>
        </a>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[["Bhajans", "Bhajan details"], ["Membership", "Membership question"], ["Events", "Event question"]].map(([t, s]) => (
            <a key={t} href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(s)}`} data-testid={`link-mailto-${t.toLowerCase()}`} className="rounded-3xl border border-card-border bg-card p-6 transition hover:border-primary/40">
              <p className="font-display text-2xl font-semibold">{t}</p>
              <p className="mt-1 text-sm text-muted-foreground">Subject: {s}</p>
            </a>
          ))}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">Bhajan updates are also shared via Evite and the Our HAAS WhatsApp group.</p>
      </div>
    </>
  );
}
