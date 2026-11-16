import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-28 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">404</p>
      <h1 className="font-display mt-4 text-5xl font-semibold">This path wandered off.</h1>
      <p className="mt-4 text-muted-foreground">The page you are looking for isn't here. Let's take you back home.</p>
      <Link href="/" data-testid="link-404-home" className="mt-8 inline-block rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground">Back to Our HAAS</Link>
    </div>
  );
}
