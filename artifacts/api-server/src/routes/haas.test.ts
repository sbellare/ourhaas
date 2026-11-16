import express from "express";
import request from "supertest";
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
