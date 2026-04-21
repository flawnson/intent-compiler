import "dotenv/config";
import { seedDemoData } from "../src/server/seed.js";
import { pool } from "../src/server/db.js";

try {
  await seedDemoData();
  console.log("Demo data seeded.");
} finally {
  await pool.end();
}
