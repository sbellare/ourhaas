# Event-management regression coverage

## Run

From the workspace root:

```sh
pnpm test
pnpm run typecheck
```

Or run just one suite:

```sh
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/ourhaas test
```

These tests need no secrets, accounts, running services, or database. They never
modify development or production data.

## Boundaries

- `artifacts/api-server/src/routes/haas.test.ts` runs HTTP requests through the
  real Express router, authorization middleware and generated validation.
  Only Clerk identity lookup and the database are mocked within the test.
  Coverage includes the verified assigned primary email, case normalization,
  unverified or missing verification, a different primary email, a matching
  secondary email, missing primary email, self-claimed roles, missing
  administrator configuration, Clerk failures, cross-origin writes and all
  three signed-out mutations. Denied writes must not touch storage.
- The same suite exercises authorized create/update/delete and signed-out
  public reads between mutations. Its storage fake does not prove PostgreSQL
  persistence or token verification; those require the live check below.
- `artifacts/ourhaas/src/pages/admin.test.tsx` renders the real admin page,
  forms, date picker, category select, dialogs, generated API hooks and query
  invalidation. Only HTTP and the site shell/toast boundary are replaced.
  Coverage includes denied access, retry, create, edit, fresh-query remount,
  public details, clearing an optional field, form reset, category preservation,
  validation, cancelled and confirmed deletion, and mutation failure messages.

No application authentication bypass or test-only runtime route is provided.

## Live browser verification

On 2026-11-16, a browser signed in programmatically through development Clerk
as the owner-assigned account. It created a unique test event using the calendar
form, edited it, verified persisted fields after reloading, and read the edited
title and description publicly from a separate signed-out context. Signed-out
POST, PUT and DELETE returned 401 and left the event intact. Cancelling deletion
preserved the event; confirmed deletion removed it from admin and public reads.
The temporary event was deleted and all pre-existing events were unchanged.

That pass exposed a blank category when reopening Edit, blocking saves until
the category was selected again. The form now initializes saved values before
the select mounts instead of resetting them after mount. The regression fix
was verified by the component suite, including saving without touching Category;
the full browser journey was not repeated after that fix.

For future live checks, use development only, preserve the assigned account
configuration, create a uniquely named disposable event, and delete only that
event afterward. Never alter existing community events or add an auth bypass.
