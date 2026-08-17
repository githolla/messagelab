"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import FocusReport, { type FocusReportData } from "@/components/FocusReport";

const KEY = "fg-report";

export default function ReportPage() {
  const [data, setData] = useState<FocusReportData | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) setData(JSON.parse(raw) as FocusReportData);
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  return (
    <>
      <div className="reporthead">
        <Link href="/test" className="btn ghost">← New focus group</Link>
      </div>
      {!loaded ? (
        <section className="card"><p className="sub">Loading the report…</p></section>
      ) : data && data.reactions?.length ? (
        <FocusReport {...data} />
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
