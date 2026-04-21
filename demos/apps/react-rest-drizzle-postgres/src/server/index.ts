import "dotenv/config";
import cors from "cors";
import express from "express";
import type { ActiveUserSummary, ApiError, ApiOk } from "../shared/types.js";
import { aiDb } from "./ai-client.js";
import { seedDemoData } from "./seed.js";

const app = express();
const port = Number(process.env.PORT || 8787);

app.use(cors());
app.use(express.json());

app.get("/api/health", (_request, response: express.Response<ApiOk<{ ok: true }>>) => {
  response.json({ data: { ok: true } });
});

app.post("/api/dev/seed", async (_request, response: express.Response<ApiOk<{ seeded: true }> | ApiError>) => {
  try {
    await seedDemoData();
    response.json({ data: { seeded: true } });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Failed to seed data." });
  }
});

function normalizeCountry(value: string | undefined): string {
  if (!value) {
    return "US";
  }
  return value.slice(0, 2).toUpperCase();
}

function normalizeAfterDate(value: string | undefined): string {
  if (!value) {
    return "2026-01-01";
  }
  return value;
}

function toActiveUserSummary(value: unknown): ActiveUserSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((row) => {
    const source = row as Record<string, unknown>;
    const signupDate =
      typeof source.signupDate === "string"
        ? source.signupDate
        : typeof source.signup_date === "string"
          ? source.signup_date
          : new Date().toISOString();

    return {
      id: Number(source.id ?? 0),
      email: String(source.email ?? ""),
      fullName: String(source.fullName ?? source.full_name ?? ""),
      country: String(source.country ?? ""),
      signupDate,
      orderCount: Number(source.orderCount ?? source.order_count ?? 0),
      totalSpendCents: Number(source.totalSpendCents ?? source.total_spend_cents ?? 0)
    };
  });
}

app.get("/api/users/active", async (request, response: express.Response<ApiOk<ActiveUserSummary[]> | ApiError>) => {
  try {
    const country = normalizeCountry(
      typeof request.query.country === "string" ? request.query.country : undefined
    );
    const afterDate = normalizeAfterDate(
      typeof request.query.after === "string" ? request.query.after : undefined
    );

    const statement = aiDb.prepare`Find active users in ${country} who signed up after ${afterDate} and include their order count and total spend.`;
    const users = await aiDb.query(statement, {
      returnType: toActiveUserSummary
    });

    response.json({ data: users as ActiveUserSummary[] });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load active users."
    });
  }
});

app.listen(port, () => {
  console.log(`Intent demo API listening on http://localhost:${port}`);
});
