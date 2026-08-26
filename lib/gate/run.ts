// The gate runner: parse both documents, run all thirty checks, tally, sort.
// Zero model calls anywhere downstream of here.

import type { GateContext, GateFinding, GateRun } from "./model";
import { sortFindings, tallyFindings } from "./model";
import { parseDoc } from "./parse";
import {
  d49, d50, d51, d52, d53, d54, d55, d56, d57, d58, d59, d60,
  d61, d62, d63, d64, d65, d66, d67, d68,
} from "./checks";
import { f81, f82, f83, f84, f85, f86, f87, f88, f89, f90 } from "./evidence";

export function runGate(proposalText: string, rfpText: string, ctx: GateContext, nowYear: number): GateRun {
  const doc = parseDoc(proposalText);
  const rfp = rfpText.trim() ? parseDoc(rfpText) : null;
  const findings: GateFinding[] = [
    d49(doc, rfp),
    d50(doc, rfp, ctx),
    d51(doc, ctx),
    d52(doc, ctx),
    d53(doc),
    d54(doc),
    d55(doc, ctx),
    d56(doc),
    d57(doc, ctx),
    d58(doc),
    d59(doc),
    d60(doc, ctx),
    d61(doc),
    d62(doc),
    d63(doc),
    d64(doc),
    d65(doc, ctx),
    d66(doc, rfp),
    d67(doc),
    d68(),
    f81(doc, ctx),
    f82(doc, ctx, nowYear),
    f83(doc, ctx),
    f84(ctx),
    f85(doc, ctx),
    f86(doc, rfp, ctx),
    f87(doc),
    f88(doc, ctx),
    f89(doc),
    f90(doc),
  ];
  return { findings: sortFindings(findings), tally: tallyFindings(findings) };
}

export interface GateDiffRow {
  id: string;
  name: string;
  a: GateFinding;
  b: GateFinding;
}

/** Side-by-side: the same suite against two drafts, row per check in id order. */
export function diffGate(a: GateRun, b: GateRun): GateDiffRow[] {
  const byId = (run: GateRun) => new Map(run.findings.map((f) => [f.id, f]));
  const ma = byId(a);
  const mb = byId(b);
  const ids = [...ma.keys()].sort((x, y) => x.localeCompare(y));
  return ids.map((id) => ({ id, name: ma.get(id)!.name, a: ma.get(id)!, b: mb.get(id)! }));
}
