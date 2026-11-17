import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getListEventsQueryKey, type CommunityEvent } from "@workspace/api-client-react";
import Home from "./home";

const event = (id: number, date: string): CommunityEvent => ({
  id, date, title: `Gathering ${id}`, time: "5:00 PM", location: "Original hall",
  description: "Original details", category: "Community",
  zeffyUrl: "https://www.zeffy.com/en-US/ticketing/original",
});
let rows: CommunityEvent[];
let failEvents: boolean;

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return { ...render(<QueryClientProvider client={client}><Home /></QueryClientProvider>), client };
}

async function refreshEvents(client: QueryClient) {
  await act(async () => {
    await client.refetchQueries({ queryKey: getListEventsQueryKey() });
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2032, 0, 1, 12));
  failEvents = false;
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const json = (body: unknown) => new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
    });
    if (url === "/api/haas/events") {
      return failEvents ? new Response("Unavailable", { status: 503 }) : json(rows);
    }
    if (url === "/api/haas/pages" || url === "/api/haas/committee") return json([]);
    if (url === "/api/haas/membership") return json(null);
    throw new Error(`Unexpected request: ${url}`);
  }));
});
afterEach(() => vi.useRealTimers());

describe.each(["upcoming", "most-recent-past"] as const)("homepage %s event details", (entry) => {
  beforeEach(() => {
    rows = entry === "upcoming"
      ? [event(1, "2032-01-02"), event(2, "2032-01-03")]
      : [event(2, "2031-12-30"), event(1, "2031-12-31")];
  });

  it("updates the open dialog from refreshed data even when the event changes sections", async () => {
    const { client } = mount();
    if (entry === "most-recent-past") {
      await screen.findByTestId("empty-upcoming");
      expect(screen.getByText("Most recently")).toBeVisible();
      expect(screen.queryByTestId("card-event-2")).not.toBeInTheDocument();
    }
    await userEvent.click(await screen.findByTestId("card-event-1"));
    expect(screen.getByRole("dialog")).toHaveTextContent("Gathering 1");

    rows = rows.map((row) => row.id === 1 ? {
      ...row, title: "Updated gathering", date: entry === "upcoming" ? "2031-12-29" : "2032-03-15",
      time: "6:30 PM", location: "New community hall", category: "Spiritual",
      description: "Please use the new entrance.", zeffyUrl: "https://www.zeffy.com/en-US/ticketing/updated",
    } : row);
    await refreshEvents(client);

    await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("Updated gathering"));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByRole("heading", { name: "Updated gathering" })).toBeVisible();
    expect(dialog.getByText(entry === "upcoming" ? "Monday, December 29, 2031" : "Monday, March 15, 2032")).toBeVisible();
    for (const text of ["6:30 PM", "New community hall", "Spiritual", "Please use the new entrance."]) {
      expect(dialog.getByText(text)).toBeVisible();
    }
    expect(dialog.getByTestId("link-event-zeffy")).toHaveAttribute("href", "https://www.zeffy.com/en-US/ticketing/updated");
    expect(dialog.getByRole("link", { name: /@/ })).toHaveAttribute("href", expect.stringContaining("subject=Updated%20gathering"));
    expect(dialog.queryByText("Gathering 1")).not.toBeInTheDocument();

    // Removing registration must also remove the old payment destination.
    rows = rows.map((row) => row.id === 1 ? { ...row, zeffyUrl: "" } : row);
    await refreshEvents(client);
    await waitFor(() => expect(screen.queryByTestId("link-event-zeffy")).not.toBeInTheDocument());
    await userEvent.click(dialog.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    if (entry === "upcoming") {
      expect(screen.queryByTestId("card-event-1")).not.toBeInTheDocument();
    } else {
      expect(screen.getByTestId("card-event-1")).toHaveTextContent("Updated gathering");
      expect(screen.queryByText("Most recently")).not.toBeInTheDocument();
    }
  });

  it("closes deleted details and does not reopen them when the event returns", async () => {
    const { client } = mount();
    await userEvent.click(await screen.findByTestId("card-event-1"));
    const previousRows = rows;
    rows = rows.filter((row) => row.id !== 1);
    await refreshEvents(client);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByTestId("card-event-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("card-event-2")).toBeVisible();

    rows = previousRows;
    await refreshEvents(client);
    await screen.findByTestId("card-event-1");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("card-event-1"));
    expect(screen.getByRole("dialog")).toHaveTextContent("Gathering 1");

    rows = [];
    await refreshEvents(client);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("empty-upcoming")).toBeVisible();
  });

  it("keeps the selected event through a failed refresh and updates it on recovery", async () => {
    const { client } = mount();
    await userEvent.click(await screen.findByTestId("card-event-1"));
    failEvents = true;
    await refreshEvents(client);
    await waitFor(() => expect(client.getQueryState(getListEventsQueryKey())?.status).toBe("error"));
    expect(screen.getByRole("dialog")).toHaveTextContent("Gathering 1");

    failEvents = false;
    rows = rows.map((row) => row.id === 1 ? { ...row, title: "Recovered gathering" } : row);
    await refreshEvents(client);
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("Recovered gathering"));
  });
});
