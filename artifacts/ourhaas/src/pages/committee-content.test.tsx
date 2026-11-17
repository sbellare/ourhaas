import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Router, Route } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { COMMITTEE_TERM, COMMITTEE_TITLE } from "@workspace/haas-content";
import Home from "./home";
import { About } from "./info";
import { ResourcePage, Resources } from "./resources";

vi.mock("@/components/site-layout", () => ({
  PageHero: ({ title, children }: { title: ReactNode; children: ReactNode }) => <header><h1>{title}</h1>{children}</header>,
}));

const originalMembers = [
  { id: 1, role: "President", name: "Sachin Bellare" },
  { id: 2, role: "Secretary", name: "Sheetal Sashital" },
  { id: 3, role: "Vice President", name: "Prateek Karkal" },
  { id: 4, role: "Food", name: "Varun Chadarvarkar" },
  { id: 5, role: "Treasurer", name: "Rupa Rao Dominitz" },
  { id: 6, role: "Events", name: "Mahesh Sashital" },
];
let members: typeof originalMembers;

const committeePages = [
  {
    destination: "homepage", path: "/", element: <Home />, testId: "card-committee-",
    gridClasses: ["grid", "grid-cols-2", "md:grid-cols-3", "lg:grid-cols-6"],
  },
  {
    destination: "About page", path: "/about", element: <About />, testId: "card-member-",
    gridClasses: ["grid", "sm:grid-cols-2", "lg:grid-cols-3"],
  },
];

function mountCommitteePage(path: string, element: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const location = memoryLocation({ path });
  return render(<QueryClientProvider client={client}><Router hook={location.hook}>
    <Route path={path}>{element}</Route>
  </Router></QueryClientProvider>);
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Response>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  members = structuredClone(originalMembers);
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    if (url === "/api/haas/committee") return json(members);
    if (url === "/api/haas/admin") return json({ signedIn: false, isAdmin: false });
    if (url === "/api/haas/events") return json([]);
    if (url === "/api/haas/pages") return json([{
      slug: "present-haas-committee", title: COMMITTEE_TITLE,
      markdown: members.map((member) => `**${member.role}** — ${member.name}`).join("\n\n"),
      sourceUrl: "https://www.ourhaas.com/present-haas-committee/",
    }]);
    throw new Error(`Unexpected request: ${url}`);
  }));
});

describe("committee request recovery", () => {
  it.each(committeePages.flatMap((page) =>
    ["server error", "network failure"].map((failure) => ({ ...page, failure })),
  ))("recovers all six cards after a $failure on the $destination", async ({ path, element, testId, failure }) => {
    const initial = deferredResponse();
    const retried = deferredResponse();
    const requestCommittee = vi.fn()
      .mockImplementationOnce(() => initial.promise)
      .mockImplementationOnce(() => retried.promise);
    const defaultFetch = fetch;
    vi.stubGlobal("fetch", vi.fn((input: string | URL | Request, init?: RequestInit) =>
      String(input) === "/api/haas/committee"
        ? requestCommittee()
        : defaultFetch(input, init),
    ));

    mountCommitteePage(path, element);
    const loading = screen.getByText("Loading committee…");
    // Scope to committee cards: Home has other independently loaded sections.
    expect(loading).toHaveAttribute("role", "status");
    const committee = within(loading.closest("section")!);
    const cardPattern = new RegExp(`^${testId}\\d+$`);
    expect(committee.queryAllByTestId(cardPattern)).toHaveLength(0);
    expect(committee.queryByText("We couldn't load committee members.")).not.toBeInTheDocument();
    expect(requestCommittee).toHaveBeenCalledTimes(1);

    await act(async () => {
      if (failure === "network failure") {
        initial.reject(new TypeError("Failed to fetch"));
      } else {
        initial.resolve(new Response(JSON.stringify({ error: "Service unavailable" }), {
          status: 503, headers: { "content-type": "application/json" },
        }));
      }
    });

    expect(await committee.findByText("We couldn't load committee members.")).toBeVisible();
    expect(committee.queryByRole("status")).not.toBeInTheDocument();
    expect(committee.queryAllByTestId(cardPattern)).toHaveLength(0);
    const retry = committee.getByRole("button", { name: "Try again" });
    expect(retry).toBeEnabled();
    expect(requestCommittee).toHaveBeenCalledTimes(1);

    fireEvent.click(retry);
    await waitFor(() => expect(requestCommittee).toHaveBeenCalledTimes(2));
    expect(committee.queryAllByTestId(cardPattern)).toHaveLength(0);
    await act(async () => {
      retried.resolve(new Response(JSON.stringify(originalMembers), {
        headers: { "content-type": "application/json" },
      }));
    });

    expect(await committee.findAllByTestId(cardPattern)).toHaveLength(6);
    for (const [index, member] of originalMembers.entries()) {
      const card = committee.getByTestId(`${testId}${index}`);
      expect(within(card).getByText(member.role, { exact: true })).toBeVisible();
      expect(within(card).getByText(member.name, { exact: true })).toBeVisible();
    }
    expect(committee.queryByText("We couldn't load committee members.")).not.toBeInTheDocument();
    expect(committee.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(committee.queryByRole("status")).not.toBeInTheDocument();
    expect(requestCommittee).toHaveBeenCalledTimes(2);
  });
});

describe("committee layout regression", () => {
  // jsdom does not calculate layout. Assert the production Tailwind contract
  // instead of pretending that changing window.innerWidth measures clipping.
  // Phone (320–390px): Home 2 columns, About 1; desktop (1280px): Home 6, About 3.
  // Run: pnpm --filter @workspace/ourhaas exec vitest run src/pages/committee-content.test.tsx
  it.each(committeePages)(
    "keeps six unique role/name pairs in the phone and desktop grid on the $destination",
    async ({ path, element, testId, gridClasses }) => {
      mountCommitteePage(path, element);
      await screen.findByText("Rupa Rao Dominitz");

      const cards = screen.getAllByTestId(new RegExp(`^${testId}\\d+$`));
      expect(cards).toHaveLength(6);
      const grid = cards[0].parentElement!;
      expect(grid).toHaveClass(...gridClasses);
      if (path === "/about") {
        // No unprefixed column utility: About stays single-column on phones.
        expect([...grid.classList].filter((token) => /^grid-cols-/.test(token))).toEqual([]);
      }

      const renderedPairs = cards.map((card) => {
        const labels = card.querySelectorAll("p");
        expect(labels).toHaveLength(2);
        expect(card.querySelector("img, picture")).not.toBeInTheDocument();
        return { role: labels[0].textContent, name: labels[1].textContent };
      });
      expect(new Set(renderedPairs.map((pair) => pair.name)).size).toBe(6);
      expect(new Set(renderedPairs.map((pair) => pair.role)).size).toBe(6);
      expect(renderedPairs).toEqual(originalMembers.map(({ role, name }) => ({ role, name })));
    },
  );

  it.each(committeePages)(
    "preserves shrink and wrapping safeguards for long names on the $destination",
    async ({ path, element, testId }) => {
      mountCommitteePage(path, element);
      await screen.findByText("Varun Chadarvarkar");

      for (const member of originalMembers) {
        const name = screen.getByText(member.name, { exact: true });
        const card = name.closest<HTMLElement>(`[data-testid^="${testId}"]`)!;
        expect(card).not.toBeNull();
        expect(name).toHaveClass("break-words");
        expect(name.closest(".min-w-0")).not.toBeNull();
        if (path === "/") {
          expect(card).toHaveClass("min-w-0");
        } else {
          expect(name.parentElement).toHaveClass("min-w-0");
          expect(card).toHaveClass("flex");
          expect(card.firstElementChild).toHaveClass("shrink-0");
        }
        // A wrapping name can still be cut off by its card, grid or section.
        for (let node: HTMLElement | null = name; node; node = node.parentElement) {
          expect([...node.classList].filter((token) =>
            /^(?:(?:sm|md|lg|xl|2xl):)*(?:truncate|whitespace-nowrap|text-ellipsis|line-clamp-.+|overflow(?:-[xy])?-(?:hidden|clip)|(?:max-)?h-.+)$/.test(token),
          )).toEqual([]);
          if (node.tagName === "SECTION") break;
        }
      }
    },
  );
});

describe("committee destinations", () => {
  it.each([
    { destination: "homepage", path: "/", element: <Home />, testId: "card-committee-" },
    { destination: "About page", path: "/about", element: <About />, testId: "card-member-" },
    { destination: "committee resource", path: "/resources/present-haas-committee", element: <ResourcePage />, testId: null },
  ])("shows the current names, roles and term on the $destination", async ({ path, element, testId }) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const location = memoryLocation({ path });
    render(<QueryClientProvider client={client}><Router hook={location.hook}>
      <Route path={testId ? path : "/resources/:slug"}>{element}</Route>
    </Router></QueryClientProvider>);
    await screen.findByText("Rupa Rao Dominitz", { exact: false });
    expect(screen.getAllByText(`Committee ${COMMITTEE_TERM}`, { exact: false }).length).toBeGreaterThan(0);
    for (const [index, member] of members.entries()) {
      const container = testId
        ? screen.getByTestId(`${testId}${index}`)
        : screen.getByTestId("content-markdown");
      expect(container).toHaveTextContent(member.name);
      expect(container).toHaveTextContent(member.role);
    }
    if (!testId) {
      expect(screen.getByRole("link", { name: /Original page/ })).toHaveAttribute("href", "https://www.ourhaas.com/present-haas-committee/");
    }
    members[4] = { ...members[4], name: "Updated treasurer" };
    await act(async () => { await client.invalidateQueries(); });
    expect(await screen.findByText("Updated treasurer", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText("Rupa Rao Dominitz", { exact: false })).not.toBeInTheDocument();
  });

  it("includes the complete committee in resource search and excerpts", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(<QueryClientProvider client={client}><Resources /></QueryClientProvider>);
    const card = await screen.findByTestId("card-resource-present-haas-committee");
    expect(within(card).getByRole("heading", { name: COMMITTEE_TITLE })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search pages" }), { target: { value: "Mahesh Sashital" } });
    expect(screen.getByTestId("card-resource-present-haas-committee")).toBeInTheDocument();
    expect(card).toHaveAttribute("href", "/resources/present-haas-committee");
  });
});
