import { db, eventsTable, setupTable } from "@workspace/db";

// Data-only initialization works in both environments, without schema changes
// at startup. The marker prevents deleted or edited source events reappearing.
export async function seedSourceEvents(): Promise<void> {
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
