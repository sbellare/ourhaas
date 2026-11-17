import { useEffect, useState } from "react";
import { COMMITTEE_TERM } from "@workspace/haas-content";
import { Link } from "wouter";
import { ArrowRight, ArrowUpRight, Mail } from "lucide-react";
import { useListEvents, useListContentPages, useListCommittee, getListCommitteeQueryKey, getListEventsQueryKey, useGetMembership, getGetMembershipQueryKey, type CommunityEvent } from "@workspace/api-client-react";
import { EventDialog, EventRow, EventSkeleton, LoadError, UpcomingEmpty } from "@/components/event-bits";
import { CONTACT_EMAIL, initials, splitEvents } from "@/lib/haas";
import heroImg from "@/assets/konkani-dialects.jpeg";

export default function Home() {
  const events = useListEvents({ query: { queryKey: getListEventsQueryKey(), refetchInterval: 30000 } });
  const pages = useListContentPages();
  const membership = useGetMembership({ query: { queryKey: getGetMembershipQueryKey(), refetchInterval: 30000 } });
  const committee = useListCommittee({ query: { queryKey: getListCommitteeQueryKey(), refetchInterval: 30000 } });
  const [selectedEventId, setSelectedEventId] = useState<CommunityEvent["id"] | null>(null);
  const openEvent = events.data?.find((event) => event.id === selectedEventId) ?? null;
  const openEventDetails = (event: CommunityEvent) => setSelectedEventId(event.id);
  const { upcoming, past } = splitEvents(events.data);

  useEffect(() => {
    // A failed refresh cannot confirm that the selected event was deleted.
    if (events.isSuccess && selectedEventId !== null && !openEvent) {
      setSelectedEventId(null);
    }
  }, [events.isSuccess, selectedEventId, openEvent]);

  return (
    <>
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 pb-16 pt-12 md:grid-cols-[1.1fr_1fr] md:pt-20">
          <div>
            <p className="rise font-mono text-xs uppercase tracking-[0.25em] text-primary">Houston Area Amchigele Samaj</p>
            <h1 className="rise font-display mt-5 text-6xl font-semibold leading-[0.9] tracking-tight md:text-8xl" style={{ animationDelay: "90ms" }}>
              Konkani roots,<br /><em className="font-normal text-primary">Houston</em> home.
            </h1>
            <p className="rise mt-7 max-w-lg text-lg text-muted-foreground" style={{ animationDelay: "180ms" }}>
              A warm, intergenerational gathering place for Konkani families in the Houston area, carrying coastal traditions into community life in the USA.
            </p>
            <div className="rise mt-9 flex flex-wrap gap-3" style={{ animationDelay: "260ms" }}>
              <Link href="/events" data-testid="link-hero-events" className="group inline-flex items-center gap-2 rounded-full bg-secondary px-6 py-3 font-semibold text-secondary-foreground transition hover:-translate-y-0.5">
                See events <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </Link>
              <Link href="/membership" data-testid="link-hero-membership" className="inline-flex items-center gap-2 rounded-full border-2 border-primary px-6 py-3 font-semibold text-primary transition hover:bg-primary hover:text-primary-foreground">
                Membership
              </Link>
            </div>
          </div>
          <figure className="rise relative" style={{ animationDelay: "200ms" }}>
            <img src={heroImg} alt="Konkani dialects: a north-to-south continuum, illustrated from Koli in the north to Kochi Konkani in the south" width={526} height={526} className="relative h-auto w-full rounded-md shadow-2xl" />
          </figure>
        </div>
      </section>

      <section className="bg-secondary py-4 text-secondary-foreground">
        <div className="flex gap-10 overflow-hidden whitespace-nowrap font-display text-2xl italic">
          {["Bhajans", "Festivals", "Konkani conversation", "Shared meals", "Families across generations", "Bhajans", "Festivals", "Konkani conversation"].map((w, i) => (
            <span key={i} className="flex items-center gap-10">{w}<span className="h-2 w-2 rounded-full bg-accent" /></span>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">On the calendar</p>
            <h2 className="font-display mt-2 text-4xl font-semibold md:text-5xl">Upcoming gatherings</h2>
          </div>
          <Link href="/events" className="group inline-flex items-center gap-1 font-medium text-primary" data-testid="link-all-events">All events, past and upcoming <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></Link>
        </div>
        <div className="mt-8">
          {events.isLoading ? <EventSkeleton /> : events.isError ? <LoadError what="events" onRetry={() => events.refetch()} /> : upcoming.length === 0 ? (
            <div className="grid gap-6 md:grid-cols-[1.3fr_1fr]">
              <UpcomingEmpty />
              {past[0] && (
                <div>
                  <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Most recently</p>
                  <EventRow event={past[0]} past onOpen={openEventDetails} />
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">{upcoming.slice(0, 4).map((e) => <EventRow key={e.id} event={e} onOpen={openEventDetails} />)}</div>
          )}
        </div>
      </section>

      <section className="rangoli-bg border-y border-border/60">
        {membership.isLoading && <p role="status" className="mx-auto max-w-7xl px-5 py-14">Loading membership information…</p>}
        {membership.isError && <div className="mx-auto max-w-7xl px-5 py-14"><LoadError what="membership information" onRetry={() => membership.refetch()} /></div>}
        {membership.data &&
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 md:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">Membership {membership.data.year}</p>
            <h2 className="font-display mt-2 text-4xl font-semibold md:text-5xl">Join for the calendar year.</h2>
            <p className="mt-4 whitespace-pre-line text-muted-foreground">{membership.data.description}</p>
          </div>
          <div className="rounded-[2rem] border border-card-border bg-card p-8 shadow-[0_30px_60px_-40px_hsl(var(--secondary)/.6)]">
            <ul className="space-y-4 text-foreground/85">
              {[membership.data.calendarPolicy, membership.data.chequePolicy, membership.data.discountPolicy, membership.data.refundPolicy].map((policy, index) =>
                <li key={index} className="flex gap-3 whitespace-pre-line"><span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />{policy}</li>)}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={membership.data.registrationUrl} target="_blank" rel="noreferrer" data-testid="link-zeffy-home" className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground transition hover:-translate-y-0.5">Register on Zeffy <ArrowUpRight className="h-4 w-4" /></a>
              <Link href="/membership" className="inline-flex items-center rounded-full px-4 py-3 font-medium text-secondary hover:underline">Full details</Link>
            </div>
          </div>
        </div>}
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">Committee {COMMITTEE_TERM}</p>
        <h2 className="font-display mt-2 text-4xl font-semibold md:text-5xl">The people keeping the lamp lit</h2>
        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {committee.isLoading ? <p role="status">Loading committee…</p> : committee.isError ? <LoadError what="committee members" onRetry={() => committee.refetch()} /> : committee.data?.map((m, i) => (
            <div key={m.id} className="group min-w-0 rounded-3xl border border-card-border bg-card p-5 transition hover:-translate-y-1" data-testid={`card-committee-${i}`}>
              <div className={`flex h-14 w-14 items-center justify-center rounded-full font-display text-xl font-semibold transition group-hover:rotate-6 ${i % 3 === 0 ? "bg-primary text-primary-foreground" : i % 3 === 1 ? "bg-secondary text-secondary-foreground" : "bg-accent text-accent-foreground"}`}>{initials(m.name)}</div>
              <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{m.role}</p>
              <p className="font-display break-words text-lg font-semibold leading-tight">{m.name}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5">
        <div className="grid gap-8 rounded-[2.5rem] bg-secondary p-8 text-secondary-foreground md:grid-cols-[1.2fr_1fr] md:p-12">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-accent">The archive</p>
            <h2 className="font-display mt-2 text-4xl font-semibold">News, newsletters, FAQs and more</h2>
            <p className="mt-3 text-secondary-foreground/75">Every page from the original Our HAAS site, kept intact with its documents and links.</p>
            <Link href="/resources" data-testid="link-resources-home" className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 font-semibold text-accent-foreground">Browse resources <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <ul className="divide-y divide-secondary-foreground/15">
            {pages.isLoading ? [0, 1, 2, 3].map((i) => <li key={i} className="py-3"><div className="h-5 w-2/3 animate-pulse rounded bg-secondary-foreground/15" /></li>) :
              (pages.data ?? []).slice(0, 6).map((p) => (
                <li key={p.slug}><Link href={`/resources/${p.slug}`} className="group flex items-center justify-between py-3 font-display text-lg hover:text-accent">{p.title}<ArrowUpRight className="h-4 w-4 opacity-50 transition group-hover:opacity-100" /></Link></li>
              ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 pt-20 text-center">
        <h2 className="font-display text-4xl font-semibold md:text-5xl">Questions? Say hello.</h2>
        <a href={`mailto:${CONTACT_EMAIL}`} data-testid="link-email-home" className="mt-6 inline-flex items-center gap-2 font-display text-2xl text-primary underline-offset-8 hover:underline md:text-3xl"><Mail className="h-6 w-6" />{CONTACT_EMAIL}</a>
      </section>
      <EventDialog event={openEvent} onClose={() => setSelectedEventId(null)} />
    </>
  );
}
