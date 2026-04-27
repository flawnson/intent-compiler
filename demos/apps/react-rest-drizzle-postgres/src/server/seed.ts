import { db } from "./seed-db.js";
import { orders, users } from "../../drizzle/schema.js";

export async function seedDemoData(): Promise<void> {
  await db.delete(orders);
  await db.delete(users);

  const insertedUsers = await db
    .insert(users)
    .values([
      {
        email: "ava@example.com",
        fullName: "Ava Reed",
        status: "ACTIVE",
        country: "US",
        signupDate: new Date("2026-01-08T12:00:00.000Z")
      },
      {
        email: "noah@example.com",
        fullName: "Noah Patel",
        status: "ACTIVE",
        country: "US",
        signupDate: new Date("2026-02-12T12:00:00.000Z")
      },
      {
        email: "liam@example.com",
        fullName: "Liam Chen",
        status: "ACTIVE",
        country: "CA",
        signupDate: new Date("2026-01-24T12:00:00.000Z")
      },
      {
        email: "mia@example.com",
        fullName: "Mia Alvarez",
        status: "INACTIVE",
        country: "US",
        signupDate: new Date("2026-03-01T12:00:00.000Z")
      }
    ])
    .returning({ id: users.id, email: users.email });

  const byEmail = new Map(insertedUsers.map((entry) => [entry.email, entry.id]));
  const getUserId = (email: string): number => {
    const id = byEmail.get(email);
    if (!id) {
      throw new Error(`Seed user missing: ${email}`);
    }
    return id;
  };

  await db.insert(orders).values([
    { userId: getUserId("ava@example.com"), totalCents: 1299, createdAt: new Date("2026-02-02T12:00:00.000Z") },
    { userId: getUserId("ava@example.com"), totalCents: 4899, createdAt: new Date("2026-03-02T12:00:00.000Z") },
    { userId: getUserId("noah@example.com"), totalCents: 2599, createdAt: new Date("2026-03-15T12:00:00.000Z") },
    { userId: getUserId("liam@example.com"), totalCents: 1999, createdAt: new Date("2026-03-20T12:00:00.000Z") }
  ]);
}
