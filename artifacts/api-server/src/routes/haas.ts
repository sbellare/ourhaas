import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { db, eventsTable, committeeTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import {
  ListEventsResponse, CreateEventBody, CreateEventResponse, UpdateEventParams,
  UpdateEventBody, UpdateEventResponse, DeleteEventParams,
  GetAdminStatusResponse, ListContentPagesResponse,
  ListCommitteeResponse, UpdateCommitteeMemberBody, UpdateCommitteeMemberParams, UpdateCommitteeMemberResponse,
} from "@workspace/api-zod";
import sourcePages from "../lib/source-content.json";

const router: IRouter = Router();

async function isAdmin(req: Request): Promise<boolean> {
  const { userId } = getAuth(req);
  if (!userId) return false;
  const user = await clerkClient.users.getUser(userId);
  const primaryEmail = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId);
  const assignedEmail = process.env.HAAS_ADMIN_EMAIL?.trim().toLowerCase();
  return !!assignedEmail && primaryEmail?.verification?.status === "verified"
    && primaryEmail.emailAddress.toLowerCase() === assignedEmail;
}

async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!getAuth(req).userId) {
    res.status(401).json({ error: "Please sign in to manage events." });
    return;
  }
  if (!(await isAdmin(req))) {
    res.status(403).json({ error: "Only assigned HAAS administrators can modify events." });
    return;
  }
  const origin = req.get("origin");
  if (origin) {
    const hostname = new URL(origin).hostname;
    const host = (req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim().split(":")[0];
    if (hostname !== host) {
      res.status(403).json({ error: "Cross-origin changes are not allowed." });
      return;
    }
  }
  next();
}

function validDate(value: string): boolean {
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

router.get("/haas/pages", async (_req, res): Promise<void> => {
  const members = await db.select().from(committeeTable).orderBy(asc(committeeTable.position));
  const escape = (value: string) => value.replace(/[\\`*_{}\[\]()#+.!<>|~-]/g, "\\$&");
  const pages = sourcePages.map((page) => page.slug !== "present-haas-committee" ? page : {
    ...page,
    markdown: "# HAAS Committee Jan 2027 - Dec 2028\n\n" +
      members.map((member) => `**${escape(member.role)}** — ${escape(member.name)}`).join("\n\n") +
      "\n\n[Contact the HAAS committee](mailto:ourhaas@gmail.com).",
  });
  res.setHeader("Cache-Control", "no-store");
  res.json(ListContentPagesResponse.parse(pages));
});
router.get("/haas/committee", async (_req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  res.json(ListCommitteeResponse.parse(await db.select().from(committeeTable).orderBy(asc(committeeTable.position))));
});
router.patch("/haas/committee/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateCommitteeMemberParams.safeParse(req.params);
  const parsed = UpdateCommitteeMemberBody.safeParse(req.body);
  if (!params.success || !parsed.success || !parsed.data.name.trim() || /[\u0000-\u001f\u007f]/.test(parsed.data.name)) {
    res.status(400).json({ error: "Enter a member name between 1 and 120 characters." });
    return;
  }
  const [member] = await db.update(committeeTable).set({ name: parsed.data.name.trim() })
    .where(eq(committeeTable.id, params.data.id)).returning();
  if (!member) { res.status(404).json({ error: "Committee member not found." }); return; }
  res.json(UpdateCommitteeMemberResponse.parse(member));
});
router.get("/haas/admin", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  res.json(GetAdminStatusResponse.parse({ signedIn: !!getAuth(req).userId, isAdmin: await isAdmin(req) }));
});
router.get("/haas/events", async (_req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  res.json(ListEventsResponse.parse(await db.select().from(eventsTable).orderBy(asc(eventsTable.date))));
});
router.post("/haas/events", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateEventBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.title.trim() || !validDate(parsed.data.date)) {
    res.status(400).json({ error: "Enter a title, valid calendar date, and all event fields." });
    return;
  }
  const [event] = await db.insert(eventsTable).values(parsed.data).returning();
  res.status(201).json(CreateEventResponse.parse(event));
});
router.put("/haas/events/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateEventParams.safeParse(req.params);
  const parsed = UpdateEventBody.safeParse(req.body);
  if (!params.success || !parsed.success || !parsed.data.title.trim() || !validDate(parsed.data.date)) {
    res.status(400).json({ error: "Enter a valid event, title, calendar date, and all event fields." });
    return;
  }
  const [event] = await db.update(eventsTable).set(parsed.data).where(eq(eventsTable.id, params.data.id)).returning();
  if (!event) { res.status(404).json({ error: "Event not found." }); return; }
  res.json(UpdateEventResponse.parse(event));
});
router.delete("/haas/events/:id", requireAdmin, async (req, res): Promise<void> => {
  const parsed = DeleteEventParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid event." }); return; }
  const [event] = await db.delete(eventsTable).where(eq(eventsTable.id, parsed.data.id)).returning();
  if (!event) { res.status(404).json({ error: "Event not found." }); return; }
  res.sendStatus(204);
});
export default router;
