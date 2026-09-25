/**
 * A whole event, end to end, as the three people who run it: an official, a
 * coach and a judge, each in their own browser. Needs the local Supabase stack
 * (`npx supabase start`) and reads sign-in emails from its Mailpit inbox.
 */
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());
const MAILPIT = "http://127.0.0.1:54324";
const run = Date.now().toString(36);
const OFFICIAL = `official-${run}@example.com`;
const COACH = `coach-${run}@example.com`;
const JUDGE = `judge-${run}@example.com`;

// Read-only checks on what the app wrote. The app itself never sees this key.
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});

type Mail = { ID: string; Text: string; HTML: string };

async function newestMail(request: APIRequestContext, to: string, seen: Set<string>): Promise<Mail> {
  for (let i = 0; i < 40; i++) {
    const res = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    const fresh = messages.find((m) => !seen.has(m.ID));
    if (fresh) {
      seen.add(fresh.ID);
      return (await (await request.get(`${MAILPIT}/api/v1/message/${fresh.ID}`)).json()) as Mail;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email arrived for ${to}`);
}

const seen = new Set<string>();

async function signInWithCode(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByLabel("Code from the email")).toBeVisible();
  const mail = await newestMail(page.request, email, seen);
  const code = /\b(\d{6})\b/.exec(mail.Text)?.[1];
  expect(code, "sign-in email carries a code").toBeTruthy();
  await page.getByLabel("Code from the email").fill(code!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

/** Opens the invite email's link in a fresh browser, as the invitee would. */
async function acceptInvite(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  const mail = await newestMail(page.request, email, seen);
  const link = /href="([^"]*\/auth\/confirm[^"]*)"/.exec(mail.HTML)?.[1]?.replaceAll("&amp;", "&");
  expect(link, "invite email links to /auth/confirm").toBeTruthy();
  await page.goto(link!);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/accept\//);
  await page.getByRole("button", { name: "Accept invite" }).click();
  await page.getByRole("link", { name: "Open the tournament" }).click();
  await page.waitForURL(/\/t\/[0-9a-f-]+$/);
  return page;
}

async function advance(page: Page, tournamentId: string, to: string, options: { expectError?: string } = {}) {
  await page.goto(`/t/${tournamentId}`);
  await page.getByRole("button", { name: `Move to ${to}` }).click();
  if (options.expectError) await expect(page.getByText(options.expectError)).toBeVisible();
  else await expect(page.getByRole("status")).toContainText("Phase changed.");
}

async function waitFor<T>(what: string, read: () => Promise<T | null | undefined | false>): Promise<T> {
  for (let i = 0; i < 60; i++) {
    const value = await read();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

// Per-end arrows for five archers. B and C shoot identically: a tie inside the bracket.
const ARROWS: Record<string, (string | number)[]> = {
  "Arjun Asha": ["X", 10, 10, 9, 9, 9],
  "Bina Bose": [10, 10, 9, 9, 9, 8],
  "Chetan Cheema": [10, 10, 9, 9, 9, 8],
  "Divya Das": [9, 9, 9, 8, 8, 8],
  "Esha Eapen": [8, 8, 7, 7, 6, 6],
};

test("a whole event, from setup to medals", async ({ browser }) => {
  const official = await (await browser.newContext()).newPage();
  let tournamentId = "";

  await test.step("the official signs in, names themselves and starts a tournament", async () => {
    await signInWithCode(official, OFFICIAL);
    await official.getByLabel("Full name").fill("Asha Official");
    await official.getByRole("button", { name: "Save" }).click();
    await expect(official.getByRole("status")).toContainText("Saved.");

    await official.getByLabel("Tournament name").fill(`Dry Run Open ${run}`);
    await official.getByLabel("First day").fill("2026-10-01");
    await official.getByRole("button", { name: "Create tournament" }).click();
    await official.waitForURL(/\/t\/[0-9a-f-]+\/setup$/);
    tournamentId = official.url().split("/t/")[1].split("/")[0];
  });

  await test.step("setup: one category, a top-4 bracket, published", async () => {
    await official.getByLabel("Age class").selectOption("SENIOR");
    await official.locator("form").filter({ hasText: "Add category" }).getByLabel("Elimination bracket").selectOption("4");
    await official.getByRole("button", { name: "Add category" }).click();
    await expect(official.getByRole("status")).toContainText("Category added.");

    await official.getByLabel("Show results on the public page").check();
    await official.getByRole("button", { name: "Save details" }).click();
    await expect(official.getByRole("status")).toContainText("Tournament details saved.");

    await advance(official, tournamentId, "Registration");
  });

  await test.step("people: a coach and a judge are invited by email", async () => {
    await official.goto(`/t/${tournamentId}/people`);
    for (const [email, role] of [[COACH, "COACH"], [JUDGE, "JUDGE"]]) {
      await official.getByLabel("Email address").fill(email);
      await official.getByLabel("Role").selectOption(role);
      await official.getByRole("button", { name: "Send invite" }).click();
      await expect(official.getByText(email, { exact: true })).toBeVisible();
      await expect(official.getByRole("status")).toContainText("Invite sent");
    }
  });

  const coach = await acceptInvite(browser, COACH);

  await test.step("the coach registers three archers by hand and two from a CSV, then submits", async () => {
    await coach.goto(`/t/${tournamentId}/roster`);
    for (const name of ["Arjun Asha", "Bina Bose", "Chetan Cheema"]) {
      await coach.getByLabel("Full name", { exact: true }).fill(name);
      await coach.getByRole("button", { name: "Add archer" }).click();
      // Wait for the row itself: the banner from the previous add is already on screen.
      await expect(coach.getByLabel(`Full name: ${name}`)).toBeVisible();
    }

    await coach.getByLabel(/^File/).setInputFiles({
      name: "entries.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("Name,Club,Bow,Gender,Category\nDivya Das,Tata Academy,Recurve,Men,Senior\nEsha Eapen,Tata Academy,Recurve,Men,Senior\n"),
    });
    await coach.getByRole("button", { name: "Read file" }).click();
    await coach.waitForURL(/\/imports\//);
    await coach.getByRole("button", { name: "Add these archers" }).click();
    await expect(coach.getByRole("status")).toContainText("Archers added.");

    if (!process.env.ANTHROPIC_API_KEY) {
      // Without an API key, a PDF is refused with guidance instead of failing later.
      await coach.getByLabel(/^File/).setInputFiles({ name: "entries.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n") });
      await coach.getByRole("button", { name: "Read file" }).click();
      await expect(coach.getByText("PDF import is not set up on this server yet")).toBeVisible();
    }

    await coach.getByRole("button", { name: "Submit this division" }).click();
    await expect(coach.getByRole("status")).toContainText("Division submitted.");

    const { data: archers } = await db.from("archers").select("full_name, created_via").eq("tournament_id", tournamentId);
    expect(archers).toHaveLength(5);
    expect(archers!.filter((a) => a.created_via === "CSV")).toHaveLength(2);
  });

  const judge = await acceptInvite(browser, JUDGE);

  await test.step("allocation: auto-assign targets, cover them with the judge, start qualification", async () => {
    await advance(official, tournamentId, "Target allocation");
    await official.goto(`/t/${tournamentId}/allocation`);
    await official.getByRole("button", { name: "Auto-assign archers without a target" }).click();
    await expect(official.getByRole("status")).toContainText("Targets assigned.");

    await advance(official, tournamentId, "Qualification", { expectError: "A target in use has no judge" });

    await official.goto(`/t/${tournamentId}/people`);
    await official.getByLabel("Target", { exact: true }).fill("1");
    await official.getByLabel("to target (optional)").fill("2");
    await official.getByRole("button", { name: "Assign" }).click();
    await expect(official.getByRole("status")).toContainText("Targets assigned.");

    await advance(official, tournamentId, "Qualification");
  });

  const { data: archers } = await db.from("archers").select("id, full_name, division_id").eq("tournament_id", tournamentId);
  const byName = new Map(archers!.map((a) => [a.full_name, a]));
  const divisionId = archers![0].division_id!;

  await test.step("the judge scores on the keypad, including an end entered with no signal", async () => {
    await judge.goto(`/t/${tournamentId}/score`);
    const keypadEnd = async (name: string) => {
      await judge.getByRole("button", { name: new RegExp(name) }).click();
      for (const a of ARROWS[name]) await judge.getByRole("button", { name: String(a), exact: true }).click();
      await judge.getByRole("button", { name: "Save end" }).click();
    };

    await keypadEnd("Arjun Asha");
    await waitFor("the keypad end to reach the server", async () =>
      (await db.from("ends").select("id", { count: "exact", head: true }).eq("archer_id", byName.get("Arjun Asha")!.id)).count === 1
    );
    await expect(judge.getByText("All ends sent")).toBeVisible();

    await judge.context().setOffline(true);
    await keypadEnd("Bina Bose");
    await expect(judge.getByText("No signal")).toBeVisible();
    await expect(judge.getByText("1 end waiting to send")).toBeVisible();
    expect(await db.from("ends").select("id", { count: "exact", head: true }).eq("archer_id", byName.get("Bina Bose")!.id).then((r) => r.count)).toBe(0);

    // Reloading with no signal still opens the scoring page, with the queued end kept.
    await judge.reload();
    await expect(judge.getByRole("heading", { name: "Scoring" })).toBeVisible();
    await expect(judge.getByText("1 end waiting to send")).toBeVisible();

    await judge.context().setOffline(false);
    await expect(judge.getByText("All ends sent")).toBeVisible();
    await waitFor("the offline end to reach the server", async () =>
      (await db.from("ends").select("id", { count: "exact", head: true }).eq("archer_id", byName.get("Bina Bose")!.id)).count === 1
    );
  });

  await test.step("the rest of qualification arrives through the same sync endpoint", async () => {
    const payload = [];
    for (const [name, arrows] of Object.entries(ARROWS)) {
      const first = name === "Arjun Asha" || name === "Bina Bose" ? 2 : 1;
      for (let end = first; end <= 12; end++) {
        payload.push({
          id: crypto.randomUUID(),
          tournament_id: tournamentId,
          division_id: divisionId,
          archer_id: byName.get(name)!.id,
          stage: "QUALIFICATION",
          match_id: null,
          distance_index: 0,
          end_number: end,
          arrows,
        });
      }
    }
    const res = await judge.request.post("/api/ends", { data: payload });
    const results = (await res.json()) as { result: string }[];
    expect(results.every((r) => r.result === "saved")).toBe(true);

    // Sending the same ends again is harmless: the ids are already stored.
    const retry = (await (await judge.request.post("/api/ends", { data: payload.slice(0, 3) })).json()) as { result: string }[];
    expect(retry.every((r) => r.result === "saved")).toBe(true);

    const top = await waitFor("standings for all 60 ends", async () => {
      const { data } = await db.from("results").select("qualification_total, qualification_rank, archer_id").eq("division_id", divisionId).order("qualification_rank");
      return data?.[0]?.qualification_total === 12 * 57 ? data : null;
    });
    expect(top.map((r) => r.qualification_rank)).toEqual([1, 2, 2, 4, 5]);
  });

  await test.step("the cut: a tie inside the bracket must be shot off first", async () => {
    await advance(official, tournamentId, "Cut");
    await advance(official, tournamentId, "Elimination", { expectError: "level on everything" });

    await official.goto(`/t/${tournamentId}/results`);
    await official.getByLabel("Place — Chetan Cheema").fill("1");
    await official.getByLabel("Place — Bina Bose").fill("2");
    await official.getByRole("button", { name: "Record shoot-off" }).click();
    await expect(official.getByRole("status")).toContainText("Shoot-off recorded.");

    const { data: ranked } = await db.from("results").select("archer_id, qualification_rank").eq("division_id", divisionId);
    const rankOf = (name: string) => ranked!.find((r) => r.archer_id === byName.get(name)!.id)!.qualification_rank;
    expect([rankOf("Chetan Cheema"), rankOf("Bina Bose")]).toEqual([2, 3]);

    await advance(official, tournamentId, "Elimination");
  });

  type M = { id: string; round: string; match_number: number; archer1_id: string | null; archer2_id: string | null; status: string; winner_archer_id: string | null };
  const matchRows = async () => (await db.from("matches").select("id, round, match_number, archer1_id, archer2_id, status, winner_archer_id").eq("division_id", divisionId)).data as M[];
  const ends = (m: M, archerId: string, stage: string, list: (string | number)[][]) =>
    list.map((arrows, i) => ({
      id: crypto.randomUUID(),
      tournament_id: tournamentId,
      division_id: divisionId,
      archer_id: archerId,
      stage,
      match_id: m.id,
      distance_index: 0,
      end_number: i + 1,
      arrows,
    }));
  const send = async (payload: object[]) => {
    const results = (await (await judge.request.post("/api/ends", { data: payload })).json()) as { result: string; message?: string }[];
    expect(results.filter((r) => r.result !== "saved"), JSON.stringify(results)).toEqual([]);
  };

  await test.step("semifinal 1 is won in straight sets; semifinal 2 goes to a level shoot-off", async () => {
    const semis = (await matchRows()).filter((m) => m.round === "SF").sort((a, b) => a.match_number - b.match_number);
    expect(semis).toHaveLength(2);
    const [sf1, sf2] = semis;

    await send([...ends(sf1, sf1.archer1_id!, "ELIMINATION", [[10, 10, 10], [10, 10, 10], [10, 10, 10]]), ...ends(sf1, sf1.archer2_id!, "ELIMINATION", [[9, 9, 9], [9, 9, 9], [9, 9, 9]])]);
    const level = Array.from({ length: 5 }, () => [9, 9, 9]);
    await send([...ends(sf2, sf2.archer1_id!, "ELIMINATION", level), ...ends(sf2, sf2.archer2_id!, "ELIMINATION", level)]);
    await waitFor("SF2 to need a shoot-off", async () => (await matchRows()).find((m) => m.id === sf2.id)?.status === "SHOOT_OFF");
    await send([...ends(sf2, sf2.archer1_id!, "SHOOT_OFF", [[10]]), ...ends(sf2, sf2.archer2_id!, "SHOOT_OFF", [[10]])]);

    await judge.goto(`/t/${tournamentId}/score`);
    await expect(judge.getByText("Shoot-off arrows are level")).toBeVisible();
    const secondName = archers!.find((a) => a.id === sf2.archer2_id)!.full_name;
    await judge.getByRole("button", { name: `${secondName} is closer` }).click();
    await expect(judge.getByRole("status")).toContainText("Recorded.");

    const done = await waitFor("both semifinals decided", async () => {
      const rows = await matchRows();
      return rows.filter((m) => m.round === "SF").every((m) => m.status === "COMPLETE") ? rows : null;
    });
    expect(done.find((m) => m.id === sf2.id)!.winner_archer_id).toBe(sf2.archer2_id);
  });

  await test.step("the final and the bronze match, then medals", async () => {
    const rows = await waitFor("final and bronze filled in", async () => {
      const r = await matchRows();
      return r.filter((m) => m.round === "FINAL" || m.round === "BRONZE").every((m) => m.archer1_id && m.archer2_id) ? r : null;
    });
    for (const m of rows.filter((x) => x.round === "FINAL" || x.round === "BRONZE")) {
      await send([...ends(m, m.archer1_id!, "ELIMINATION", [[10, 10, 9], [10, 10, 9], [10, 10, 9]]), ...ends(m, m.archer2_id!, "ELIMINATION", [[9, 9, 8], [9, 9, 8], [9, 9, 8]])]);
    }
    await waitFor("every match decided", async () => (await matchRows()).every((m) => m.status === "COMPLETE"));

    await advance(official, tournamentId, "Complete");
    const { data: medals } = await db.from("results").select("medal").eq("division_id", divisionId).not("medal", "is", null);
    expect(medals!.map((m) => m.medal).sort()).toEqual(["BRONZE", "GOLD", "SILVER"]);
  });

  await test.step("anyone can see the result on the public page, without signing in", async () => {
    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto(`/display/${tournamentId}`);
    await expect(visitor.getByRole("heading", { name: `Dry Run Open ${run}` })).toBeVisible();
    await expect(visitor.getByText("Gold").first()).toBeVisible();
    await expect(visitor.getByText(COACH)).toHaveCount(0);
  });

  await test.step("every phase change is in the audit log with the official's id", async () => {
    const { data: user } = await db.from("memberships").select("user_id").eq("tournament_id", tournamentId).eq("role", "ADMIN").single();
    const { data: log } = await db.from("audit_log").select("action, actor_id").eq("tournament_id", tournamentId).eq("action", "PHASE_ADVANCE");
    expect(log).toHaveLength(6);
    expect(log!.every((l) => l.actor_id === user!.user_id)).toBe(true);
  });
});
