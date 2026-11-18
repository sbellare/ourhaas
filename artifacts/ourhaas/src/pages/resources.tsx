import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import ReactMarkdown from "react-markdown";
import { ArrowLeft, ArrowUpRight, FileText, Search } from "lucide-react";
import { useListContentPages, getListContentPagesQueryKey, useGetAdminStatus, getGetAdminStatusQueryKey, type ContentPage } from "@workspace/api-client-react";
import { PageHero } from "@/components/site-layout";
import { LoadError } from "@/components/event-bits";

function excerpt(p: ContentPage) {
  return p.markdown.replace(/[#*_>`\[\]()!-]/g, " ").replace(/https?:\S+/g, "").replace(/\s+/g, " ").trim().slice(0, 140);
}

export function Resources() {
  const pages = useListContentPages({ query: { queryKey: getListContentPagesQueryKey(), refetchInterval: 30000 } });
  const [q, setQ] = useState("");
  const list = useMemo(() => (pages.data ?? []).filter((p) => (p.title + p.markdown).toLowerCase().includes(q.toLowerCase())), [pages.data, q]);

  return (
    <>
      <PageHero eyebrow="Resources and archive" title={<>Every page, <em className="font-normal text-primary">kept</em></>}>
        News, newsletters, FAQs, MADAT, archives and links carried over from the original Our HAAS website, with their documents intact.
      </PageHero>
      <div className="mx-auto max-w-7xl px-5 py-10">
        <label className="flex max-w-md items-center gap-2 rounded-full border border-input bg-card px-4 py-2.5 focus-within:ring-2 focus-within:ring-ring">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pages" className="w-full bg-transparent outline-none" data-testid="input-search-resources" aria-label="Search pages" />
        </label>
        <div className="mt-8">
          {pages.isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-40 animate-pulse rounded-3xl bg-muted" />)}</div>
          ) : pages.isError ? <LoadError what="resources" onRetry={() => pages.refetch()} /> : list.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border p-10 text-center">
              <p className="font-display text-2xl">Nothing matches "{q}".</p>
              <button type="button" onClick={() => setQ("")} className="mt-3 text-primary underline">Clear search</button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {list.map((p, i) => (
                <Link key={p.slug} href={`/resources/${p.slug}`} data-testid={`card-resource-${p.slug}`} className={`group flex flex-col rounded-3xl border border-card-border p-6 transition hover:-translate-y-1 hover:shadow-[0_20px_40px_-28px_hsl(var(--secondary)/.6)] ${i % 5 === 0 ? "bg-accent/15" : "bg-card"}`}>
                  <FileText className="h-5 w-5 text-primary" />
                  <h2 className="font-display mt-4 text-2xl font-semibold leading-tight group-hover:text-primary">{p.title}</h2>
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{excerpt(p)}</p>
                  <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-primary">Read <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function resolveHref(href: string | undefined, base: string) {
  if (!href) return href;
  if (href.startsWith("mailto:") || href.startsWith("#")) return href;
  try { return new URL(href, base).toString(); } catch { return href; }
}

export function ResourcePage() {
  const { slug } = useParams<{ slug: string }>();
  const admin = useGetAdminStatus({ query: { queryKey: getGetAdminStatusQueryKey(), retry: false } });
  const pages = useListContentPages({ query: { queryKey: getListContentPagesQueryKey(), refetchInterval: 30000 } });
  const page = pages.data?.find((p) => p.slug === slug);

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <Link href="/resources" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary" data-testid="link-back-resources"><ArrowLeft className="h-4 w-4" /> All resources</Link>
      {pages.isLoading ? (
        <div className="mt-8 space-y-4"><div className="h-12 w-2/3 animate-pulse rounded bg-muted" />{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-4 animate-pulse rounded bg-muted" />)}</div>
      ) : pages.isError ? <div className="mt-8"><LoadError what="this page" onRetry={() => pages.refetch()} /></div> : !page ? (
        <div className="mt-10 rounded-3xl border border-dashed border-border p-10">
          <p className="font-display text-3xl">This page isn't in the archive.</p>
          <Link href="/resources" className="mt-3 inline-block text-primary underline">Browse all resources</Link>
        </div>
      ) : (
        <article className="mt-6">
          <h1 className="font-display text-5xl font-semibold leading-tight" data-testid="text-page-title">{page.title}</h1>
          {page.slug === "event-payments" && admin.data?.isAdmin && (
            <Link href="/admin#event-payments" className="mt-4 inline-block rounded-full border border-primary px-5 py-2 font-semibold text-primary">Edit Event Payments</Link>
          )}
          {page.sourceUrl && <a href={page.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-primary">Original page <ArrowUpRight className="h-3 w-3" /></a>}
          <div className="toran mt-6 opacity-70" aria-hidden />
          <div className="prose prose-haas prose-lg mt-8 max-w-none prose-headings:font-serif prose-headings:font-semibold prose-img:rounded-2xl" data-testid="content-markdown">
            <ReactMarkdown
              components={{
                a: ({ href, children }) => {
                  const url = resolveHref(href, page.sourceUrl);
                  const external = !!url && /^https?:/.test(url);
                  return <a href={url} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>{children}</a>;
                },
                img: ({ src, alt }) => <img src={resolveHref(typeof src === "string" ? src : undefined, page.sourceUrl)} alt={alt ?? ""} loading="lazy" />,
              }}
            >
              {page.markdown}
            </ReactMarkdown>
          </div>
        </article>
      )}
    </div>
  );
}
