import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getListEventsQueryKey, type CommunityEvent } from "@workspace/api-client-react";
import Events from "./events";

vi.mock("@/components/site-layout", () => ({
  PageHero: ({ title, children }: { title: ReactNode; children: ReactNode }) => <header><h1>{title}</h1>{children}</header>,
}));

const event = (id: number, date: string): CommunityEvent => ({
  id, date, title: `Gathering ${date}`, time: "", location: "", description: "", category: "Community",
});
let rows: CommunityEvent[];

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return { ...render(<QueryClientProvider client={client}><Events /></QueryClientProvider>), client };
}

async function refreshEvents(client: QueryClient) {
  await act(async () => {
    await client.refetchQueries({ queryKey: getListEventsQueryKey() });
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2032, 0, 1, 0, 30));
  rows = [event(1, "2032-01-02"), event(2, "2031-12-31"), event(3, "2032-01-01"), event(4, "2031-12-30")];
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(rows), {
    headers: { "content-type": "application/json" },
  })));
});
afterEach(() => vi.useRealTimers());

describe("event loading error recovery", () => {
  it("keeps the visitor's calendar month after a failed background refresh and retry", async () => {
    const { client } = mount();
    await screen.findByTestId("card-event-1");
    await userEvent.click(screen.getByTestId("button-view-calendar"));
    await userEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByTestId("text-month")).toHaveTextContent("December 2031");

    vi.mocked(fetch).mockRejectedValueOnce(new Error("Temporarily offline"));
    await refreshEvents(client);
    expect(await screen.findByTestId("button-retry")).toBeVisible();
    expect(client.getQueryState(getListEventsQueryKey())?.status).toBe("error");
    expect(screen.queryByTestId("empty-upcoming")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("button-retry"));
    await waitFor(() => expect(screen.queryByTestId("button-retry")).not.toBeInTheDocument());
    expect(screen.getByTestId("text-month")).toHaveTextContent("December 2031");
    expect(screen.getByTestId("button-cal-event-2")).toBeVisible();
  });

  it.each(["list", "calendar"] as const)("does not treat a failed refresh as deletion of details opened from the %s", async (view) => {
    const { client } = mount();
    await screen.findByTestId("card-event-2");
    if (view === "calendar") {
      await userEvent.click(screen.getByTestId("button-view-calendar"));
      await userEvent.click(screen.getByRole("button", { name: "Previous month" }));
    }
    await userEvent.click(screen.getByTestId(view === "calendar" ? "button-cal-event-2" : "card-event-2"));

    vi.mocked(fetch).mockRejectedValueOnce(new Error("Temporarily offline"));
    await refreshEvents(client);
    expect(await screen.findByTestId("button-retry")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent("Gathering 2031-12-31");
    expect(screen.queryByTestId("empty-upcoming")).not.toBeInTheDocument();

    rows = rows.map((row) => row.id === 2 ? { ...row, title: "Recovered gathering" } : row);
    await refreshEvents(client);
    expect(await screen.findByRole("heading", { name: "Recovered gathering" })).toBeVisible();
    expect(screen.queryByTestId("button-retry")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    if (view === "calendar") {
      expect(screen.getByTestId("text-month")).toHaveTextContent("December 2031");
    }
  });
});

describe("open event details after a refresh", () => {
  it.each(["list", "calendar"] as const)("updates all details opened from the %s without resetting the calendar month", async (view) => {
    const { client } = mount();
    await screen.findByTestId("card-event-2");
    if (view === "calendar") {
      await userEvent.click(screen.getByTestId("button-view-calendar"));
      await userEvent.click(screen.getByRole("button", { name: "Previous month" }));
      expect(screen.getByTestId("text-month")).toHaveTextContent("December 2031");
    }
    await userEvent.click(screen.getByTestId(view === "calendar" ? "button-cal-event-2" : "card-event-2"));
    expect(screen.getByRole("dialog")).toHaveTextContent("Gathering 2031-12-31");

    rows = rows.map((row) => row.id === 2 ? {
      ...row, title: "Updated gathering", date: "2032-03-15", time: "6:30 PM",
      location: "New community hall", category: "Spiritual", description: "Please use the new entrance.",
    } : row);
    await refreshEvents(client);

    await screen.findByRole("heading", { name: "Updated gathering" });
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByRole("heading", { name: "Updated gathering" })).toBeVisible();
    expect(dialog.getByText("Monday, March 15, 2032")).toBeVisible();
    expect(dialog.getByText("6:30 PM")).toBeVisible();
    expect(dialog.getByText("New community hall")).toBeVisible();
    expect(dialog.getByText("Spiritual")).toBeVisible();
    expect(dialog.getByText("Please use the new entrance.")).toBeVisible();
    expect(dialog.getByRole("link")).toHaveAttribute("href", expect.stringContaining("subject=Updated%20gathering"));
    expect(dialog.queryByText("Gathering 2031-12-31")).not.toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "Close" }));
    if (view === "calendar") {
      expect(screen.getByTestId("text-month")).toHaveTextContent("December 2031");
      expect(screen.queryByTestId("button-cal-event-2")).not.toBeInTheDocument();
    } else {
      expect(screen.getByTestId("card-event-2")).toHaveTextContent("Updated gathering");
    }
  });

  it.each(["list", "calendar"] as const)("closes deleted details opened from the %s without resetting the calendar month", async (view) => {
    const { client } = mount();
    await screen.findByTestId("card-event-2");
    if (view === "calendar") {
      await userEvent.click(screen.getByTestId("button-view-calendar"));
      await userEvent.click(screen.getByRole("button", { name: "Previous month" }));
    }
    await userEvent.click(screen.getByTestId(view === "calendar" ? "button-cal-event-2" : "card-event-2"));
    expect(screen.getByRole("dialog")).toBeVisible();
    const previousRows = rows;
    rows = [];
    await refreshEvents(client);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    if (view === "calendar") {
      expect(screen.getByTestId("text-month")).toHaveTextContent("December 2031");
      expect(screen.queryByTestId("button-cal-event-2")).not.toBeInTheDocument();
    } else {
      expect(screen.queryByTestId("card-event-2")).not.toBeInTheDocument();
      expect(screen.getByTestId("empty-upcoming")).toBeVisible();
    }

    // A later response must not reopen a selection that deletion already cleared.
    rows = previousRows;
    await refreshEvents(client);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    if (view === "calendar") {
      expect(screen.getByTestId("text-month")).toHaveTextContent("December 2031");
      await userEvent.click(await screen.findByTestId("button-cal-event-2"));
    } else {
      await userEvent.click(await screen.findByTestId("card-event-2"));
    }
    expect(screen.getByRole("dialog")).toHaveTextContent("Gathering 2031-12-31");
  });
});
describe("public event dates", () => {
  it("orders past and upcoming sections across New Year, including today as upcoming", async () => {
    mount();
    await screen.findByTestId("card-event-1");
    const upcoming = screen.getByRole("heading", { name: "Upcoming" }).closest("section")!;
    const past = screen.getByRole("heading", { name: "Past events" }).closest("section")!;
    expect(within(upcoming).getAllByRole("button").map((el) => el.dataset.testid)).toEqual(["card-event-3", "card-event-1"]);
    expect(within(past).getAllByRole("button").map((el) => el.dataset.testid)).toEqual(["card-event-2", "card-event-4"]);
    await userEvent.click(screen.getByTestId("card-event-3"));
    expect(screen.getByRole("dialog")).toHaveTextContent("Thursday, January 1, 2032");
  });

  it("places events on their exact calendar cells and navigates across a year boundary", async () => {
    mount();
    await screen.findByTestId("card-event-1");
    await userEvent.click(screen.getByTestId("button-view-calendar"));
    expect(screen.getByTestId("text-month")).toHaveTextContent("January 2032");
    const today = screen.getByTestId("button-cal-event-3");
    expect(today.parentElement?.parentElement?.firstElementChild).toHaveTextContent(/^1$/);
    expect(today).toHaveClass("text-primary");
    expect(screen.getByTestId("button-cal-event-2")).toHaveClass("text-muted-foreground");
    await userEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByTestId("text-month")).toHaveTextContent("December 2031");
    expect(screen.getByTestId("button-cal-event-2").parentElement?.parentElement?.firstElementChild).toHaveTextContent(/^31$/);
    await userEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByTestId("text-month")).toHaveTextContent("January 2032");
  });

  it("renders February 29 in the calendar and opens the same leap-day details as the list", async () => {
    rows = [event(9, "2032-02-29")];
    vi.setSystemTime(new Date(2032, 1, 29, 23, 30));
    mount();
    await userEvent.click(await screen.findByTestId("card-event-9"));
    expect(screen.getByRole("dialog")).toHaveTextContent("Sunday, February 29, 2032");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByTestId("button-view-calendar"));
    expect(screen.getByTestId("text-month")).toHaveTextContent("February 2032");
    const leap = screen.getByTestId("button-cal-event-9");
    expect(leap.parentElement?.parentElement?.firstElementChild).toHaveTextContent(/^29$/);
    await userEvent.click(leap);
    expect(screen.getByRole("dialog")).toHaveTextContent("Sunday, February 29, 2032");
  });

  it("starts at the most recent past event when there are no upcoming dates", async () => {
    rows = [event(1, "2031-11-30"), event(2, "2031-12-31")];
    mount();
    await screen.findByTestId("card-event-1");
    expect(screen.getByTestId("empty-upcoming")).toBeVisible();
    await userEvent.click(screen.getByTestId("button-view-calendar"));
    expect(screen.getByTestId("text-month")).toHaveTextContent("December 2031");
  });
});
