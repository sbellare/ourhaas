import { db, eventsTable, setupTable, committeeTable, membershipTable } from "@workspace/db";

// Data-only initialization works in both environments, without schema changes
// at startup. The marker prevents deleted or edited source events reappearing.
export async function seedSourceEvents(): Promise<void> {
  await db.insert(membershipTable).values({
    id: 1,
    year: 2026,
    registrationUrl: "https://www.zeffy.com/en-US/ticketing/haas-2026-membership",
    description: "Register online through our existing Zeffy page. Payment is handled by Zeffy; this site never collects card details.",
    calendarPolicy: "Membership runs January 1 through December 31.",
    chequePolicy: "Prefer paper? Make cheques payable to HAAS.",
    discountPolicy: "Partial-year discounts are available only with committee approval.",
    refundPolicy: "Membership fees are non-refundable.",
  }).onConflictDoNothing({ target: membershipTable.id });
  await db.insert(committeeTable).values([
    { role: "President", name: "Sachin Bellare", position: 0 },
    { role: "Secretary", name: "Sheetal Sashital", position: 1 },
    { role: "Vice President", name: "Prateek Karkal", position: 2 },
    { role: "Food", name: "Varun Chadarvarkar", position: 3 },
    { role: "Treasurer", name: "Rupa Rao Dominitz", position: 4 },
    { role: "Events", name: "Mahesh Sashital", position: 5 },
  ]).onConflictDoNothing({ target: committeeTable.role });
  await db.transaction(async (tx) => {
    const initialized = await tx.insert(setupTable)
      .values({ key: "original-source-events" }).onConflictDoNothing().returning();
    if (!initialized.length) return;
    const existing = await tx.select({ id: eventsTable.id }).from(eventsTable).limit(1);
    if (existing.length) return;
    await tx.insert(eventsTable).values([
      { title: "Satyanarayan Pooja", date: "2025-03-01", category: "Spiritual", description: "Imported from ourhaas.com. Details were shared through the community invitation." },
      { title: "Picnic - in Sugar Land", date: "2025-04-12", time: "10:30 am–4:30 pm", location: "Sugar Land", category: "Community", description: "A community picnic in Sugar Land. Imported from the original HAAS calendar." },
      { title: "Family Game Night", date: "2025-08-09", location: "Aliana Club House", category: "Community", description: "Bingo, Jeopardy, and more. Imported from the original HAAS calendar." },
      { title: "Diwali Program", date: "2025-11-01", category: "Cultural", description: "Imported from the original HAAS calendar." },
    ]);
  });
}
