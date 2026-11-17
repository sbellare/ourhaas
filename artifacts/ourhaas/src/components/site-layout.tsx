import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Show, useClerk } from "@clerk/react";
import { Menu, X, LogOut, CalendarCog } from "lucide-react";
import { CONTACT_EMAIL } from "@/lib/haas";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const NAV = [
  { href: "/", label: "Home" },
  { href: "/events", label: "Events" },
  { href: "/membership", label: "Membership" },
  { href: "/about", label: "About" },
  { href: "/resources", label: "Resources" },
  { href: "/contact", label: "Contact" },
];

export function Lamp({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden>
      <circle cx="48" cy="48" r="46" fill="hsl(190 48% 22%)" />
      <circle cx="48" cy="48" r="38" fill="none" stroke="hsl(41 88% 54%)" strokeWidth="2" strokeDasharray="3 5" />
      <g className="flame">
        <path d="M48 22c7 9 9 15 0 24c-9-9-7-15 0-24z" fill="hsl(41 88% 54%)" />
        <path d="M48 31c3 4 4 7 0 11c-4-4-3-7 0-11z" fill="hsl(4 72% 44%)" />
      </g>
      <path d="M26 54h44c-2 9-11 14-22 14s-20-5-22-14z" fill="hsl(4 72% 44%)" />
      <path d="M30 76h36" stroke="hsl(41 88% 54%)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function SignOutButton() {
  const { signOut } = useClerk();
  return (
    <button
      type="button"
      data-testid="button-sign-out"
      onClick={() => signOut({ redirectUrl: basePath || "/" })}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
    >
      <LogOut className="h-3.5 w-3.5" /> Sign out
    </button>
  );
}

export function SiteLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/" ? location === "/" : location.startsWith(href));

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <div className="toran" aria-hidden />
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3">
          <Link href="/" className="group flex items-center gap-3" data-testid="link-home-logo">
            <Lamp className="h-10 w-10 transition-transform duration-500 group-hover:rotate-[8deg]" />
            <span className="leading-tight">
              <span className="font-display block text-xl font-semibold tracking-tight">Our HAAS</span>
              <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Houston Area Amchigele Samaj</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                data-testid={`link-nav-${n.label.toLowerCase()}`}
                className={`relative rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${isActive(n.href) ? "text-primary" : "text-foreground/75 hover:text-foreground"}`}
              >
                {n.label}
                <span className={`absolute inset-x-3 -bottom-0.5 h-[2px] origin-left rounded bg-primary transition-transform duration-300 ${isActive(n.href) ? "scale-x-100" : "scale-x-0"}`} />
              </Link>
            ))}
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            <Show when="signed-in">
              <Link href="/admin" data-testid="link-admin" className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm hover:bg-muted">
                <CalendarCog className="h-3.5 w-3.5" /> Admin
              </Link>
              <SignOutButton />
            </Show>
            <Link href="/membership" data-testid="link-join-header" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[0_6px_18px_-8px_hsl(var(--primary))] transition hover:-translate-y-0.5">
              Become a member
            </Link>
          </div>
          <button type="button" className="rounded-full p-2 lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu" data-testid="button-menu">
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
        {open && (
          <div className="border-t border-border bg-background px-5 pb-5 lg:hidden">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className={`block border-b border-border/60 py-3 font-display text-lg ${isActive(n.href) ? "text-primary" : ""}`}>
                {n.label}
              </Link>
            ))}
            <Show when="signed-in">
              <Link href="/admin" onClick={() => setOpen(false)} className="block py-3 font-display text-lg">Admin</Link>
              <SignOutButton />
            </Show>
            <Link href="/membership" onClick={() => setOpen(false)} className="mt-4 block rounded-full bg-primary px-4 py-3 text-center font-semibold text-primary-foreground">Become a member</Link>
          </div>
        )}
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mt-24 bg-secondary text-secondary-foreground">
        <div className="wave-divider -translate-y-full rotate-180 bg-transparent" aria-hidden />
        <div className="mx-auto grid max-w-7xl gap-10 px-5 pb-12 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <Lamp className="h-12 w-12" />
              <p className="font-display text-2xl">Houston Area Amchigele Samaj</p>
            </div>
            <p className="mt-4 max-w-md text-secondary-foreground/75">Konkani roots, Houston home. A gathering place for Konkani families across generations.</p>
          </div>
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">Explore</p>
            <ul className="mt-3 space-y-2">
              {NAV.slice(1).map((n) => (
                <li key={n.href}><Link href={n.href} className="text-secondary-foreground/80 hover:text-accent">{n.label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">Write to us</p>
            <a href={`mailto:${CONTACT_EMAIL}`} className="mt-3 block font-display text-xl hover:text-accent" data-testid="link-footer-email">{CONTACT_EMAIL}</a>
            <Link href="/sign-in" className="mt-6 inline-block text-xs text-secondary-foreground/50 hover:text-accent" data-testid="link-footer-signin">Committee sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function PageHero({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <section className="rangoli-bg relative overflow-hidden border-b border-border/60">
      <div className="mx-auto max-w-7xl px-5 py-16 md:py-24">
        <p className="rise font-mono text-xs uppercase tracking-[0.25em] text-primary">{eyebrow}</p>
        <h1 className="rise font-display mt-4 max-w-4xl text-5xl font-semibold leading-[0.95] tracking-tight md:text-7xl" style={{ animationDelay: "80ms" }}>{title}</h1>
        {children && <div className="rise mt-6 max-w-2xl text-lg text-muted-foreground" style={{ animationDelay: "160ms" }}>{children}</div>}
      </div>
    </section>
  );
}
