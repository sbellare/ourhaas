import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventPaymentsEditor } from "./event-payments-editor";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  pending: false,
  pages: [] as Array<{ slug: string; title: string; markdown: string; sourceUrl: string }>,
}));
vi.mock("@workspace/api-client-react", () => ({
  useListContentPages: () => ({ data: mocks.pages, isLoading: false, isError: false }),
  getListContentPagesQueryKey: () => ["/api/haas/pages"],
  useUpdateContentPage: () => ({ mutate: mocks.mutate, isPending: mocks.pending }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

beforeEach(() => {
  mocks.mutate.mockReset();
  mocks.pending = false;
  mocks.pages = [{ slug: "event-payments", title: "Event Payments", markdown: "Original instructions", sourceUrl: "https://www.ourhaas.com/event-payments/" }];
});

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = () => <QueryClientProvider client={qc}><EventPaymentsEditor /></QueryClientProvider>;
  const rendered = render(view());
  fireEvent.click(screen.getByRole("button", { name: "Edit Event Payments" }));
  return { ...rendered, rerenderView: () => rendered.rerender(view()) };
}

describe("Event Payments editor", () => {
  it("loads existing content and cancels without saving", () => {
    setup();
    expect(screen.getByLabelText("Page title")).toHaveValue("Event Payments");
    expect(screen.getByLabelText("Page text")).toHaveValue("Original instructions");
    fireEvent.change(screen.getByLabelText("Page text"), { target: { value: "Unsaved instructions" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Page text")).not.toBeInTheDocument();
  });

  it("retains unfinished text when the public query refreshes", () => {
    const view = setup();
    fireEvent.change(screen.getByLabelText("Page text"), { target: { value: "My unfinished edits" } });
    mocks.pages = [{ ...mocks.pages[0], markdown: "Background refresh" }];
    view.rerenderView();
    expect(screen.getByLabelText("Page text")).toHaveValue("My unfinished edits");
  });

  it("sends title and Markdown to the intended page and prevents duplicate submissions", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Page title"), { target: { value: "  New title  " } });
    fireEvent.change(screen.getByLabelText("Page text"), { target: { value: " **Updated payment details** " } });
    const form = screen.getByRole("button", { name: "Save Event Payments" }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.mutate.mock.calls[0][0]).toEqual({ slug: "event-payments", data: { title: "New title", markdown: "**Updated payment details**" } });
  });

  it("keeps edits after a failed save and allows retry", () => {
    mocks.mutate.mockImplementation((_data, options) => {
      options.onError(new Error("Unavailable"));
      options.onSettled();
    });
    setup();
    fireEvent.change(screen.getByLabelText("Page text"), { target: { value: "Keep these edits" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Event Payments" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Your edits are kept");
    expect(screen.getByLabelText("Page text")).toHaveValue("Keep these edits");
    fireEvent.click(screen.getByRole("button", { name: "Save Event Payments" }));
    expect(mocks.mutate).toHaveBeenCalledTimes(2);
  });

  it("disables editing and cancellation while a save is pending", () => {
    const view = setup();
    mocks.pending = true;
    view.rerenderView();
    expect(screen.getByLabelText("Page text")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
