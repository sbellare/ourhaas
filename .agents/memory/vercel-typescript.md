---
name: Vercel TypeScript emission
description: Differences between ordinary workspace type checks and Vercel's Express compiler.
---

Validate Vercel's per-file TypeScript emission when investigating an `Emit skipped` failure; do not infer success from esbuild or a normal workspace type check.

**Why:** Vercel's Node compiler wrapper checks direct compiler options before resolving inherited configuration. It can replace an inherited ES module setting with NodeNext. Its language service also handles shared workspace sources differently from a project-reference build, so a source-directory-only root can block emission without a useful error on the named route.

**How to apply:** Inspect the current Vercel compiler wrapper before reproducing its behavior. Preserve explicit leaf module settings where required, avoid confining cross-workspace compilation to the API source directory, and retain `noEmitOnError`. The Express preset uses a module resolver enabled by its strict TypeScript-errors flag; omitting that resolver from a reproduction produces misleading Express type failures.
