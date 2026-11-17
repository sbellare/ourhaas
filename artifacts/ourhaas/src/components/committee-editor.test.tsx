import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getListCommitteeQueryKey,
  getListContentPagesQueryKey,
  useListCommittee,
  type CommitteeMember,
} from "@workspace/api-client-react";
import { CommitteeEditor } from "./committee-editor";

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

// Non-sequential IDs and editing the second row catch accidental index/first-row
// updates. Keep real generated HTTP hooks and React Query; replace only HTTP
// and the unrelated toast display.
const seed: CommitteeMember[] = [
  { id: 17, role: "President", name: "Original president" },
  { id: 42, role: "Secretary", name: "Original secretary" },
];
let rows: CommitteeMember[];
let calls: Array<{ url: string; method: string; body: unknown }>;
let failSave: boolean;
let listGate: Promise<void>;

function SharedCommittee() {
  const { data } = useListCommittee();
  return <section aria-label="Shared committee">
    {data?.map((member) => <p key={member.id}>{member.role}: {member.name}</p>)}
  </section>;
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const view = render(<QueryClientProvider client={client}>
    <CommitteeEditor />
    <SharedCommittee />
  </QueryClientProvider>);
  return { ...view, client };
}

const writes = () => calls.filter((call) => call.method !== "GET");
const sharedCommittee = () => within(screen.getByRole("region", { name: "Shared committee" }));

async function editSecretary(draft = "  Revised secretary  ") {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Edit Secretary name" }));
  const input = screen.getByRole("textbox", { name: "Secretary name" });
  expect(input).toHaveValue(seed[1].name);
  await user.clear(input);
  await user.type(input, draft);
  return { user, input };
}

beforeEach(() => {
  rows = structuredClone(seed);
  calls = [];
  failSave = false;
  listGate = Promise.resolve();
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url, method, body });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
      status, headers: { "content-type": "application/json" },
    });
    if (url === "/api/haas/committee" && method === "GET") {
      await listGate;
      return json(rows);
    }
    if (url === "/api/haas/committee/42" && method === "PATCH") {
      if (failSave) return json({ error: "Storage unavailable" }, 500);
      const saved = { ...rows[1], name: (body as { name: string }).name };
      rows[1] = saved;
      return json(saved);
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  }));
});

describe("committee name editing", () => {
  it("keeps the typed name after a failed save and retries the same member ID", async () => {
    failSave = true;
    const { client } = mount();
    const { user, input } = await editSecretary();
    await user.click(screen.getByRole("button", { name: "Save name" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save. Your changes are kept here.");
    expect(input).toHaveValue("  Revised secretary  ");
    expect(input).toBeEnabled();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Save name" })).toBeEnabled();
    expect(rows).toEqual(seed);
    expect(client.getQueryData(getListCommitteeQueryKey())).toEqual(seed);
    expect(sharedCommittee().getByText("Secretary: Original secretary")).toBeVisible();
    expect(toast).not.toHaveBeenCalled();
    expect(writes()).toEqual([{
      url: "/api/haas/committee/42", method: "PATCH", body: { name: "Revised secretary" },
    }]);

    failSave = false;
    // No retyping or reopening: the retained draft must be the retry payload.
    await user.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
    expect(writes()).toEqual(Array.from({ length: 2 }, () => ({
      url: "/api/haas/committee/42", method: "PATCH", body: { name: "Revised secretary" },
    })));
    expect(sharedCommittee().getByText("Secretary: Revised secretary")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("discards cancelled edits and reopens the saved name after failure=%s", async (failed) => {
    failSave = failed;
    const { client } = mount();
    const { user } = await editSecretary("Unsaved draft");
    if (failed) {
      await user.click(screen.getByRole("button", { name: "Save name" }));
      await screen.findByRole("alert");
    }
    const previousWrites = [...writes()];
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("admin-committee-42")).toHaveTextContent(seed[1].name);
    expect(sharedCommittee().getByText("Secretary: Original secretary")).toBeVisible();
    expect(client.getQueryData(getListCommitteeQueryKey())).toEqual(seed);
    expect(rows).toEqual(seed);
    expect(writes()).toEqual(previousWrites);
    expect(toast).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Edit Secretary name" }));
    expect(screen.getByRole("textbox", { name: "Secretary name" })).toHaveValue(seed[1].name);
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(writes()).toEqual(previousWrites);
  });

  it("updates the shared query immediately on success, preserving other members and roles", async () => {
    const { client } = mount();
    const { user } = await editSecretary();
    // Keep this inactive resource cached long enough to observe invalidation.
    client.setQueryDefaults(getListContentPagesQueryKey(), { gcTime: Infinity });
    client.setQueryData(getListContentPagesQueryKey(), []);
    const expected = [seed[0], { ...seed[1], name: "Revised secretary" }];
    // Hold the invalidation refetch to prove the mutation response updates the
    // existing shared cache, rather than relying on a later GET to hide a bug.
    let releaseList!: () => void;
    listGate = new Promise<void>((resolve) => { releaseList = resolve; });
    try {
      await user.click(screen.getByRole("button", { name: "Save name" }));
      await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
      await waitFor(() => expect(sharedCommittee().getByText("Secretary: Revised secretary")).toBeVisible());
      expect(client.getQueryData(getListCommitteeQueryKey())).toEqual(expected);
      expect(client.getQueryState(getListCommitteeQueryKey())?.fetchStatus).toBe("fetching");
      expect(client.getQueryState(getListContentPagesQueryKey())?.isInvalidated).toBe(true);
      expect(writes()).toEqual([{
        url: "/api/haas/committee/42", method: "PATCH", body: { name: "Revised secretary" },
      }]);
      expect(screen.getByTestId("admin-committee-42")).toHaveTextContent("Secretary");
      expect(screen.getByTestId("admin-committee-42")).toHaveTextContent("Revised secretary");
      expect(sharedCommittee().getByText("President: Original president")).toBeVisible();
      expect(rows).toEqual(expected);
      expect(toast).toHaveBeenCalledExactlyOnceWith({
        title: "Committee member updated", description: "Revised secretary",
      });
    } finally {
      await act(async () => { releaseList(); });
    }
    await waitFor(() => expect(client.getQueryState(getListCommitteeQueryKey())?.fetchStatus).toBe("idle"));
    expect(client.getQueryData(getListCommitteeQueryKey())).toEqual(expected);
    await user.click(screen.getByRole("button", { name: "Edit Secretary name" }));
    expect(screen.getByRole("textbox", { name: "Secretary name" })).toHaveValue("Revised secretary");
  });
});
