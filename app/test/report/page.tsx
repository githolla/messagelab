"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import FocusReport, { type FocusReportData } from "@/components/FocusReport";
import FocusRounds, { type FocusRoundsData } from "@/components/FocusRounds";

const KEY = "fg-report";

// Payloads may be the new rounds shape (with round0/panel/subject) or, from a
// stale session, the older single-run shape.
type Payload = (FocusRoundsData & { round0?: unknown }) | (FocusReportData & { reactions?: unknown });

export default function ReportPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) setData(JSON.parse(raw) as Payload);
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  const rounds = data as FocusRoundsData | null;
  const legacy = data as FocusReportData | null;

  return (
    <>
      <div className="reporthead">
        <Link href="/test" className="btn ghost">← New focus group</Link>
      </div>
      {!loaded ? (
        <section className="card"><p className="sub">Loading the report…</p></section>
      ) : rounds && rounds.round0?.reactions?.length ? (
        <FocusRounds {...rounds} />
      ) : legacy && legacy.reactions?.length ? (
        <FocusReport {...legacy} />
      ) : (
        <section className="card" style={{ textAlign: "center", padding: 44 }}>
          <h2 className="step" style={{ justifyContent: "center" }}>No report yet</h2>
          <p className="sub">Run a focus group first and the analysis will open here.</p>
          <Link href="/test" className="btn primary" style={{ marginTop: 12 }}>Build a focus group →</Link>
        </section>
      )}
    </>
  );
}
