import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
