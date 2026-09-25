"use server";

import { after } from "next/server";
import * as XLSX from "xlsx";
import { parseCsv, stage, stageTable, type StagedRow } from "@/lib/roster-import";
import { ActionError, refuse, requireMembership, run } from "@/server/auth";
import { openDivisions } from "@/server/imports";
import { pdfImportConfigured, readPdfRoster } from "@/server/pdf-roster";
import { createClient } from "@/server/supabase";

type Client = Awaited<ReturnType<typeof createClient>>;

const MAX_BYTES = 4 * 1024 * 1024;

function sheetTable(bytes: ArrayBuffer): string[][] {
  const book = XLSX.read(bytes, { type: "array" });
  const sheet = book.Sheets[book.SheetNames[0]];
  return sheet ? XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" }) : [];
}

async function saveRows(supabase: Client, batchId: string, rows: StagedRow[]) {
  const { error } = await supabase.from("import_rows").insert(
    rows.map((r, i) => ({
      batch_id: batchId,
      row_index: i,
      raw: r.raw as never,
      parsed: r.parsed as never,
      errors: r.errors,
      action: r.parsed.full_name ? "CREATE" : "SKIP",
    }))
  );
  return error;
}

/**
 * CSV and XLSX are read straight away. A PDF is read by Claude after the
 * response is sent; the review page refreshes until its rows arrive.
 */
export async function uploadImport(tournamentId: string, form: FormData) {
  await run(`/t/${tournamentId}/roster`, async () => {
    const { supabase, membership } = await requireMembership(tournamentId, ["COACH"]);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_BYTES) throw new ActionError("unreadable_file");

    const ext = file.name.toLowerCase().split(".").pop();
    const source = ext === "csv" ? "CSV" : ext === "xlsx" ? "XLSX" : ext === "pdf" ? "PDF" : null;
    if (!source) throw new ActionError("unreadable_file");
    if (source === "PDF" && !pdfImportConfigured()) throw new ActionError("import_unavailable");

    const divisions = await openDivisions(supabase, tournamentId);
    let rows: StagedRow[] | null = null;
    if (source !== "PDF") {
      try {
        rows = stageTable(source === "CSV" ? parseCsv(await file.text()) : sheetTable(await file.arrayBuffer()), divisions);
      } catch {
        throw new ActionError("unreadable_file");
      }
      if (rows.length === 0) throw new ActionError("no_rows");
    }

    const { data: batch, error } = await supabase
      .from("import_batches")
      .insert({
        tournament_id: tournamentId,
        membership_id: membership.id,
        source,
        original_filename: file.name.slice(0, 200),
        status: rows ? "REVIEW" : "PARSING",
        row_count: rows?.length ?? 0,
      })
      .select("id")
      .single();
    if (error) refuse(error, []);

    if (rows) {
      const rowError = await saveRows(supabase, batch.id, rows);
      if (rowError) refuse(rowError, []);
    } else {
      const pdf = Buffer.from(await file.arrayBuffer());
      after(async () => {
        const db = await createClient();
        try {
          const read = (await readPdfRoster(pdf)).map((c) => stage(c, c, divisions));
          const rowError = read.length ? await saveRows(db, batch.id, read) : null;
          if (rowError) throw new Error(rowError.message);
          await db
            .from("import_batches")
            .update(read.length ? { status: "REVIEW", row_count: read.length } : { status: "FAILED", error: "No archers found." })
            .eq("id", batch.id);
        } catch (e) {
          console.error("PDF import failed:", e);
          await db
            .from("import_batches")
            .update({ status: "FAILED", error: e instanceof Error ? e.message.slice(0, 500) : "Failed" })
            .eq("id", batch.id);
        }
      });
    }

    return { to: `/t/${tournamentId}/imports/${batch.id}` };
  });
}
