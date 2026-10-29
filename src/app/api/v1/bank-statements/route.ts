import { runCreditedTask } from "@/lib/ai/credited-task";
import { MAX_OUTPUT_TOKENS, STATEMENT_INSTRUCTION, STATEMENT_SYSTEM, parseStatement, statementToStored } from "@/lib/statements/parse";
import { apiError, apiOk, authenticate, logRequest, taskError } from "@/lib/api/server";
import { readDocument, readJson } from "@/lib/api/input";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** POST /api/v1/bank-statements: every transaction from a statement PDF or photo, with balance checks. */
export async function POST(request: Request) {
  const caller = await authenticate(request);
  if (caller instanceof Response) return caller;
  const body = await readJson(request);
  if (!body) { await logRequest(caller, "bank-statements", 400); return apiError(400, "bad_json", "Send a JSON body."); }
  const doc = await readDocument(body, true);
  if ("code" in doc) { await logRequest(caller, "bank-statements", doc.status); return apiError(doc.status, doc.code, doc.message); }
  try {
    const r = await runCreditedTask({
      userId: caller.userId, workspaceId: caller.workspaceId, module: "documents", task: "bank_statement",
      idempotencyKey: caller.idempotency("statement"), params: { filename: doc.name, via: "api", key: caller.prefix },
      system: STATEMENT_SYSTEM, content: [...doc.content, { type: "text", text: STATEMENT_INSTRUCTION }],
      maxTokens: MAX_OUTPUT_TOKENS, maxInputTokens: 250_000,
      postProcess: (t) => statementToStored(parseStatement(t))
    });
    const s = parseStatement(r.text);
    await logRequest(caller, "bank-statements", 200, r.creditsCharged);
    return apiOk({
      bank: s.bank, account_last4: s.accountLast4, period_from: s.periodFrom, period_to: s.periodTo, currency: s.currency,
      opening_balance: s.opening, closing_balance: s.closing,
      totals: s.totals, checks: { rows_checked: s.checks.rowsChecked, rows_mismatched: s.checks.rowsMismatched, closing_matches: s.checks.closingMatches },
      transactions: s.txns.map((t) => ({ date: t.date, description: t.description, reference: t.ref, mode: t.mode, debit: t.debit, credit: t.credit, balance: t.balance, balance_ok: t.ok })),
      truncated: r.truncated, credits_charged: r.creditsCharged, job_id: r.jobId
    });
  } catch (err) {
    const res = taskError(err);
    await logRequest(caller, "bank-statements", res.status);
    return res;
  }
}
