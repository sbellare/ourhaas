import express from "express";
import request from "supertest";
import { COMMITTEE_RESOURCE_SLUG, COMMITTEE_TITLE } from "@workspace/haas-content";
import sourcePages from "../lib/source-content.json";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// Only the external identity and storage boundaries are replaced. Requests run
// through the real router, authorization middleware, validation and serializers.
const mocks = vi.hoisted(() => ({
  userId: null as string | null,
  getUser: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: mocks.userId }),
  clerkClient: { users: { getUser: mocks.getUser } },
}));
vi.mock("@workspace/db", () => ({
  db: mocks,
  eventsTable: { id: "id", date: "date" },
  committeeTable: { id: "id", position: "position" },
}));
import router from "./haas";

const app = express();
app.use(express.json(), router);
app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: "Request failed" });
});

const assignedEmail = "assigned@example.com";
const event = {
  title: "Authorization regression event", date: "2030-06-15",
  time: "6:00 PM", location: "Test hall", description: "Test only", category: "Community",
};
const identity = (email = assignedEmail, status = "verified") => ({
  primaryEmailAddressId: "primary",
  emailAddresses: [{ id: "primary", emailAddress: email, verification: { status } }],
  publicMetadata: {},
});
const mutations = [
  { method: "post", path: "/haas/events" },
  { method: "put", path: "/haas/events/42" },
  { method: "delete", path: "/haas/events/42" },
] as const;

function expectNoStorageAccess() {
  for (const fn of [mocks.select, mocks.insert, mocks.update, mocks.delete]) {
    expect(fn).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("HAAS_ADMIN_EMAIL", assignedEmail);
  mocks.userId = null;
});
afterEach(() => vi.unstubAllEnvs());

describe("current committee resource", () => {
  const roster = [
    { id: 1, role: "President", name: "Sachin Bellare" },
    { id: 2, role: "Secretary", name: "Sheetal Sashital" },
    { id: 3, role: "Vice President", name: "Prateek Karkal" },
    { id: 4, role: "Food", name: "Varun Chadarvarkar" },
    { id: 5, role: "Treasurer", name: "Rupa Rao Dominitz" },
    { id: 6, role: "Events", name: "Mahesh Sashital" },
  ];

  it("uses the same live ordered members as the public roster, preserving other resources and attribution", async () => {
    let members = structuredClone(roster);
    mocks.select.mockImplementation(() => ({
      from: () => ({ orderBy: async () => members }),
    }));
    const verify = async () => {
      const committee = await request(app).get("/haas/committee");
      const pages = await request(app).get("/haas/pages");
      expect(committee.status).toBe(200);
      expect(pages.status).toBe(200);
      expect(pages.headers["cache-control"]).toBe("no-store");
      expect(committee.body).toEqual(members);
      expect(pages.body.map((page: { slug: string }) => page.slug)).toEqual(sourcePages.map((page) => page.slug));
      const page = pages.body.find((page: { slug: string }) => page.slug === COMMITTEE_RESOURCE_SLUG);
      expect(page.title).toBe(COMMITTEE_TITLE);
      expect(page.sourceUrl).toBe("https://www.ourhaas.com/present-haas-committee/");
      expect(page.markdown).toBe(`# ${COMMITTEE_TITLE}\n\n_**Management Committee**_\n\n` +
        members.map((member) => `**${member.role}** — ${member.name}`).join("\n\n") +
        "\n\n[Contact the HAAS committee](mailto:ourhaas@gmail.com).");
      expect(pages.body.filter((page: { slug: string }) => page.slug !== COMMITTEE_RESOURCE_SLUG))
        .toEqual(sourcePages.filter((page) => page.slug !== COMMITTEE_RESOURCE_SLUG));
    };
    await verify();
    // A subsequent read must use changed storage, not a source snapshot.
    members = members.map((member) => member.id === 5 ? { ...member, name: "Updated treasurer" } : member);
    members.push({ id: 7, role: "Volunteer", name: "New member" });
    await verify();
  });

  it("escapes member names and roles so stored text cannot become markdown links or HTML", async () => {
    mocks.select.mockReturnValue({
      from: () => ({ orderBy: async () => [{ id: 1, role: "*Lead*", name: "[Name](https://example.com) <b>Test</b>" }] }),
    });
    const response = await request(app).get("/haas/pages");
    expect(response.status).toBe(200);
    const page = response.body.find((page: { slug: string }) => page.slug === COMMITTEE_RESOURCE_SLUG);
    expect(page.markdown).toContain("**\\*Lead\\*** — \\[Name\\]\\(https://example\\.com\\) \\<b\\>Test\\</b\\>");
  });

  it("reports storage failure rather than serving an obsolete source roster", async () => {
    mocks.select.mockImplementation(() => { throw new Error("Unavailable"); });
    const response = await request(app).get("/haas/pages");
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "Request failed" });
  });
});

describe("assigned administrator authorization", () => {
  it("reports a signed-out account without looking up a user", async () => {
    const response = await request(app).get("/haas/admin");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ signedIn: false, isAdmin: false });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  const cases = [
    { name: "verified assigned primary email", user: identity(), allowed: true },
    { name: "mixed-case verified assigned email", user: identity("ASSIGNED@EXAMPLE.COM"), allowed: true },
    { name: "unverified assigned primary email", user: identity(assignedEmail, "unverified"), allowed: false },
    { name: "missing verification", user: { ...identity(), emailAddresses: [{ id: "primary", emailAddress: assignedEmail }] }, allowed: false },
    { name: "another verified account", user: identity("someone@example.com"), allowed: false },
    { name: "matching verified secondary email only", user: {
      ...identity("someone@example.com"),
      emailAddresses: [...identity("someone@example.com").emailAddresses,
        { id: "secondary", emailAddress: assignedEmail, verification: { status: "verified" } }],
    }, allowed: false },
    { name: "missing primary email", user: { ...identity(), primaryEmailAddressId: null }, allowed: false },
    { name: "self-claimed admin metadata", user: { ...identity("someone@example.com"), publicMetadata: { role: "admin" } }, allowed: false },
  ];

  for (const { name, user, allowed } of cases) {
    it(`reports ${name} as ${allowed ? "allowed" : "denied"}`, async () => {
      mocks.userId = "user_test";
      mocks.getUser.mockResolvedValue(user);
      const response = await request(app).get("/haas/admin");
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ signedIn: true, isAdmin: allowed });
      expect(mocks.getUser).toHaveBeenCalledWith("user_test");
    });
    if (!allowed) {
      it.each(mutations)(`denies $method for ${name} before storage access`, async ({ method, path }) => {
        mocks.userId = "user_test";
        mocks.getUser.mockResolvedValue(user);
        const response = await request(app)[method](path).send(event);
        expect(response.status).toBe(403);
        expect(response.body.error).toMatch(/assigned HAAS administrators/);
        expectNoStorageAccess();
      });
    }
  }

  it.each(mutations)("rejects signed-out $method before looking up users or storage", async ({ method, path }) => {
    const response = await request(app)[method](path).send(event);
    expect(response.status).toBe(401);
    expect(response.body.error).toMatch(/sign in/);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expectNoStorageAccess();
  });

  it.each(["", "   "])("fails closed when no administrator is assigned (%j)", async (email) => {
    vi.stubEnv("HAAS_ADMIN_EMAIL", email);
    mocks.userId = "user_test";
    mocks.getUser.mockResolvedValue(identity());
    expect((await request(app).get("/haas/admin")).body.isAdmin).toBe(false);
    for (const { method, path } of mutations) {
      expect((await request(app)[method](path).send(event)).status).toBe(403);
    }
    expectNoStorageAccess();
  });

  it("normalizes the owner-configured address", async () => {
    vi.stubEnv("HAAS_ADMIN_EMAIL", "  ASSIGNED@EXAMPLE.COM  ");
    mocks.userId = "user_test";
    mocks.getUser.mockResolvedValue(identity());
    expect((await request(app).get("/haas/admin")).body.isAdmin).toBe(true);
  });

  it.each(mutations)("fails closed when Clerk cannot verify the $method caller", async ({ method, path }) => {
    mocks.userId = "user_test";
    mocks.getUser.mockRejectedValue(new Error("Identity service unavailable"));
    expect((await request(app)[method](path).send(event)).status).toBe(500);
    expectNoStorageAccess();
  });

  it.each(mutations)("rejects cross-origin $method even for the administrator", async ({ method, path }) => {
    mocks.userId = "user_test";
    mocks.getUser.mockResolvedValue(identity());
    const response = await request(app)[method](path)
      .set("Host", "haas.example.com").set("Origin", "https://attacker.example.com").send(event);
    expect(response.status).toBe(403);
    expectNoStorageAccess();
  });
});

describe("authorized event management and public reads", () => {
  it.each([
    "http://www.zeffy.com/en-US/ticketing/test",
    "javascript:alert(1)",
    "https://zeffy.com.evil.example/pay",
    "https://www.zeffy.com@evil.example/pay",
    "https://evil.example/?next=https://www.zeffy.com/",
    "https://user:password@www.zeffy.com/pay",
    "https://www.zeffy.com/pay with spaces",
  ])("rejects unsafe event payment link %s before changing storage", async (zeffyUrl) => {
    mocks.userId = "user_test";
    mocks.getUser.mockResolvedValue(identity());
    for (const { method, path } of mutations.filter((mutation) => mutation.method !== "delete")) {
      expect((await request(app)[method](path).send({ ...event, zeffyUrl })).status).toBe(400);
    }
    expectNoStorageAccess();
  });

  it.each(["", "https://www.zeffy.com/en-US/ticketing/test", "https://zeffy.com/en-CA/ticketing/test?source=haas"])
  ("saves and clears per-event Zeffy links (%s)", async (zeffyUrl) => {
    mocks.userId = "user_test";
    mocks.getUser.mockResolvedValue(identity());
    const input = { ...event, zeffyUrl };
    const returning = async () => [{ ...input, id: 42 }];
    mocks.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning }) });
    const set = vi.fn().mockReturnValue({ where: () => ({ returning }) });
    mocks.update.mockReturnValue({ set });
    const created = await request(app).post("/haas/events").send(input);
    expect(created.status).toBe(201);
    expect(created.body.zeffyUrl).toBe(zeffyUrl);
    const updated = await request(app).put("/haas/events/42").send(input);
    expect(updated.status).toBe(200);
    expect(updated.body.zeffyUrl).toBe(zeffyUrl);
    expect(set).toHaveBeenCalledWith(input);
  });

  it("creates, reads, updates, reads again and deletes through the real handlers", async () => {
    // In-memory storage is scoped to this test; real persistence is verified by
    // the signed-in browser run against development PostgreSQL.
    let rows: Array<typeof event & { id: number }> = [];
    mocks.select.mockImplementation(() => ({
      from: () => ({ orderBy: async () => structuredClone(rows) }),
    }));
    mocks.insert.mockImplementation(() => ({
      values: (data: typeof event) => ({
        returning: async () => {
          const saved = { ...data, id: 42 };
          rows.push(saved);
          return [saved];
        },
      }),
    }));
    mocks.update.mockImplementation(() => ({
      set: (data: typeof event) => ({
        where: () => ({
          returning: async () => {
            rows = [{ ...data, id: 42 }];
            return rows;
          },
        }),
      }),
    }));
    mocks.delete.mockImplementation(() => ({
      where: () => ({ returning: async () => { const removed = rows; rows = []; return removed; } }),
    }));
    mocks.userId = "user_test";
    mocks.getUser.mockResolvedValue(identity());
    const created = await request(app).post("/haas/events")
      .set("Host", "internal:5000").set("X-Forwarded-Host", "haas.example.com")
      .set("Origin", "https://haas.example.com").send(event);
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ ...event, id: 42 });
    mocks.userId = null;
    const publicRead = await request(app).get("/haas/events");
    expect(publicRead.status).toBe(200);
    expect(publicRead.headers["cache-control"]).toBe("no-store");
    expect(publicRead.body).toEqual([created.body]);

    mocks.userId = "user_test";
    const changes = { ...event, title: "Updated community gathering", location: "", description: "Updated details", category: "Cultural" };
    const updated = await request(app).put("/haas/events/42").send(changes);
    expect(updated.status).toBe(200);
    expect(updated.body).toEqual({ ...changes, id: 42 });
    mocks.userId = null;
    expect((await request(app).get("/haas/events")).body).toEqual([updated.body]);

    mocks.userId = "user_test";
    expect((await request(app).delete("/haas/events/42")).status).toBe(204);
    mocks.userId = null;
    expect((await request(app).get("/haas/events")).body).toEqual([]);
  });
});

describe("event calendar dates", () => {
  beforeEach(() => {
    mocks.userId = "user_test";
    mocks.getUser.mockResolvedValue(identity());
  });

  const validDays = [
    "0000-02-29", "0096-02-29", "1900-02-28", "2000-02-29",
    "2024-02-29", "2032-02-29", "2100-02-28", "2400-02-29", "9999-12-31",
    "2031-12-31", "2032-01-01",
    // US daylight-saving transitions must remain calendar dates, not instants.
    "2032-03-14", "2032-11-07",
  ];

  it.each(validDays)("preserves %s through create, public read, edit and another public read", async (date) => {
    let saved: (typeof event & { id: number }) | undefined;
    mocks.insert.mockReturnValue({
      values: vi.fn((data: typeof event) => ({
        returning: async () => { saved = { ...data, id: 42 }; return [saved]; },
      })),
    });
    mocks.update.mockReturnValue({
      set: vi.fn((data: typeof event) => ({
        where: () => ({ returning: async () => { saved = { ...data, id: 42 }; return [saved]; } }),
      })),
    });
    mocks.select.mockImplementation(() => ({
      from: () => ({ orderBy: async () => saved ? [saved] : [] }),
    }));
    const created = await request(app).post("/haas/events").send({ ...event, date });
    expect(created.status).toBe(201);
    expect(created.body.date).toBe(date);
    expect(saved?.date).toBe(date);
    mocks.userId = null;
    const read = await request(app).get("/haas/events");
    expect(read.status).toBe(200);
    expect(read.body[0].date).toBe(date);
    expect(read.headers["cache-control"]).toBe("no-store");
    mocks.userId = "user_test";
    const edited = await request(app).put("/haas/events/42").send({ ...event, title: "Edited event", date });
    expect(edited.status).toBe(200);
    expect(edited.body.date).toBe(date);
    expect(saved?.date).toBe(date);
    mocks.userId = null;
    const refreshed = await request(app).get("/haas/events");
    expect(refreshed.body[0]).toMatchObject({ date, title: "Edited event" });
  });

  const invalidDays = [
    "", "not-a-date", "2031-02-29", "1900-02-29", "2100-02-29",
    "2032-02-30", "2032-04-31", "2032-00-15", "2032-13-01",
    "2032-01-00", "2032-01-32", "2032-1-01", "32-01-01",
    "2032-01-01T00:00:00Z", " 2032-01-01", "2032-01-01 ", "2032-01-01\n",
    null, 20320101,
  ];
  for (const method of ["post", "put"] as const) {
    it.each(["", "   ", "\t\r\n", "\u00a0\u2003", "x".repeat(201)])(
      `rejects invalid required title %j on ${method}`, async (title) => {
        const path = method === "post" ? "/haas/events" : "/haas/events/42";
        const response = await request(app)[method](path).send({ ...event, title });
        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/title/);
      },
    );

    it(`trims the title before saving on ${method}`, async () => {
      const path = method === "post" ? "/haas/events" : "/haas/events/42";
      const write = vi.fn((data: typeof event) => ({
        returning: async () => [{ ...data, id: 42 }],
        where: () => ({ returning: async () => [{ ...data, id: 42 }] }),
      }));
      mocks.insert.mockReturnValue({ values: write });
      mocks.update.mockReturnValue({ set: write });
      const response = await request(app)[method](path).send({ ...event, title: "  Community gathering \t" });
      expect(response.status).toBe(method === "post" ? 201 : 200);
      expect(response.body.title).toBe("Community gathering");
      expect(write).toHaveBeenCalledWith({ ...event, title: "Community gathering" });
    });

    it.each(invalidDays)(`rejects invalid calendar date %j on ${method} before writing`, async (date) => {
      const path = method === "post" ? "/haas/events" : "/haas/events/42";
      const response = await request(app)[method](path).send({ ...event, date });
      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/calendar date/);
      expectNoStorageAccess();
    });
  }

  it("persists an edited date across the year boundary without altering its day", async () => {
    mocks.update.mockReturnValue({
      set: vi.fn((data: typeof event) => ({
        where: () => ({ returning: async () => [{ ...data, id: 42 }] }),
      })),
    });
    for (const date of ["2031-12-31", "2032-01-01", "2032-02-29"]) {
      const response = await request(app).put("/haas/events/42").send({ ...event, date });
      expect(response.status).toBe(200);
      expect(response.body.date).toBe(date);
    }
  });
});
