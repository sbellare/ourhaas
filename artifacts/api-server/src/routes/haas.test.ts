import express from "express";
import request from "supertest";
import { eq } from "drizzle-orm";
import { membershipTable } from "@workspace/db";
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
  membershipTable: { id: "id" },
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
    " https://evil.example/pay ",
    "//zeffy.com/pay",
    "ftp://zeffy.com/pay",
    "https://forms.zeffy.com/pay",
    "https://zeffy.com:443/pay",
    `https://zeffy.com/${"x".repeat(1983)}`,
    null,
    123,
  ])("rejects unsafe event payment link %s before changing storage", async (zeffyUrl) => {
    mocks.userId = "user_test";
    mocks.getUser.mockResolvedValue(identity());
    for (const { method, path } of mutations.filter((mutation) => mutation.method !== "delete")) {
      expect((await request(app)[method](path).send({ ...event, zeffyUrl })).status).toBe(400);
    }
    expectNoStorageAccess();
  });

  it.each([
    "", " \t\r\n", "\u00a0\u2003",
    "https://www.zeffy.com/en-US/ticketing/test",
    "https://zeffy.com/en-CA/ticketing/test?source=haas",
    " \thttps://www.zeffy.com/en-US/ticketing/test\r\n",
    "\u00a0https://zeffy.com/en-CA/ticketing/test?source=haas#form\u2003",
    ` https://zeffy.com/${"x".repeat(1982)} `,
  ])
  ("saves and clears per-event Zeffy links (%s)", async (zeffyUrl) => {
    mocks.userId = "user_test";
    mocks.getUser.mockResolvedValue(identity());
    const input = { ...event, zeffyUrl };
    const normalized = { ...input, zeffyUrl: zeffyUrl.trim() };
    const returning = async () => [{ ...normalized, id: 42 }];
    const values = vi.fn().mockReturnValue({ returning });
    mocks.insert.mockReturnValue({ values });
    const set = vi.fn().mockReturnValue({ where: () => ({ returning }) });
    mocks.update.mockReturnValue({ set });
    const created = await request(app).post("/haas/events").send(input);
    expect(created.status).toBe(201);
    expect(created.body.zeffyUrl).toBe(zeffyUrl.trim());
    expect(values).toHaveBeenCalledWith(normalized);
    const updated = await request(app).put("/haas/events/42").send(input);
    expect(updated.status).toBe(200);
    expect(updated.body.zeffyUrl).toBe(zeffyUrl.trim());
    expect(set).toHaveBeenCalledWith(normalized);
  });

  it("defaults omitted create links to blank and preserves existing links on omitted updates", async () => {
    mocks.userId = "user_test";
    mocks.getUser.mockResolvedValue(identity());
    let saved = { ...event, id: 42, zeffyUrl: "" };
    const values = vi.fn((data: typeof event & { zeffyUrl?: string }) => ({
      returning: async () => [saved = { ...saved, ...data }],
    }));
    const set = vi.fn((data: typeof event & { zeffyUrl?: string }) => ({
      where: () => ({ returning: async () => [saved = { ...saved, ...data }] }),
    }));
    mocks.insert.mockReturnValue({ values });
    mocks.update.mockReturnValue({ set });

    const created = await request(app).post("/haas/events").send(event);
    expect(created.status).toBe(201);
    expect(created.body.zeffyUrl).toBe("");
    expect(values).toHaveBeenCalledWith(event);

    const zeffyUrl = "https://zeffy.com/en-US/ticketing/test";
    const linked = await request(app).put("/haas/events/42").send({ ...event, zeffyUrl });
    expect(linked.status).toBe(200);
    expect(linked.body.zeffyUrl).toBe(zeffyUrl);

    const omitted = await request(app).put("/haas/events/42").send(event);
    expect(omitted.status).toBe(200);
    expect(omitted.body.zeffyUrl).toBe(zeffyUrl);
    expect(set).toHaveBeenLastCalledWith(event);

    const cleared = await request(app).put("/haas/events/42").send({ ...event, zeffyUrl: " \t " });
    expect(cleared.status).toBe(200);
    expect(cleared.body.zeffyUrl).toBe("");
    expect(set).toHaveBeenLastCalledWith({ ...event, zeffyUrl: "" });
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

describe("membership registration safeguards", () => {
  const membership = {
    year: 2030,
    registrationUrl: "https://www.zeffy.com/en-US/ticketing/haas-membership",
    description: "Join the HAAS community.",
    calendarPolicy: "Membership follows the calendar year.",
    chequePolicy: "Contact the committee about cheques.",
    discountPolicy: "Members receive event discounts.",
    refundPolicy: "Membership fees are non-refundable.",
  };
  const policyFields = [
    "description", "calendarPolicy", "chequePolicy", "discountPolicy", "refundPolicy",
  ] as const;
  let saved: typeof membership & { id: number };
  const setMembership = vi.fn();
  const updateWhere = vi.fn();
  const readWhere = vi.fn();

  beforeEach(() => {
    // Test-local persistence only: never import or connect to a real database.
    saved = { id: 1, ...structuredClone(membership) };
    mocks.select.mockReturnValue({
      from: vi.fn((table) => {
        expect(table).toBe(membershipTable);
        return { where: readWhere };
      }),
    });
    readWhere.mockImplementation(async () => [structuredClone(saved)]);
    mocks.update.mockImplementation((table) => {
      expect(table).toBe(membershipTable);
      return { set: setMembership };
    });
    setMembership.mockImplementation((data: typeof membership) => ({
      where: updateWhere.mockImplementation(() => ({
        returning: async () => {
          saved = { ...saved, ...structuredClone(data) };
          return [structuredClone(saved)];
        },
      })),
    }));
    mocks.userId = "user_test";
    mocks.getUser.mockResolvedValue(identity());
  });

  async function expectPublicMembership(expected: typeof membership) {
    mocks.userId = null;
    const response = await request(app).get("/haas/membership");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toEqual(expected);
    expect(readWhere).toHaveBeenCalledWith(eq(membershipTable.id, 1));
  }

  async function expectRejectedWithoutChanges(input: Record<string, unknown>, status = 400) {
    const before = structuredClone(saved);
    const response = await request(app).put("/haas/membership").send(input);
    expect(response.status).toBe(status);
    expect(response.body.error).toEqual(expect.any(String));
    expectNoStorageAccess();
    expect(setMembership).not.toHaveBeenCalled();
    expect(updateWhere).not.toHaveBeenCalled();
    expect(saved).toEqual(before);
    // Read through the public handler too, so the persisted singleton remains
    // observable and unchanged after every rejected request.
    await expectPublicMembership(membership);
    expect(saved).toEqual(before);
  }

  it("returns 503 without inventing public membership when the singleton is missing", async () => {
    mocks.userId = null;
    readWhere.mockResolvedValueOnce([]);

    const response = await request(app).get("/haas/membership");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "Membership information is not initialized." });
    expect(readWhere).toHaveBeenCalledExactlyOnceWith(eq(membershipTable.id, 1));
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("returns 503 rather than claiming a save when no singleton can be updated", async () => {
    const before = structuredClone(saved);
    const returning = vi.fn().mockResolvedValue([]);
    setMembership.mockReturnValueOnce({ where: updateWhere });
    updateWhere.mockReturnValueOnce({ returning });

    const response = await request(app).put("/haas/membership").send({ ...membership, year: 2031 });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "Membership information is not initialized." });
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith(membershipTable);
    expect(setMembership).toHaveBeenCalledExactlyOnceWith({ ...membership, year: 2031 });
    expect(updateWhere).toHaveBeenCalledExactlyOnceWith(eq(membershipTable.id, 1));
    expect(returning).toHaveBeenCalledExactlyOnceWith();
    expect(saved).toEqual(before);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("returns 500 without fallback membership when the database read rejects", async () => {
    mocks.userId = null;
    readWhere.mockRejectedValueOnce(new Error("Database read unavailable"));

    const response = await request(app).get("/haas/membership");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "Request failed" });
    expect(readWhere).toHaveBeenCalledExactlyOnceWith(eq(membershipTable.id, 1));
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("returns 500 without claiming a save or changing membership when the update rejects", async () => {
    const before = structuredClone(saved);
    const returning = vi.fn().mockRejectedValue(new Error("Database update unavailable"));
    setMembership.mockReturnValueOnce({ where: updateWhere });
    updateWhere.mockReturnValueOnce({ returning });

    const response = await request(app).put("/haas/membership").send({ ...membership, year: 2031 });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "Request failed" });
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith(membershipTable);
    expect(setMembership).toHaveBeenCalledExactlyOnceWith({ ...membership, year: 2031 });
    expect(updateWhere).toHaveBeenCalledExactlyOnceWith(eq(membershipTable.id, 1));
    expect(returning).toHaveBeenCalledExactlyOnceWith();
    expect(saved).toEqual(before);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
    await expectPublicMembership(membership);
    expect(saved).toEqual(before);
  });

  it("rejects signed-out changes before identity or storage access", async () => {
    mocks.userId = null;
    await expectRejectedWithoutChanges({ ...membership, year: 2031 }, 401);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it.each([
    { name: "another verified account", user: identity("someone@example.com") },
    { name: "unverified assigned account", user: identity(assignedEmail, "unverified") },
    { name: "self-claimed administrator", user: {
      ...identity("someone@example.com"), publicMetadata: { role: "admin" },
    } },
  ])("rejects changes from $name", async ({ user }) => {
    mocks.getUser.mockResolvedValue(user);
    await expectRejectedWithoutChanges({ ...membership, year: 2031 }, 403);
    expect(mocks.getUser).toHaveBeenCalledWith("user_test");
  });

  for (const field of policyFields) {
    it.each(["", "   ", "\t\r\n", "\u00a0\u2003"])(
      `rejects blank ${field} (%j) without changing the singleton`, async (value) => {
        await expectRejectedWithoutChanges({ ...membership, [field]: value });
      },
    );
  }

  it.each([1999, 2201, 2030.5, 0, -1, "2030", "", null])(
    "rejects invalid year %j without changing the singleton", async (year) => {
      await expectRejectedWithoutChanges({ ...membership, year });
    },
  );

  it.each([
    "",
    "not-a-url",
    "javascript:alert(1)",
    "http://www.zeffy.com/en-US/ticketing/haas-membership",
    "http://zeffy.com/en-US/ticketing/haas-membership",
    "//www.zeffy.com/en-US/ticketing/haas-membership",
    "https://zeffy.com.evil.example/pay",
    "https://www.zeffy.com.evil.example/pay",
    "https://notzeffy.com/pay",
    "https://zeffy-com.example/pay",
    "https://forms.zeffy.com/pay",
    "https://www.zeffy.com@evil.example/pay",
    "https://evil.example/?next=https://www.zeffy.com/",
    "https://user@zeffy.com/pay",
    "https://user:password@www.zeffy.com/pay",
    "https://:password@www.zeffy.com/pay",
  ])("rejects unsafe registration URL %j without changing the singleton", async (registrationUrl) => {
    await expectRejectedWithoutChanges({ ...membership, registrationUrl });
  });

  it.each([
    { year: 2000, registrationUrl: "https://www.zeffy.com/en-US/ticketing/haas-membership" },
    { year: 2200, registrationUrl: "https://zeffy.com/en-CA/ticketing/haas-membership?source=haas" },
    { year: 2031, registrationUrl: "https://WWW.ZEFFY.COM/en-US/ticketing/new-membership#form" },
  ])("saves a valid HTTPS Zeffy form for $year and exposes it publicly", async (input) => {
    const changes = {
      ...membership, ...input,
      ...Object.fromEntries(policyFields.map((field) => [field, ` \tUpdated ${membership[field]}\n `])),
    };
    const expected = {
      ...membership, ...input,
      registrationUrl: new URL(input.registrationUrl).href,
      ...Object.fromEntries(policyFields.map((field) => [field, `Updated ${membership[field]}`])),
    };
    const response = await request(app).put("/haas/membership").send(changes);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(expected);
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith(membershipTable);
    expect(setMembership).toHaveBeenCalledExactlyOnceWith(expected);
    expect(updateWhere).toHaveBeenCalledExactlyOnceWith(eq(membershipTable.id, 1));
    expect(saved).toEqual({ id: 1, ...expected });
    await expectPublicMembership(expected);
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
