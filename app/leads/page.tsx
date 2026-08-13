"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  SAMPLE_WEBINAR,
  SAMPLE_LEADS,
  prioritizedLeads,
  engagementScore,
  tierOf,
  recommendedNextStep,
  strategyById,
  type Lead,
  type Webinar,
  type Seniority,
  type Relationship,
} from "@/lib/leads";
import { recommend, ACTION_LABEL, FACTORS, type Action, type StrategyResult } from "@/lib/leadsim";
import type { Strategy } from "@/lib/leads";
import { draftEmail } from "@/lib/leademail";

// Actions worth surfacing in the compact funnel readout, hot → cold.
const FUNNEL: Action[] = ["meeting", "continue", "reply", "click", "read", "skim", "ignore", "unsubscribe"];

const SENIORITIES: Seniority[] = ["C-suite", "VP", "Director", "Manager", "Individual"];
const RELATIONSHIPS: Relationship[] = ["none", "opportunity", "client"];
const REL_LABEL: Record<Relationship, string> = { none: "No prior relationship", opportunity: "Open opportunity", client: "Existing client" };

function blankLead(n: number): Lead {
  return {
    id: `l-custom-${n}`,
    name: "New Attendee",
    title: "Director of Development",
    seniority: "Director",
    company: "Your Organization",
    targetAccount: false,
    relationship: "none",
    attended: true,
    pctAttended: 70,
    stayedToEnd: true,
    questionsAsked: 1,
    surveyCompleted: false,
    resourcesDownloaded: 1,
    priorWebinars: 0,
    topicSignal: "general retention",
  };
}

function signalChips(l: Lead): string[] {
  const c: string[] = [];
  c.push(l.attended ? `${l.pctAttended}% attended` : "No-show");
  if (l.stayedToEnd) c.push("Stayed to end");
  if (l.questionsAsked > 0) c.push(`${l.questionsAsked} question${l.questionsAsked > 1 ? "s" : ""}`);
  if (l.surveyCompleted) c.push(l.surveyInterest ? `Survey: ${l.surveyInterest}` : "Completed survey");
  if (l.resourcesDownloaded > 0) c.push(`${l.resourcesDownloaded} download${l.resourcesDownloaded > 1 ? "s" : ""}`);
  if (l.priorWebinars > 0) c.push(`${l.priorWebinars} prior webinar${l.priorWebinars > 1 ? "s" : ""}`);
  if (l.relationship !== "none") c.push(l.relationship === "client" ? "Existing client" : "Open opportunity");
  if (l.targetAccount) c.push("Target account");
  return c;
}

export default function LeadsPage() {
  const [view, setView] = useState<"list" | "lead">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [approved, setApproved] = useState<Record<string, string>>({}); // leadId -> strategyId

  // Editable: swap the nonprofit sample for your own audience, or dial each lead
  // to run focus-group scenarios and watch the recommendation change.
  const [leads, setLeads] = useState<Lead[]>(SAMPLE_LEADS);
  const [webinar, setWebinar] = useState<Webinar>(SAMPLE_WEBINAR);
  const [editingWebinar, setEditingWebinar] = useState(false);
  const nextId = useRef(1);

  const ordered = useMemo(() => prioritizedLeads(leads), [leads]);
  const selected = leads.find((l) => l.id === selectedId) ?? null;

  function editLead(id: string, patch: Partial<Lead>) {
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function addAttendee() {
    const l = blankLead(nextId.current++);
    setLeads((ls) => [...ls, l]);
    openLead(l.id);
  }

  // The winning strategy per lead, from the full simulation — so the list's
  // "Recommended next step" matches what the detail view will recommend.
  const winnerByLead = useMemo(() => {
    const m = new Map<string, Strategy>();
    for (const l of leads) m.set(l.id, recommend(l).winner);
    return m;
  }, [leads]);

  function openLead(id: string) {
    setSelectedId(id);
    setView("lead");
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 60);
  }

  // Group summary for the list (the "Lead List Intelligence" queue view).
  const stepCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of leads) {
      const id = (winnerByLead.get(l.id) ?? recommendedNextStep(l)).id;
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [leads, winnerByLead]);

  return (
    <>
      {view === "list" && (
        <>
          <div className="pagehead">
            <h1>Lead Personalization</h1>
            <p>
              For each webinar attendee, the audience simulation decides which follow-up is most
              likely to work — then drafts it. Pick a lead to see the recommended approach and the
              email, ready to review and approve.
            </p>
          </div>

          <section className="card">
            <div className="wb-head">
              <div style={{ flex: 1 }}>
                <div className="wb-kicker">Webinar</div>
                {editingWebinar ? (
                  <div className="wb-edit">
                    <div className="scenariogrid">
                      <label className="fld">Title
                        <input type="text" value={webinar.title} onChange={(e) => setWebinar((w) => ({ ...w, title: e.target.value }))} />
                      </label>
                      <label className="fld">Topic (used in copy)
                        <input type="text" value={webinar.topic} onChange={(e) => setWebinar((w) => ({ ...w, topic: e.target.value }))} />
                      </label>
                      <label className="fld">Date
                        <input type="date" value={webinar.date} onChange={(e) => setWebinar((w) => ({ ...w, date: e.target.value }))} />
                      </label>
                      <label className="fld">Registered
                        <input type="number" min={0} value={webinar.attendees} onChange={(e) => setWebinar((w) => ({ ...w, attendees: Math.max(0, Number(e.target.value) || 0) }))} />
                      </label>
                    </div>
                  </div>
                ) : (
                  <>
                    <h2 className="wb-title">{webinar.title}</h2>
                    <div className="wb-meta">
                      {new Date(webinar.date).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}{" "}
                      · {webinar.attendees} registered · {ordered.length} in this work queue
                    </div>
                  </>
                )}
              </div>
              <button className="btn ghost" onClick={() => setEditingWebinar((v) => !v)}>
                {editingWebinar ? "Done" : "Edit webinar"}
              </button>
            </div>
            <div className="stepstrip">
              {stepCounts.map(([id, n]) => (
                <span key={id} className={`stepchip ${id === "wait" ? "muted" : ""}`}>
                  <b>{n}</b> {strategyById(id).nextStep}
                </span>
              ))}
            </div>
            <p className="note" style={{ marginTop: 10 }}>
              Sample audience is nonprofit fundraising — edit the webinar, dial any attendee&apos;s
              signals to run a scenario, or add your own. Prioritized as a work queue, strongest
              opportunities first.
            </p>
          </section>

          <section className="card">
            <div className="fgh" style={{ marginTop: 0 }}>
              <h2 className="step" style={{ margin: 0 }}>Attendees</h2>
              <button className="btn ghost" onClick={addAttendee}>+ Add attendee</button>
            </div>
            <div className="leadtablewrap">
              <table className="leadtable">
                <thead>
                  <tr>
                    <th>Lead</th>
                    <th>Company</th>
                    <th>Engagement</th>
                    <th>Recommended next step</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {ordered.map((l) => {
                    const tier = tierOf(l);
                    const score = engagementScore(l);
                    const step = winnerByLead.get(l.id) ?? recommendedNextStep(l);
                    const done = approved[l.id];
                    return (
                      <tr key={l.id} onClick={() => openLead(l.id)} className="leadrow">
                        <td>
                          <div className="lt-name">{l.name}</div>
                          <div className="lt-sub">{l.title}</div>
                        </td>
                        <td className="lt-co">{l.company}</td>
                        <td>
                          <div className={`engcell ${tier.key}`}>
                            <span className="engbar"><span style={{ width: `${score}%` }} /></span>
                            <span className="englabel">{tier.label}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`nextstep ${step.id === "wait" ? "wait" : ""}`}>{step.nextStep}</span>
                        </td>
                        <td className="lt-act">
                          {done ? <span className="approved">✓ Approved</span> : <span className="opencue">Review →</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {view === "lead" && selected && (
        <LeadDetail
          key={selected.id}
          lead={selected}
          webinar={webinar}
          approvedStrategy={approved[selected.id]}
          onEdit={(patch) => editLead(selected.id, patch)}
          onBack={() => setView("list")}
          onApprove={(strategyId) => {
            setApproved((a) => ({ ...a, [selected.id]: strategyId }));
            setView("list");
            setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 60);
          }}
        />
      )}
    </>
  );
}

function LeadDetail({
  lead,
  webinar,
  approvedStrategy,
  onEdit,
  onBack,
  onApprove,
}: {
  lead: Lead;
  webinar: Webinar;
  approvedStrategy?: string;
  onEdit: (patch: Partial<Lead>) => void;
  onBack: () => void;
  onApprove: (strategyId: string) => void;
}) {
  const [cohortSize, setCohortSize] = useState(16);
  const rec = useMemo(() => recommend(lead, cohortSize), [lead, cohortSize]);
  const [chosen, setChosen] = useState(rec.winner.id);
  const [overridden, setOverridden] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [showScenario, setShowScenario] = useState(false);
  const [email, setEmail] = useState(() => draftEmail(lead, strategyById(rec.winner.id), webinar));
  const [aiModel, setAiModel] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const emailRef = useRef<HTMLDivElement>(null);

  const chosenStrategy = strategyById(chosen);
  const isRecommended = chosen === rec.winner.id;

  // While the user hasn't manually overridden, the chosen strategy tracks the
  // live recommendation — so dialing a scenario updates the email too.
  useEffect(() => {
    if (!overridden) setChosen(rec.winner.id);
  }, [rec.winner.id, overridden]);

  // Redraft (deterministically) whenever the chosen strategy, lead, or webinar changes.
  useEffect(() => {
    setEmail(draftEmail(lead, chosenStrategy, webinar));
    setAiModel(null);
    setNotice(null);
  }, [chosen, lead, chosenStrategy, webinar]);

  const tier = tierOf(lead);
  const maxScore = Math.max(1, ...rec.results.map((r) => r.score));

  function useRecommendation() {
    setOverridden(false);
    setChosen(rec.winner.id);
    setTimeout(() => emailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }

  async function draftWithAI() {
    setDrafting(true);
    setNotice(null);
    try {
      const resp = await fetch("/api/lead-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lead, webinar, strategyId: chosen }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      setEmail({ subject: data.subject, body: data.body });
      setAiModel(data.model ?? null);
      if (data.demo) setNotice("No API key configured — showing the built-in draft. Add ANTHROPIC_API_KEY for AI drafting.");
      else if (data.warning) setNotice("AI drafting hit an error; showing the built-in draft instead.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Draft failed.");
    } finally {
      setDrafting(false);
    }
  }

  return (
    <>
      <div className="resultshead">
        <button className="backbtn" onClick={onBack}>← Back to lead list</button>
        <div className="rh-meta">
          <b>{lead.name}</b>
          <span> · {lead.title}, {lead.company} · {webinar.title}</span>
        </div>
      </div>

      {/* Lead profile */}
      <section className="card">
        <div className="lead-profile">
          <div className={`engring ${tier.key}`}>
            <div className="engnum">{engagementScore(lead)}</div>
            <div className="englabel2">{tier.label}</div>
          </div>
          <div className="lead-sig">
            <div className="lead-name2">{lead.name}</div>
            <div className="lead-sub2">{lead.title} · {lead.company}</div>
            <div className="sigchips">
              {signalChips(lead).map((c) => (
                <span key={c} className="sigchip">{c}</span>
              ))}
            </div>
          </div>
          <button className="btn ghost" style={{ marginLeft: "auto", alignSelf: "flex-start" }} onClick={() => setShowScenario((v) => !v)} aria-pressed={showScenario}>
            {showScenario ? "Done adjusting" : "Adjust scenario"}
          </button>
        </div>

        {showScenario && (
          <div className="scenario">
            <p className="note" style={{ marginBottom: 14 }}>
              Dial this attendee&apos;s behavior to run a what-if. The recommendation, confidence,
              funnel, and email below update live.
            </p>
            <div className="scenariogrid">
              <label className="fld">Name
                <input type="text" value={lead.name} onChange={(e) => onEdit({ name: e.target.value })} />
              </label>
              <label className="fld">Title
                <input type="text" value={lead.title} onChange={(e) => onEdit({ title: e.target.value })} />
              </label>
              <label className="fld">Company
                <input type="text" value={lead.company} onChange={(e) => onEdit({ company: e.target.value })} />
              </label>
              <label className="fld">Seniority
                <select value={lead.seniority} onChange={(e) => onEdit({ seniority: e.target.value as Seniority })}>
                  {SENIORITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="fld">Relationship
                <select value={lead.relationship} onChange={(e) => onEdit({ relationship: e.target.value as Relationship })}>
                  {RELATIONSHIPS.map((r) => <option key={r} value={r}>{REL_LABEL[r]}</option>)}
                </select>
              </label>
              <label className="fld">Topic they engaged with
                <input type="text" value={lead.topicSignal} onChange={(e) => onEdit({ topicSignal: e.target.value })} />
              </label>
              <label className="fld">Attended {lead.pctAttended}%
                <input type="range" min={0} max={100} value={lead.pctAttended}
                  onChange={(e) => onEdit({ pctAttended: Number(e.target.value), attended: Number(e.target.value) > 0 })} />
              </label>
              <label className="fld">Questions asked: {lead.questionsAsked}
                <input type="range" min={0} max={6} value={lead.questionsAsked} onChange={(e) => onEdit({ questionsAsked: Number(e.target.value) })} />
              </label>
              <label className="fld">Resources downloaded: {lead.resourcesDownloaded}
                <input type="range" min={0} max={6} value={lead.resourcesDownloaded} onChange={(e) => onEdit({ resourcesDownloaded: Number(e.target.value) })} />
              </label>
              <label className="fld">Prior webinars: {lead.priorWebinars}
                <input type="range" min={0} max={6} value={lead.priorWebinars} onChange={(e) => onEdit({ priorWebinars: Number(e.target.value) })} />
              </label>
              <label className="fld">Cohort size: {cohortSize}
                <input type="range" min={8} max={40} step={2} value={cohortSize} onChange={(e) => setCohortSize(Number(e.target.value))} />
              </label>
              <div className="scentoggles">
                <label className="scentoggle"><input type="checkbox" checked={lead.attended} onChange={(e) => onEdit({ attended: e.target.checked })} /> Attended live</label>
                <label className="scentoggle"><input type="checkbox" checked={lead.stayedToEnd} onChange={(e) => onEdit({ stayedToEnd: e.target.checked })} /> Stayed to end</label>
                <label className="scentoggle"><input type="checkbox" checked={lead.surveyCompleted} onChange={(e) => onEdit({ surveyCompleted: e.target.checked })} /> Completed survey</label>
                <label className="scentoggle"><input type="checkbox" checked={lead.targetAccount} onChange={(e) => onEdit({ targetAccount: e.target.checked })} /> Target account</label>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Recommendation card */}
      <section className="card reccard">
        <div className="rec-kicker">
          Recommended approach
          {approvedStrategy && <span className="approved" style={{ marginLeft: 10 }}>✓ Approved: {strategyById(approvedStrategy).name}</span>}
        </div>
        <div className="rec-title">
          {rec.winner.title}
          <span className={`confbadge ${rec.confidence.toLowerCase()}`}>Confidence: {rec.confidence}</span>
        </div>
        <p className="rec-explain">{rec.explanation}</p>
        <div className="rec-actions">
          <button className="btn primary" onClick={useRecommendation}>Use recommendation</button>
          <button className="btn ghost" onClick={() => setShowWhy((v) => !v)} aria-pressed={showWhy}>
            {showWhy ? "Hide why" : "See why"}
          </button>
          <button className="btn ghost" onClick={() => setShowCompare((v) => !v)} aria-pressed={showCompare}>
            {showCompare ? "Hide approaches" : "Compare approaches"}
          </button>
        </div>

        {showWhy && (
          <div className="why">
            <p className="why-lead">
              The simulation exposed {rec.results[0].n} synthetic prospects matching {lead.name.split(" ")[0]}&apos;s
              behavior to each approach. Here&apos;s how the winning approach read across the cohort:
            </p>
            <div className="factorgrid">
              {FACTORS.map((f) => {
                const v = rec.results.find((r) => r.strategyId === rec.winner.id)!.factors[f.key];
                const dim = f.key === "salesResistance" || f.key === "followupFatigue";
                return (
                  <div className="factorrow" key={f.key}>
                    <span className="factorlabel">{f.label}</span>
                    <span className="factorbar">
                      <span className={dim ? "dim" : ""} style={{ width: `${(v / 5) * 100}%` }} />
                    </span>
                    <span className="factorval">{v.toFixed(1)}</span>
                  </div>
                );
              })}
            </div>
            <p className="note">Higher is better, except Sales resistance and Follow-up fatigue (shown muted).</p>
          </div>
        )}

        {showCompare && (
          <div className="compare">
            {rec.results.map((r) => (
              <ApproachRow
                key={r.strategyId}
                result={r}
                maxScore={maxScore}
                isWinner={r.strategyId === rec.winner.id}
                isChosen={r.strategyId === chosen}
                onPick={() => {
                  setOverridden(true);
                  setChosen(r.strategyId);
                  setTimeout(() => emailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
                }}
              />
            ))}
            <p className="note" style={{ marginTop: 4 }}>
              Score is the simulated expected value per prospect (replies and meetings count most;
              unsubscribes count against). Pick any approach to draft it instead.
            </p>
          </div>
        )}
      </section>

      {/* Review email */}
      <section className="card" ref={emailRef}>
        <div className="fgh">
          <h2 className="step" style={{ margin: 0 }}>Review the email</h2>
          <div className="emailtag">
            {isRecommended ? "Recommended approach" : "Manual override"} · {chosenStrategy.name}
            {aiModel ? ` · AI (${aiModel})` : ""}
          </div>
        </div>

        {chosen === "wait" ? (
          <div className="waitbox">
            <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{email.body}</p>
          </div>
        ) : (
          <div className="emaildraft">
            <label className="fld" htmlFor="subj">Subject</label>
            <input id="subj" value={email.subject} onChange={(e) => setEmail((m) => ({ ...m, subject: e.target.value }))} />
            <label className="fld" htmlFor="body" style={{ marginTop: 12 }}>Body</label>
            <textarea
              id="body"
              value={email.body}
              onChange={(e) => setEmail((m) => ({ ...m, body: e.target.value }))}
              rows={16}
            />
          </div>
        )}

        {notice && <p className="note" style={{ marginTop: 10 }}>{notice}</p>}

        <div className="runbar" style={{ marginTop: 14 }}>
          {chosen !== "wait" && (
            <>
              <button className="btn primary" onClick={() => onApprove(chosen)}>Approve &amp; queue send</button>
              <button className="btn ghost" onClick={draftWithAI} disabled={drafting}>
                {drafting ? "Drafting…" : "Draft with AI"}
              </button>
              <button className="btn ghost" onClick={() => setEmail(draftEmail(lead, chosenStrategy, webinar))}>
                Reset draft
              </button>
            </>
          )}
          {chosen === "wait" && (
            <button className="btn primary" onClick={() => onApprove("wait")}>Confirm hold</button>
          )}
        </div>
      </section>

      <p className="caveat" style={{ maxWidth: 1080, margin: "0 auto 40px" }}>
        Recommendations come from a simulated cohort of prospects with similar webinar behavior — a
        directional signal to prioritize and personalize outreach, not a prediction about the named
        individual. Every send feeds a comparison of predicted vs. actual outcomes.
      </p>
    </>
  );
}

function ApproachRow({
  result,
  maxScore,
  isWinner,
  isChosen,
  onPick,
}: {
  result: StrategyResult;
  maxScore: number;
  isWinner: boolean;
  isChosen: boolean;
  onPick: () => void;
}) {
  const s = strategyById(result.strategyId);
  const funnel = FUNNEL.filter((a) => result.actionCounts[a] > 0)
    .map((a) => `${result.actionCounts[a]} ${ACTION_LABEL[a].toLowerCase()}`)
    .slice(0, 4)
    .join(" · ");
  return (
    <button className={`approach ${isChosen ? "chosen" : ""}`} onClick={onPick}>
      <div className="ap-top">
        <span className="ap-name">
          {s.name}
          {isWinner && <span className="ap-win">Recommended</span>}
        </span>
        <span className="ap-score">{result.strategyId === "wait" ? "hold" : Math.round(result.score)}</span>
      </div>
      <div className="ap-bar">
        <span className={result.strategyId === "wait" ? "hold" : ""} style={{ width: `${Math.max(3, (result.score / maxScore) * 100)}%` }} />
      </div>
      <div className="ap-funnel">{result.strategyId === "wait" ? "No individual touch — preserve the relationship" : funnel || s.blurb}</div>
    </button>
  );
}
