import { useMemo, useState } from "react";
import type { ActiveUserSummary, ApiError, ApiOk } from "../shared/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { aiDb } from "intent-compiler/client";

const defaultAfterDate = "2026-01-01";

async function parseApiResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiOk<T> | ApiError;
  if (!response.ok) {
    throw new Error("error" in payload ? payload.error : "Request failed.");
  }
  if ("error" in payload) {
    throw new Error(payload.error);
  }
  return payload.data;
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

export function App() {
  const [country, setCountry] = useState("US");
  const [afterDate, setAfterDate] = useState(defaultAfterDate);
  const [rows, setRows] = useState<ActiveUserSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const totalSpendDollars = useMemo(() => {
    return rows.reduce((total, row) => total + row.totalSpendCents, 0) / 100;
  }, [rows]);

  async function loadUsers(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const statement = aiDb.prepare`Find active users in ${country.toUpperCase()} who signed up after ${afterDate} and include their order count and total spend.`;
      const data = await aiDb.query(statement, { returnType: toActiveUserSummary });
      setRows(data as ActiveUserSummary[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load users.");
    } finally {
      setLoading(false);
    }
  }

  async function reseed(): Promise<void> {
    setSeeding(true);
    setError(null);
    try {
      const response = await fetch("/api/dev/seed", { method: "POST" });
      await parseApiResponse<{ seeded: true }>(response);
      await loadUsers();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to seed data.");
    } finally {
      setSeeding(false);
    }
  }

  return (
    <main className="min-h-screen py-10">
      <div className="container flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Intent Compiler Demo</CardTitle>
            <CardDescription>
              React + REST + Drizzle + PostgreSQL with AOT intent compilation.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[160px_220px_1fr]">
              <label className="flex flex-col gap-1 text-sm">
                Country
                <Input value={country} onChange={(event) => setCountry(event.target.value.toUpperCase())} maxLength={2} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Signed Up After
                <Input type="date" value={afterDate} onChange={(event) => setAfterDate(event.target.value)} />
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <Button onClick={() => void loadUsers()} disabled={loading}>
                  {loading ? "Loading..." : "Run Intent Query"}
                </Button>
                <Button variant="secondary" onClick={() => void reseed()} disabled={seeding}>
                  {seeding ? "Seeding..." : "Seed Demo Data"}
                </Button>
              </div>
            </div>
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
            <CardDescription>
              {rows.length} active user(s), total spend ${totalSpendDollars.toFixed(2)}
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Country</th>
                  <th className="py-2 pr-3">Signed Up</th>
                  <th className="py-2 pr-3">Orders</th>
                  <th className="py-2 pr-3">Total Spend</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="py-2 pr-3">{row.fullName}</td>
                    <td className="py-2 pr-3">{row.email}</td>
                    <td className="py-2 pr-3">{row.country}</td>
                    <td className="py-2 pr-3">{new Date(row.signupDate).toLocaleDateString()}</td>
                    <td className="py-2 pr-3">{row.orderCount}</td>
                    <td className="py-2 pr-3">${(row.totalSpendCents / 100).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
