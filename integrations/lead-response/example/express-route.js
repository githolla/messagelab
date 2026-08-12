// Worked example: mount the engine as a route in the Lead Response tool.
// Express + better-sqlite3, ESM. Copy the ../engine folder into your project,
// adjust the import path, and app.use(router).
//
//   import router from "./message-tests-route.js";
//   app.use(express.json({ limit: "1mb" }));
//   app.use(router);
//
// Requires ANTHROPIC_API_KEY in the server environment.

import { Router } from "express";
import Database from "better-sqlite3";
import { runTest, buildPanel } from "../engine/index.js";

const db = new Database("leadresponse.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS message_tests (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id     TEXT,
    label_a     TEXT,  copy_a  TEXT,
    label_b     TEXT,  copy_b  TEXT,
    verdict     TEXT,  headline TEXT,
    votes_a     INTEGER, votes_b INTEGER,
    faithfulness REAL,  is_demo INTEGER,
    report_json TEXT,           -- full { analysis, tally, results, faithfulness, manifest, ... }
    created_at  TEXT DEFAULT (datetime('now'))
  );
`);

const router = Router();

// POST /api/message-tests
// body: { leadId?, labelA?, labelB?, copyA, copyB, context? }
router.post("/api/message-tests", async (req, res) => {
  const { leadId = null, labelA, labelB, copyA, copyB, context = "" } = req.body || {};
  if (!copyA || !copyB) {
    return res.status(400).json({ error: "Both email versions (copyA, copyB) are required." });
  }

  const variants = {
    labelA: labelA || "Version A",
    labelB: labelB || "Version B",
    copyA,
    copyB,
  };

  try {
    const out = await runTest(variants, {
      apiKey: process.env.ANTHROPIC_API_KEY,
      context,
      panel: buildPanel(), // or a per-campaign audience loaded from SQLite
    });

    const { analysis, tally, faithfulness } = out;
    const info = db
      .prepare(
        `INSERT INTO message_tests
           (lead_id, label_a, copy_a, label_b, copy_b, verdict, headline, votes_a, votes_b, faithfulness, is_demo, report_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        leadId,
        variants.labelA,
        copyA,
        variants.labelB,
        copyB,
        analysis.verdict,
        analysis.headline,
        tally.votesA,
        tally.votesB,
        faithfulness ? faithfulness.faithfulnessRate : null,
        out.demo ? 1 : 0,
        JSON.stringify(out)
      );

    res.json({ id: info.lastInsertRowid, ...out });
  } catch (e) {
    // Surface the real cause (out-of-credits, auth, rate-limit) rather than a
    // canned message — the engine's errors already carry the status + detail.
    res.status(502).json({ error: String((e && e.message) || e) });
  }
});

// GET /api/message-tests/:id  — fetch a stored run
router.get("/api/message-tests/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM message_tests WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found." });
  res.json({ ...row, report: JSON.parse(row.report_json) });
});

export default router;
