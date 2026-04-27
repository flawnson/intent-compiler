import "dotenv/config";
import cors from "cors";
import express from "express";
import type { ApiError, ApiOk } from "../shared/types.js";
import { intentHandler } from "../../intent-compiler/handler.js";
import { seedDemoData } from "./seed.js";

const app = express();
const port = Number(process.env.PORT || 8787);

app.use(cors());
app.use(express.json());

app.use("/api/intents", intentHandler);

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

app.listen(port, () => {
  console.log(`Intent demo API listening on http://localhost:${port}`);
});
