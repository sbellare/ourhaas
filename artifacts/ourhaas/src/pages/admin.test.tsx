import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityEvent } from "@workspace/api-client-react";
import Admin from "./admin";
import Events from "./events";

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
// The site shell is unrelated to management; keep the real admin, event
// components, calendar, forms, generated API hooks and query invalidation.
vi.mock("@/components/site-layout", () => ({
  PageHero: ({ title, children }: { title: ReactNode; children: ReactNode }) => <header><h1>{title}</h1>{children}</header>,
}));

const seed: CommunityEvent = {
  id: 42, title: "Existing test gathering", date: "2030-06-15",
  time: "6:00 PM", location: "Test hall", description: "Original details", category: "Community",
};
let status: { signedIn: boolean; isAdmin: boolean };
let rows: CommunityEvent[];
let calls: Array<{ url: string; method: string; body: unknown }>;
let failure: "access" | "save" | "delete" | null;

function mount(page: ReactNode = <Admin />) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const view = render(<QueryClientProvider client={client}>{page}</QueryClientProvider>);
  return { ...view, client };
}

beforeEach(() => {
  status = { signedIn: true, isAdmin: true };
  rows = [structuredClone(seed)];
  calls = [];
  failure = null;
  // Replace HTTP only, not the generated hooks. This catches wrong payloads,
  // URLs, missing invalidation and form/reset bugs without real credentials.
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url, method, body });
    const json = (value: unknown, code = 200) => new Response(JSON.stringify(value), {
      status: code, headers: { "content-type": "application/json" },
    });
    if (url === "/api/haas/admin") {
      return failure === "access" ? json({ error: "Unavailable" }, 500) : json(status);
    }
    if (url === "/api/haas/committee") return json([]);
    if (url === "/api/haas/events" && method === "GET") return json(rows);
    if (url.startsWith("/api/haas/events") && method !== "GET") {
      if (!status.signedIn) return json({ error: "Sign in" }, 401);
      if (!status.isAdmin) return json({ error: "Restricted" }, 403);
      if ((failure === "save" && method !== "DELETE") || (failure === "delete" && method === "DELETE")) {
        return json({ error: "Storage unavailable" }, 500);
      }
      if (url === "/api/haas/events" && method === "POST") {
        const saved = { ...body, id: 43 } as CommunityEvent;
        rows.push(saved);
        return json(saved, 201);
      }
      if (url === "/api/haas/events/42" && method === "PUT") {
        rows = rows.map((e) => e.id === 42 ? { ...body, id: 42 } : e);
        return json(rows.find((e) => e.id === 42));
      }
      if (url === "/api/haas/events/42" && method === "DELETE") {
        rows = rows.filter((e) => e.id !== 42);
        return new Response(null, { status: 204 });
      }
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  }));
});

afterEach(() => vi.useRealTimers());

describe("event calendar dates", () => {
  beforeEach(() => {
    // Freeze only Date so user events, React Query and Radix use real timers.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2032, 1, 1, 12));
  });

  async function pickDay(label: RegExp) {
    await userEvent.click(screen.getByTestId("button-date-picker"));
    await userEvent.click(screen.getByRole("button", { name: label }));
  }

  it.each([
    ["0000-02-29", "Tuesday, February 29, 0000", /Tuesday, February 29th, 0000/],
    ["0001-06-15", "Friday, June 15, 0001", /Friday, June 15th, 0001/],
    ["0099-12-31", "Thursday, December 31, 0099", /Thursday, December 31st, 0099/],
  ] as const)("preserves early event date %s through selection, save and reopening", async (day, display, label) => {
    rows = [{ ...seed, date: day }];
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByTestId("button-edit-42"));
    expect(screen.getByTestId("button-date-picker")).toHaveTextContent(display);
    await user.click(screen.getByTestId("button-date-picker"));
    const selectedDay = screen.getByRole("button", { name: label });
    expect(selectedDay).toHaveAttribute("data-selected-single", "true");
    expect(document.querySelector(".rdp-caption_label")).toHaveTextContent(day.slice(0, 4));
    // Select a different day and return, exercising the real onSelect handler.
    await user.click(screen.getByRole("button", { name: /, (February|June|December) 14th,/ }));
    await pickDay(label);
    expect(screen.getByTestId("button-date-picker")).toHaveTextContent(display);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(calls.find((call) => call.method === "PUT")?.body).toMatchObject({ date: day });
    cleanup();
    mount();
    await user.click(await screen.findByTestId("button-edit-42"));
    expect(screen.getByTestId("button-date-picker")).toHaveTextContent(display);
    await user.click(screen.getByTestId("button-date-picker"));
    expect(screen.getByRole("button", { name: label })).toHaveAttribute("data-selected-single", "true");
    cleanup();
    mount(<Events />);
    const card = await screen.findByTestId("card-event-42");
    expect(card).toHaveTextContent(day.slice(0, 4));
    await user.click(card);
    expect(screen.getByRole("dialog")).toHaveTextContent(display);
  });

  it("creates the selected leap day and refreshes an already mounted public list", async () => {
    const user = userEvent.setup();
    mount(<><Admin /><div data-testid="public-events"><Events /></div></>);
    const publicPage = screen.getByTestId("public-events");
    await within(publicPage).findByTestId("card-event-42");
    await user.click(await screen.findByRole("button", { name: /New event/ }));
    await user.type(screen.getByLabelText("Title"), "  Leap day gathering  ");
    await pickDay(/Sunday, February 29th, 2032/);
    expect(screen.getByTestId("button-date-picker")).toHaveTextContent("Sunday, February 29, 2032");
    await user.click(screen.getByRole("button", { name: "Add event" }));
    expect(await within(publicPage).findByTestId("card-event-43")).toHaveTextContent("Leap day gathering");
    expect(calls.find((call) => call.method === "POST")?.body).toMatchObject({ title: "Leap day gathering", date: "2032-02-29" });
    await user.click(within(publicPage).getByTestId("card-event-43"));
    expect(screen.getByRole("dialog")).toHaveTextContent("Sunday, February 29, 2032");
  });

  it("edits across New Year, discards cancelled dates, and reopens the saved date", async () => {
    rows = [{ ...seed, date: "2031-12-31" }];
    const user = userEvent.setup();
    mount(<><Admin /><div data-testid="public-events"><Events /></div></>);
    const publicPage = screen.getByTestId("public-events");
    await within(publicPage).findByTestId("card-event-42");
    await user.click(await screen.findByTestId("button-edit-42"));
    expect(screen.getByTestId("button-date-picker")).toHaveTextContent("Wednesday, December 31, 2031");
    await user.click(screen.getByTestId("button-date-picker"));
    await user.click(screen.getByRole("button", { name: "Go to the Next Month" }));
    await user.click(screen.getByRole("button", { name: /Thursday, January 1st, 2032/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(calls.some((call) => call.method === "PUT")).toBe(false);
    await user.click(screen.getByTestId("button-edit-42"));
    expect(screen.getByTestId("button-date-picker")).toHaveTextContent("Wednesday, December 31, 2031");
    await user.click(screen.getByTestId("button-date-picker"));
    expect(screen.getByRole("button", { name: /Wednesday, December 31st, 2031/ })).toHaveAttribute("data-selected-single", "true");
    await user.click(screen.getByRole("button", { name: "Go to the Next Month" }));
    await user.click(screen.getByRole("button", { name: /Thursday, January 1st, 2032/ }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(calls.find((call) => call.method === "PUT")?.body).toMatchObject({ date: "2032-01-01" });
    await waitFor(() => expect(within(publicPage).getByTestId("card-event-42")).toHaveTextContent("Jan1"));
    await user.click(screen.getByTestId("button-edit-42"));
    expect(screen.getByTestId("button-date-picker")).toHaveTextContent("Thursday, January 1, 2032");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(within(publicPage).getByTestId("card-event-42"));
    expect(screen.getByRole("dialog")).toHaveTextContent("Thursday, January 1, 2032");
  });

  it("requires a date and resets an unsaved new event when cancelled", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: /New event/ }));
    await user.type(screen.getByLabelText("Title"), "Unsaved gathering");
    await user.click(screen.getByRole("button", { name: "Add event" }));
    expect(await screen.findByText("Pick a date")).toBeVisible();
    expect(calls.some((call) => call.method === "POST")).toBe(false);
    await pickDay(/Sunday, February 29th, 2032/);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: /New event/ }));
    expect(screen.getByLabelText("Title")).toHaveValue("");
    expect(screen.getByTestId("button-date-picker")).toHaveTextContent("Choose a date on the calendar");
  });

  it("does not offer February 29 in a non-leap year", async () => {
    vi.setSystemTime(new Date(2031, 1, 1, 12));
    mount();
    await userEvent.click(await screen.findByRole("button", { name: /New event/ }));
    await userEvent.click(screen.getByTestId("button-date-picker"));
    expect(screen.getByRole("button", { name: /Friday, February 28th, 2031/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /February 29/ })).not.toBeInTheDocument();
  });
});

describe("administrator access states", () => {
  it("offers sign-in without exposing management to signed-out visitors", async () => {
    status = { signedIn: false, isAdmin: false };
    mount();
    expect(await screen.findByText("Committee sign in")).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    expect(screen.queryByRole("button", { name: /New event/ })).not.toBeInTheDocument();
    expect(calls.map((c) => c.url)).toEqual(["/api/haas/admin"]);
  });

  it("restricts signed-in accounts rejected by server authorization", async () => {
    status = { signedIn: true, isAdmin: false };
    mount();
    expect(await screen.findByText("Access restricted")).toBeVisible();
    expect(screen.getByRole("link", { name: "View public events" })).toHaveAttribute("href", "/events");
    expect(screen.queryByRole("button", { name: /New event/ })).not.toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });

  it("fails closed and lets the user retry an unavailable access check", async () => {
    failure = "access";
    mount();
    expect(await screen.findByText("We couldn't load your access status.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /New event/ })).not.toBeInTheDocument();
    failure = null;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Manage the calendar" })).toBeVisible();
  });
});

describe("signed-in event management", () => {
  it("creates through the calendar form and refreshes the event list", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: /New event/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByTestId("select-category")).toHaveTextContent("Spiritual");
    await user.type(within(dialog).getByLabelText("Title"), "New regression gathering");
    await user.click(within(dialog).getByTestId("button-date-picker"));
    // Choose a day in the currently displayed month via the real date picker.
    const day = document.querySelector<HTMLButtonElement>("button[data-day]:not([data-outside='true'])");
    expect(day).not.toBeNull();
    await user.click(day!);
    await user.type(within(dialog).getByLabelText("Time"), "7:00 PM");
    await user.type(within(dialog).getByLabelText("Location"), "Community hall");
    await user.type(within(dialog).getByLabelText("Description"), "New details");
    await user.click(within(dialog).getByRole("button", { name: "Add event" }));
    expect(await screen.findByText("New regression gathering")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const creation = calls.find((c) => c.method === "POST");
    expect(creation).toEqual({
      url: "/api/haas/events", method: "POST",
      body: {
        title: "New regression gathering", date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        time: "7:00 PM", location: "Community hall", description: "New details", category: "Spiritual",
        zeffyUrl: "",
      },
    });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Event added" }));
    expect(calls.filter((c) => c.url === "/api/haas/events" && c.method === "GET").length).toBeGreaterThan(1);
  });

  it("keeps saved edits after remount and renders them in public event details", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    let dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Title")).toHaveValue(seed.title);
    expect(within(dialog).getByTestId("select-category")).toHaveTextContent("Community");
    await user.clear(within(dialog).getByLabelText("Title"));
    await user.type(within(dialog).getByLabelText("Title"), "Updated gathering");
    await user.clear(within(dialog).getByLabelText("Location"));
    await user.clear(within(dialog).getByLabelText("Description"));
    await user.type(within(dialog).getByLabelText("Description"), "Updated public details");
    const zeffyUrl = "https://www.zeffy.com/en-US/ticketing/event-registration";
    await user.type(within(dialog).getByTestId("input-event-zeffy"), zeffyUrl);
    await user.click(within(dialog).getByTestId("select-category"));
    await user.click(screen.getByRole("option", { name: "Cultural" }));
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Updated gathering")).toBeVisible();
    expect(calls.find((c) => c.method === "PUT")).toEqual({
      url: "/api/haas/events/42", method: "PUT",
      body: {
        title: "Updated gathering", date: seed.date, time: seed.time,
        location: "", description: "Updated public details", category: "Cultural",
        zeffyUrl,
      },
    });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Event updated" }));

    cleanup();
    mount();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Title")).toHaveValue("Updated gathering");
    expect(within(dialog).getByLabelText("Location")).toHaveValue("");
    expect(within(dialog).getByLabelText("Description")).toHaveValue("Updated public details");
    expect(within(dialog).getByTestId("input-event-zeffy")).toHaveValue(zeffyUrl);
    expect(within(dialog).getByTestId("select-category")).toHaveTextContent("Cultural");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: /New event/ }));
    expect(within(screen.getByRole("dialog")).getByLabelText("Title")).toHaveValue("");

    cleanup();
    status = { signedIn: false, isAdmin: false };
    mount(<Events />);
    await user.click(await screen.findByTestId("card-event-42"));
    expect(screen.getByTestId("text-event-title")).toHaveTextContent("Updated gathering");
    expect(within(screen.getByRole("dialog")).getByText("Updated public details")).toBeVisible();
    const paymentLink = screen.getByRole("link", { name: /Pay \/ Register with Zeffy/ });
    expect(paymentLink).toHaveAttribute("href", zeffyUrl);
    expect(paymentLink).toHaveAttribute("target", "_blank");
    expect(paymentLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("rejects non-Zeffy links, discards unsaved changes, and removes cleared payment links", async () => {
    const user = userEvent.setup();
    rows[0].zeffyUrl = "https://www.zeffy.com/en-US/ticketing/original-event";
    mount();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const input = screen.getByTestId("input-event-zeffy");
    await user.clear(input);
    await user.type(input, "https://example.com/not-zeffy");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Use a full HTTPS Zeffy form link, or leave this blank.")).toBeVisible();
    expect(calls.some((call) => call.method === "PUT")).toBe(false);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByTestId("input-event-zeffy")).toHaveValue(rows[0].zeffyUrl);
    await user.clear(screen.getByTestId("input-event-zeffy"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(calls.find((call) => call.method === "PUT")?.body).toMatchObject({ zeffyUrl: "" });
    cleanup();
    mount(<Events />);
    await user.click(await screen.findByTestId("card-event-42"));
    expect(screen.queryByTestId("link-event-zeffy")).not.toBeInTheDocument();
  });

  it("requires confirmation, preserves cancelled deletes and refreshes after deletion", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(seed.title);
    await user.click(screen.getByRole("button", { name: "Keep it" }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    expect(screen.getByText(seed.title)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByTestId("button-confirm-delete"));
    await waitFor(() => expect(screen.queryByText(seed.title)).not.toBeInTheDocument());
    expect(calls.find((c) => c.method === "DELETE")?.url).toBe("/api/haas/events/42");
    expect(toast).toHaveBeenCalledWith({ title: "Event deleted" });
    cleanup();
    mount(<Events />);
    expect(await screen.findByText("No past events recorded yet.")).toBeVisible();
    expect(screen.queryByTestId("card-event-42")).not.toBeInTheDocument();
  });

  it.each(["", "   ", "\u00a0\u2003"])("does not submit a blank title %j", async (title) => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.clear(screen.getByLabelText("Title"));
    if (title) await user.type(screen.getByLabelText("Title"), title);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Title is required")).toBeVisible();
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("saves a reopened event without requiring the category to be selected again", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.getByTestId("select-category")).toHaveTextContent("Community");
    await user.type(screen.getByLabelText("Title"), " edited");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText(`${seed.title} edited`)).toBeVisible();
    expect(calls.find((c) => c.method === "PUT")?.body).toMatchObject({ category: "Community" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByTestId("select-category")).toHaveTextContent("Community");
  });

  it.each(["save", "delete"] as const)("reports a failed %s without showing false success", async (operation) => {
    const user = userEvent.setup();
    failure = operation;
    mount();
    if (operation === "save") {
      await user.click(await screen.findByRole("button", { name: "Edit" }));
      await user.type(screen.getByLabelText("Title"), " changed");
      await user.click(screen.getByRole("button", { name: "Save changes" }));
    } else {
      await user.click(await screen.findByRole("button", { name: "Delete" }));
      await user.click(screen.getByTestId("button-confirm-delete"));
    }
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: operation === "save" ? "Could not save" : "Could not delete", variant: "destructive",
    })));
    expect(rows).toEqual([seed]);
    expect(screen.getByTestId("row-admin-event-42")).toHaveTextContent(seed.title);
    if (operation === "save") expect(screen.getByRole("dialog")).toBeVisible();
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({
      title: operation === "save" ? "Event updated" : "Event deleted",
    }));
  });
});
