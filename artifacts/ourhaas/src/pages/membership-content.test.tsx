import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { getGetMembershipQueryKey, type MembershipSettings } from "@workspace/api-client-react";
import { MembershipEditor } from "@/components/membership-editor";
import Home from "./home";
import { Membership } from "./info";

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/components/site-layout", () => ({
  PageHero: ({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children: ReactNode }) =>
    <header><p>{eyebrow}</p><h1>{title}</h1>{children}</header>,
}));

const seed: MembershipSettings = {
  year: 2030,
  registrationUrl: "https://www.zeffy.com/en-US/ticketing/haas-2030-membership",
  description: "Original membership introduction.",
  calendarPolicy: "Original membership period.",
  chequePolicy: "Original cheque payment instructions.",
  discountPolicy: "Original partial-year policy.",
  refundPolicy: "Original refund policy.",
};
const revised: MembershipSettings = {
  year: 2037,
  // Deliberately unrelated to the displayed year: the administrator owns this URL.
  registrationUrl: "https://www.zeffy.com/en-US/ticketing/family-enrollment?source=community",
  description: "Join our Konkani community.\nFamilies of every generation are welcome.",
  calendarPolicy: "Coverage begins January 1 and ends December 31.",
  chequePolicy: "Deliver cheques to the membership coordinator.",
  discountPolicy: "The full annual fee applies when joining later in the year.",
  refundPolicy: "Membership fees are non-refundable.",
};
const textFields = [
  ["description", "Membership introduction"],
  ["calendarPolicy", "Membership period"],
  ["chequePolicy", "Cheque payments"],
  ["discountPolicy", "Partial-year policy"],
  ["refundPolicy", "Refund policy"],
] as const;
let saved: MembershipSettings;
let calls: Array<{ method: string; body: MembershipSettings | null }>;
let failure: number | "network" | null;

// Keep the real editor, pages, generated HTTP hooks and React Query cache.
// Only the HTTP boundary, toast and unrelated page hero shell are replaced.
function mount(content: ReactNode = <MembershipEditor />) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const location = memoryLocation({ path: "/membership" });
  const view = render(
    <QueryClientProvider client={client}>
      <Router hook={location.hook}>{content}</Router>
    </QueryClientProvider>,
  );
  return { ...view, client };
}

function PublicPages() {
  return <>
    <section aria-label="Public homepage"><Home /></section>
    <section aria-label="Public membership page"><Membership /></section>
  </>;
}

async function edit(values: MembershipSettings) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Edit membership" }));
  await user.clear(screen.getByLabelText("Membership year"));
  await user.type(screen.getByLabelText("Membership year"), String(values.year));
  await user.clear(screen.getByLabelText("Zeffy registration URL"));
  await user.type(screen.getByLabelText("Zeffy registration URL"), values.registrationUrl);
  for (const [field, label] of textFields) {
    await user.clear(screen.getByLabelText(label));
    await user.type(screen.getByLabelText(label), values[field]);
  }
  return user;
}

function expectDraft(values: MembershipSettings) {
  expect(screen.getByLabelText("Membership year")).toHaveValue(Number.isNaN(values.year) ? null : values.year);
  expect(screen.getByLabelText("Zeffy registration URL")).toHaveValue(values.registrationUrl);
  for (const [field, label] of textFields) {
    expect(screen.getByLabelText(label)).toHaveValue(values[field]);
  }
}

function expectPublicContent(values: MembershipSettings) {
  for (const name of ["Public homepage", "Public membership page"]) {
    const page = within(screen.getByRole("region", { name }));
    expect(page.getByText(`Membership ${values.year}`, { exact: true })).toBeVisible();
    for (const [field] of textFields) {
      // Testing Library normalizes whitespace, including the introduction's newline.
      expect(page.getByText(values[field].replace(/\s+/g, " "))).toBeVisible();
    }
    const link = page.getByTestId(name === "Public homepage" ? "link-zeffy-home" : "link-zeffy");
    expect(link).toHaveAttribute("href", values.registrationUrl);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  }
}

beforeEach(() => {
  saved = structuredClone(seed);
  calls = [];
  failure = null;
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url === "/api/haas/membership") {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as MembershipSettings : null;
      calls.push({ method, body });
      if (method === "GET") return json(saved);
      if (method === "PUT" && body) {
        if (failure === "network") throw new TypeError("Failed to fetch");
        if (failure) return json({ error: "Save rejected" }, failure);
        saved = structuredClone(body);
        return json(saved);
      }
    }
    if (url === "/api/haas/admin") return json({ signedIn: false, isAdmin: false });
    if (["/api/haas/events", "/api/haas/pages", "/api/haas/committee"].includes(url)) return json([]);
    throw new Error(`Unexpected request: ${method} ${url}`);
  }));
});

describe("membership content and independent registration links", () => {
  it("refreshes both mounted public pages after saving every field and fetches the same content after reload", async () => {
    const view = mount(<><MembershipEditor /><PublicPages /></>);
    await screen.findByTestId("link-zeffy-home");
    await screen.findByTestId("link-zeffy");
    expectPublicContent(seed);

    const user = await edit(revised);
    await user.click(screen.getByRole("button", { name: "Save membership" }));
    await screen.findByRole("button", { name: "Edit membership" });
    expect(calls.filter(({ method }) => method !== "GET")).toEqual([{ method: "PUT", body: revised }]);
    expect(saved).toEqual(revised);
    await waitFor(() => expectPublicContent(revised));
    for (const [field] of textFields) expect(screen.queryByText(seed[field])).not.toBeInTheDocument();
    expect(screen.queryByText("Membership 2030")).not.toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Membership updated" }));
    await user.click(screen.getByRole("button", { name: "Edit membership" }));
    expectDraft(revised);

    // A fresh client and remount simulate reload, without reusing the writer's cache.
    view.unmount();
    view.client.clear();
    const readsBeforeReload = calls.filter(({ method }) => method === "GET").length;
    const reload = mount(<><MembershipEditor /><PublicPages /></>);
    expect(reload.client.getQueryData(getGetMembershipQueryKey())).toBeUndefined();
    await screen.findByTestId("link-zeffy-home");
    await screen.findByTestId("link-zeffy");
    expectPublicContent(revised);
    expect(calls.filter(({ method }) => method === "GET").length).toBeGreaterThan(readsBeforeReload);
    await user.click(await screen.findByRole("button", { name: "Edit membership" }));
    expectDraft(revised);
  });

  it("keeps the supplied Zeffy URL unchanged when only the year changes, including after saving and reload", async () => {
    const view = mount(<><MembershipEditor /><PublicPages /></>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Edit membership" }));
    const year = screen.getByLabelText("Membership year");
    for (const value of ["2031", "2049"]) {
      await user.clear(year);
      await user.type(year, value);
      expect(screen.getByLabelText("Zeffy registration URL")).toHaveValue(seed.registrationUrl);
    }
    expectPublicContent(seed);
    await user.click(screen.getByRole("button", { name: "Save membership" }));
    await screen.findByRole("button", { name: "Edit membership" });
    const expected = { ...seed, year: 2049 };
    expect(calls.filter(({ method }) => method === "PUT")).toEqual([{ method: "PUT", body: expected }]);
    await waitFor(() => expectPublicContent(expected));
    view.unmount();
    view.client.clear();
    mount(<PublicPages />);
    await screen.findByTestId("link-zeffy-home");
    await screen.findByTestId("link-zeffy");
    expectPublicContent(expected);
  });

  it("discards every cancelled change without changing the saved content or either public page", async () => {
    const view = mount(<><MembershipEditor /><PublicPages /></>);
    const user = await edit(revised);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Save membership" })).not.toBeInTheDocument();
    expect(calls.every(({ method }) => method === "GET")).toBe(true);
    expect(saved).toEqual(seed);
    expect(view.client.getQueryData(getGetMembershipQueryKey())).toEqual(seed);
    expectPublicContent(seed);
    await user.click(screen.getByRole("button", { name: "Edit membership" }));
    expectDraft(seed);
    view.unmount();
    view.client.clear();
    mount(<PublicPages />);
    await screen.findByTestId("link-zeffy-home");
    await screen.findByTestId("link-zeffy");
    expectPublicContent(seed);
  });

  it.each([401, 403, 500, "network"] as const)(
    "retains every draft field after a %s failure, leaves public data alone, and allows retry",
    async (reason) => {
      const view = mount(<><MembershipEditor /><PublicPages /></>);
      const user = await edit(revised);
      failure = reason;
      await user.click(screen.getByRole("button", { name: "Save membership" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Could not save. Your edits are kept here.");
      expectDraft(revised);
      expect(screen.getByRole("button", { name: "Save membership" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
      expect(saved).toEqual(seed);
      expect(view.client.getQueryData(getGetMembershipQueryKey())).toEqual(seed);
      expectPublicContent(seed);
      expect(toast).not.toHaveBeenCalled();

      failure = null;
      await user.click(screen.getByRole("button", { name: "Save membership" }));
      await screen.findByRole("button", { name: "Edit membership" });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(calls.filter(({ method }) => method === "PUT")).toEqual([
        { method: "PUT", body: revised }, { method: "PUT", body: revised },
      ]);
      await waitFor(() => expectPublicContent(revised));
    },
  );
});

describe("membership editor client-side validation", () => {
  const detailsError = "Enter a year between 2000 and 2200 and complete all membership details.";
  const linkError = "Enter a secure https://www.zeffy.com registration link.";

  async function openDraft() {
    const view = mount();
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole("button", { name: "Edit membership" }));
    // An unrelated edit must survive rejection as well as the invalid field.
    await user.clear(screen.getByLabelText("Cheque payments"));
    await user.type(screen.getByLabelText("Cheque payments"), revised.chequePolicy);
    return { ...view, user, draft: { ...seed, chequePolicy: revised.chequePolicy } };
  }

  function expectBlocked(client: QueryClient, draft: MembershipSettings) {
    expect(calls.filter(({ method }) => method === "PUT")).toEqual([]);
    expect(saved).toEqual(seed);
    expect(client.getQueryData(getGetMembershipQueryKey())).toEqual(seed);
    expectDraft(draft);
    for (const label of ["Membership year", "Zeffy registration URL", ...textFields.map(([, label]) => label)]) {
      expect(screen.getByLabelText(label)).toBeEnabled();
    }
    expect(screen.getByRole("button", { name: "Save membership" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(toast).not.toHaveBeenCalled();
  }

  async function saveCorrected(user: ReturnType<typeof userEvent.setup>, expected: MembershipSettings) {
    await user.click(screen.getByRole("button", { name: "Save membership" }));
    await screen.findByRole("button", { name: "Edit membership" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(calls.filter(({ method }) => method === "PUT")).toEqual([{ method: "PUT", body: expected }]);
    expect(saved).toEqual(expected);
    expect(toast).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ title: "Membership updated" }));
    await user.click(screen.getByRole("button", { name: "Edit membership" }));
    expectDraft(expected);
  }

  it.each(textFields)("rejects whitespace-only %s with custom validation and saves after correction", async (field, label) => {
    const { user, client, draft } = await openDraft();
    const input = screen.getByLabelText(label);
    const whitespace = "   \n   ";
    await user.clear(input);
    await user.type(input, whitespace);
    // `required` treats whitespace as nonempty, so the editor must trim and reject it.
    expect(input).toBeValid();
    await user.click(screen.getByRole("button", { name: "Save membership" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(detailsError);
    expectBlocked(client, { ...draft, [field]: whitespace });
    await user.clear(input);
    await user.type(input, revised[field]);
    await saveCorrected(user, { ...draft, [field]: revised[field] });
  });

  it.each([
    ["http://www.zeffy.com/pay", "non-HTTPS HTTP"],
    ["ftp://zeffy.com/pay", "non-HTTPS FTP"],
    ["https://zeffy.com.evil.example/pay", "lookalike bare-domain suffix"],
    ["https://www.zeffy.com.evil.example/pay", "lookalike www-domain suffix"],
    ["https://notzeffy.com/pay", "lookalike prefix"],
    ["https://zeffy-com.example/pay", "lookalike hyphenated domain"],
    ["https://forms.zeffy.com/pay", "unapproved subdomain"],
    ["https://www.zeffy.com@evil.example/pay", "trusted domain in credentials"],
    ["https://evil.example/?next=https://www.zeffy.com/", "trusted domain in query"],
    ["https://user@zeffy.com/pay", "username on bare domain"],
    ["https://user:password@www.zeffy.com/pay", "username and password"],
    ["https://:password@www.zeffy.com/pay", "password without username"],
  ])("rejects %s (%s) with custom validation and saves after correction", async (url) => {
    const { user, client, draft } = await openDraft();
    const input = screen.getByLabelText("Zeffy registration URL");
    await user.clear(input);
    await user.type(input, url);
    // These are syntactically valid URLs: type=url cannot enforce the trust policy.
    expect(input).toBeValid();
    await user.click(screen.getByRole("button", { name: "Save membership" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(linkError);
    expectBlocked(client, { ...draft, registrationUrl: url });
    await user.clear(input);
    await user.type(input, revised.registrationUrl);
    await saveCorrected(user, { ...draft, registrationUrl: revised.registrationUrl });
  });

  const invalidYears = [
    { value: "", year: Number.NaN, validity: "valueMissing" },
    { value: "1999", year: 1999, validity: "rangeUnderflow" },
    { value: "2201", year: 2201, validity: "rangeOverflow" },
    { value: "2030.5", year: 2030.5, validity: "stepMismatch" },
  ] as const;

  it.each(invalidYears)("blocks year '$value' with native $validity and saves after correction", async ({ value, year, validity }) => {
    const { user, client, draft } = await openDraft();
    const input = screen.getByLabelText<HTMLInputElement>("Membership year");
    await user.clear(input);
    if (value) await user.type(input, value);
    expect(input.validity[validity]).toBe(true);
    expect(input).toBeInvalid();
    await user.click(screen.getByRole("button", { name: "Save membership" }));
    // Native constraints stop submission before React's handler; no custom alert is expected.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expectBlocked(client, { ...draft, year });
    await user.clear(input);
    await user.type(input, String(revised.year));
    await saveCorrected(user, { ...draft, year: revised.year });
  });

  it.each(invalidYears)("defensively rejects year '$value' if native validation is bypassed", async ({ value, year }) => {
    const { user, client, draft } = await openDraft();
    const input = screen.getByLabelText("Membership year");
    await user.clear(input);
    if (value) await user.type(input, value);
    // Dispatching submit bypasses constraint validation. This exercises only the
    // editor's defensive guard, not a normal browser Save click.
    fireEvent.submit(screen.getByRole("button", { name: "Save membership" }).closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent(detailsError);
    expectBlocked(client, { ...draft, year });
    await user.clear(input);
    await user.type(input, String(revised.year));
    await saveCorrected(user, { ...draft, year: revised.year });
  });

  it.each([
    { value: "", validity: "valueMissing" },
    { value: "not a URL", validity: "typeMismatch" },
  ] as const)("blocks URL '$value' with native $validity and saves after correction", async ({ value, validity }) => {
    const { user, client, draft } = await openDraft();
    const input = screen.getByLabelText<HTMLInputElement>("Zeffy registration URL");
    await user.clear(input);
    if (value) await user.type(input, value);
    expect(input.validity[validity]).toBe(true);
    expect(input).toBeInvalid();
    await user.click(screen.getByRole("button", { name: "Save membership" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expectBlocked(client, { ...draft, registrationUrl: value });
    await user.clear(input);
    await user.type(input, revised.registrationUrl);
    await saveCorrected(user, { ...draft, registrationUrl: revised.registrationUrl });
  });
});

describe("membership phone rendering safeguards", () => {
  // jsdom has no layout engine. Like committee-content.test.tsx, verify the
  // real responsive utilities, not window.innerWidth or fictional pixel sizes.
  it("keeps public policy grids single-column on phones, multiline content intact, and actions wrapping", async () => {
    saved = structuredClone(revised);
    mount(<><MembershipEditor /><PublicPages /></>);
    await screen.findByTestId("link-zeffy-home");
    await screen.findByTestId("link-zeffy");
    expectPublicContent(revised);
    const home = within(screen.getByRole("region", { name: "Public homepage" }));
    const details = within(screen.getByRole("region", { name: "Public membership page" }));
    const homeGrid = home.getByText("Membership 2037").parentElement!.parentElement!;
    const policyGrid = details.getByRole("heading", { name: "Membership period" }).parentElement!.parentElement!;
    expect(homeGrid).toHaveClass("grid", "px-5", "md:grid-cols-[1fr_1.2fr]");
    expect(policyGrid).toHaveClass("grid", "sm:grid-cols-2");
    expect(policyGrid.parentElement).toHaveClass("grid", "px-5", "md:grid-cols-[1.2fr_1fr]");
    for (const grid of [homeGrid, policyGrid, policyGrid.parentElement!]) {
      expect([...grid.classList].filter((token) => /^grid-cols-/.test(token))).toEqual([]);
    }
    for (const page of [home, details]) {
      for (const [field] of textFields) {
        const text = page.getByText(revised[field].replace(/\s+/g, " "));
        expect(text).toHaveClass("whitespace-pre-line");
        expect(text).not.toHaveClass("truncate", "whitespace-nowrap", "line-clamp-1");
      }
    }
    expect(home.getByTestId("link-zeffy-home").parentElement).toHaveClass("flex", "flex-wrap");
    const user = await edit(revised);
    const form = screen.getByRole("button", { name: "Save membership" }).closest("form")!;
    expect(form.closest("section")).toHaveClass("p-5", "sm:p-8");
    expect(screen.getByRole("button", { name: "Cancel" }).parentElement).toHaveClass("flex", "flex-wrap");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
  });
});
