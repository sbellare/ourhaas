import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityEvent } from "@workspace/api-client-react";
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
  return render(<QueryClientProvider client={client}><Events /></QueryClientProvider>);
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
