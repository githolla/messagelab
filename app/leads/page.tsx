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
import {
  DEFAULT_AGENTS,
  newAgent,
  newPastEmail,
  type ReviewAgent,
  type PastEmail,
  type EmailReview,
  type EmailBaseline,
} from "@/lib/reviewers";
import { reviewAll, buildBaseline, summarizeReviews } from "@/lib/emailreview";

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
  const [view, setView] = useState<"list" | "lead" | "review">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [approved, setApproved] = useState<Record<string, string>>({}); // leadId -> strategyId

  // Editable: swap the nonprofit sample for your own audience, or dial each lead
  // to run focus-group scenarios and watch the recommendation change.
  const [leads, setLeads] = useState<Lead[]>(SAMPLE_LEADS);
  const [webinar, setWebinar] = useState<Webinar>(SAMPLE_WEBINAR);
  const [editingWebinar, setEditingWebinar] = useState(false);
  const nextId = useRef(1);

  // Email Review Agents: critique past emails → a baseline that conditions drafting.
  const [agents, setAgents] = useState<ReviewAgent[]>(DEFAULT_AGENTS);
  const [pastEmails, setPastEmails] = useState<PastEmail[]>([]);
  const [reviews, setReviews] = useState<EmailReview[]>([]);
  const [baseline, setBaseline] = useState<EmailBaseline | null>(null);
  const emailSeq = useRef(1);
  const agentSeq = useRef(1);

  function openReview() {
    setView("review");
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 60);
  }

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
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button className="btn ghost" onClick={openReview}>Email review agents</button>
                <button className="btn ghost" onClick={() => setEditingWebinar((v) => !v)}>
                  {editingWebinar ? "Done" : "Edit webinar"}
                </button>
              </div>
            </div>
            {baseline && (
              <div className="baselinebanner">
                <span className="bl-dot" />
                <b>Baseline active</b> — drafts follow the house style learned from {baseline.emailsReviewed} reviewed
                email{baseline.emailsReviewed > 1 ? "s" : ""} (avg {baseline.avgScore}/100).
                <button className="linklike" onClick={openReview}>Review</button>
                <button className="linklike" onClick={() => setBaseline(null)}>Clear</button>
              </div>
            )}
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
          baseline={baseline}
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

      {view === "review" && (
        <EmailReviewLab
          webinar={webinar}
          agents={agents}
          setAgents={setAgents}
          pastEmails={pastEmails}
          setPastEmails={setPastEmails}
          reviews={reviews}
          setReviews={setReviews}
          baseline={baseline}
          setBaseline={setBaseline}
          emailSeq={emailSeq}
          agentSeq={agentSeq}
          onBack={() => { setView("list"); setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 60); }}
        />
      )}
    </>
  );
}

function LeadDetail({
  lead,
  webinar,
  baseline,
  approvedStrategy,
  onEdit,
  onBack,
  onApprove,
}: {
  lead: Lead;
  webinar: Webinar;
  baseline: EmailBaseline | null;
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
        body: JSON.stringify({ lead, webinar, strategyId: chosen, baseline: baseline ?? undefined }),
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
            {baseline ? <span className="bl-chip" title="Draft with AI applies your reviewed-email baseline">Baseline on</span> : null}
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

// Two built-in past emails (one salesy/weak, one solid) so the panel demos
// instantly without typing. Deterministic, no key needed.
const SAMPLE_PAST_EMAILS: PastEmail[] = [
  {
    id: "sample-1",
    label: "Sample — promo follow-up",
    subject: "DON'T MISS this AMAZING limited-time offer!!!",
    body:
      "Hi there,\n\nWe are excited to reach out because our best-in-class solutions can help you leverage synergy and move the needle. Act now — this exclusive deal won't last! Click here to learn more, and click here to book, and click here for pricing.\n\nWe guarantee you'll love it. 100% risk-free!\n\nThanks,\nThe Team",
  },
  {
    id: "sample-2",
    label: "Sample — webinar recap",
    subject: "Thanks for joining — one resource for you",
    body:
      "Hi Jordan,\n\nGreat to have you at Thursday's session on donor retention. You asked a sharp question about second-gift timing, so I pulled the one framework we lean on for exactly that.\n\nIf it's useful, I'm happy to walk through how it maps to your program — no pitch, just a quick look. Would a 15-minute call next week work?\n\nWarmly,\nDiane Roberts\nAllegiance Group + Pursuant",
  },
];

// ---- Bulk email import parsers (pure, module scope) ----
type RawEmail = { label: string; subject: string; body: string };

// Strip RFC-822 headers when a block looks like a raw message; pull the subject.
// Handles both "headers, blank line, body" and a lone leading "Subject:" line
// with no blank separator by dropping the contiguous run of header lines.
const HEADER_RE = /^(from|to|subject|date|reply-to|cc|bcc|sent|delivered-to|message-id|return-path|received|mime-version|content-[\w-]+|x-[\w-]+):/i;
function stripHeaders(text: string): { subject: string; body: string } {
  const subj = text.match(/^subject:\s*(.*)$/im);
  const lines = text.split(/\r?\n/);
  let i = 0;
  if (HEADER_RE.test(lines[0] || "")) {
    while (i < lines.length && (HEADER_RE.test(lines[i]) || /^\s+\S/.test(lines[i]))) i++; // headers + folded continuations
    if (lines[i] !== undefined && lines[i].trim() === "") i++; // consume one blank separator
  }
  const body = lines.slice(i).join("\n").trim();
  return { subject: subj ? subj[1].trim() : "", body: body || text.trim() };
}

// mbox: messages delimited by a line beginning "From " (the mbox "From_" line).
function splitMbox(text: string): RawEmail[] {
  return text
    .split(/^From .*$/m)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p, i) => ({ label: `Message ${i + 1}`, ...stripHeaders(p) }));
}

// Minimal RFC-4180 CSV reader (handles quotes, escaped quotes, embedded newlines).
function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function parseCsv(text: string): RawEmail[] {
  const rows = csvRows(text).filter((r) => r.some((c) => c.trim()));
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const si = header.findIndex((h) => /subject/.test(h));
  const bi = header.findIndex((h) => /body|content|message|text|email/.test(h));
  const li = header.findIndex((h) => /label|name|^id$|from|recipient|to/.test(h));
  const hasHeader = si > -1 || bi > -1;
  const data = hasHeader ? rows.slice(1) : rows;
  return data.map((r, i) => ({
    label: li > -1 && r[li]?.trim() ? r[li].trim() : `Row ${i + 1}`,
    subject: si > -1 ? (r[si] || "").trim() : (r[0] || "").trim(),
    body: bi > -1 ? (r[bi] || "").trim() : (r[1] || r[0] || "").trim(),
  }));
}

// Split a pasted blob or plain-text file into multiple emails. Tries, in order:
// rule delimiters (--- === *** ###), multiple "Subject:" markers, then 2+ blank
// lines. Falls back to a single email.
function splitDelimited(text: string, label: string): RawEmail[] {
  const t = text.trim();
  if (!t) return [];
  const wrap = (parts: string[]): RawEmail[] =>
    parts.map((p) => p.trim()).filter(Boolean).map((p, i) => ({ label: `${label} #${i + 1}`, ...stripHeaders(p) }));
  if (/^\s*(?:-{3,}|={3,}|\*{3,}|#{3,})\s*$/m.test(t)) return wrap(t.split(/^\s*(?:-{3,}|={3,}|\*{3,}|#{3,})\s*$/m));
  const subj = t.match(/^subject:/gim);
  if (subj && subj.length > 1) return wrap(t.split(/(?=^subject:)/gim));
  const blocks = t.split(/\n\s*\n\s*\n+/);
  if (blocks.length > 1) return wrap(blocks);
  return [{ label, ...stripHeaders(t) }];
}

async function parseUpload(f: File): Promise<RawEmail[]> {
  const text = await f.text();
  const name = f.name.toLowerCase();
  if (name.endsWith(".mbox")) return splitMbox(text);
  if (name.endsWith(".csv")) return parseCsv(text);
  if (name.endsWith(".eml")) return [{ label: f.name, ...stripHeaders(text) }];
  return splitDelimited(text, f.name); // .txt / .md may hold many
}

function EmailReviewLab({
  webinar,
  agents,
  setAgents,
  pastEmails,
  setPastEmails,
  reviews,
  setReviews,
  baseline,
  setBaseline,
  emailSeq,
  agentSeq,
  onBack,
}: {
  webinar: Webinar;
  agents: ReviewAgent[];
  setAgents: React.Dispatch<React.SetStateAction<ReviewAgent[]>>;
  pastEmails: PastEmail[];
  setPastEmails: React.Dispatch<React.SetStateAction<PastEmail[]>>;
  reviews: EmailReview[];
  setReviews: React.Dispatch<React.SetStateAction<EmailReview[]>>;
  baseline: EmailBaseline | null;
  setBaseline: React.Dispatch<React.SetStateAction<EmailBaseline | null>>;
  emailSeq: React.MutableRefObject<number>;
  agentSeq: React.MutableRefObject<number>;
  onBack: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [computed, setComputed] = useState<EmailBaseline | null>(null);
  const [saved, setSaved] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const resultsRef = useRef<HTMLDivElement>(null);

  function toggleExpanded(id: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  const MAX_EMAILS = 300;
  const usableCount = pastEmails.filter((e) => (e.body || "").trim()).length;
  const summary = useMemo(() => summarizeReviews(reviews), [reviews]);

  function editAgent(id: string, patch: Partial<ReviewAgent>) {
    setAgents((a) => a.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }
  function editEmail(id: string, patch: Partial<PastEmail>) {
    setPastEmails((e) => e.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }
  function addEmail() {
    setPastEmails((e) => [...e, newPastEmail(emailSeq.current++)]);
  }

  // Add a batch of parsed emails, keep only those with content, cap the total.
  function addRaw(raws: RawEmail[]) {
    const useful = raws.filter((r) => (r.body || "").trim() || (r.subject || "").trim());
    if (!useful.length) {
      setNotice("No emails found in that input.");
      return;
    }
    setPastEmails((prev) => {
      const room = Math.max(0, MAX_EMAILS - prev.length);
      const added = useful.slice(0, room).map((r) => ({ id: `email-${emailSeq.current++}`, label: r.label, subject: r.subject, body: r.body }));
      const dropped = useful.length - added.length;
      setNotice(`Added ${added.length} email${added.length === 1 ? "" : "s"}.${dropped > 0 ? ` (${dropped} skipped — ${MAX_EMAILS}-email cap.)` : ""}`);
      return [...prev, ...added];
    });
  }

  async function onFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const batches = await Promise.all([...files].map((f) => parseUpload(f)));
    addRaw(batches.flat());
  }

  function addBulk() {
    addRaw(splitDelimited(bulkText, "Pasted"));
    setBulkText("");
    setBulkOpen(false);
  }

  async function run() {
    const usable = pastEmails.filter((e) => (e.body || "").trim());
    if (!usable.length) {
      setNotice("Add at least one email with body text to review.");
      return;
    }
    setRunning(true);
    setNotice(null);
    setSaved(false);
    try {
      const resp = await fetch("/api/email-review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agents, emails: usable, webinar }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      setReviews(data.reviews);
      setComputed(data.baseline);
      setModelUsed(data.model);
      if (data.demo) setNotice("No API key — deterministic review shown. Add ANTHROPIC_API_KEY for a model read.");
      else if (data.warning) setNotice("Model review hit an error; deterministic review shown instead.");
    } catch (e) {
      // Never leave the user stuck — fall back to the local deterministic engine.
      const r = reviewAll(agents, usable);
      setReviews(r);
      setComputed(buildBaseline(r, usable));
      setModelUsed(null);
      setNotice((e instanceof Error ? e.message : "Review failed") + " — showing local review.");
    } finally {
      setRunning(false);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }
  }

  return (
    <>
      <div className="resultshead">
        <button className="backbtn" onClick={onBack}>← Back to lead list</button>
        <div className="rh-meta"><b>Email Review Agents</b><span> · {webinar.title}</span></div>
      </div>

      <div className="pagehead" style={{ marginTop: 4 }}>
        <h1>Review past emails → build a baseline</h1>
        <p>
          Set your reviewer agents, drop in emails you&apos;ve sent before, and let the panel critique
          them. The distilled <b>baseline</b> then conditions every follow-up the tool drafts — so new
          emails build on what already works for you.
        </p>
      </div>

      {/* Agents */}
      <section className="card">
        <div className="fgh" style={{ marginTop: 0 }}>
          <h2 className="step" style={{ margin: 0 }}>1 · Review agents</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn ghost" onClick={() => setAgents(DEFAULT_AGENTS)}>Reset roster</button>
            <button className="btn ghost" onClick={() => setAgents((a) => [...a, newAgent(agentSeq.current++)])}>+ Add agent</button>
          </div>
        </div>
        <div className="agentgrid">
          {agents.map((a) => (
            <div className="agentcard" key={a.id}>
              <div className="agenttop">
                <span className="agentmono">{a.name.slice(0, 2).toUpperCase()}</span>
                <input className="agentname" value={a.name} onChange={(e) => editAgent(a.id, { name: e.target.value })} />
                <button className="xbtn" title="Remove agent" onClick={() => setAgents((ag) => ag.filter((x) => x.id !== a.id))}>×</button>
              </div>
              <input className="agentfocus" value={a.focus} onChange={(e) => editAgent(a.id, { focus: e.target.value })} placeholder="What it reviews" />
              <textarea className="agentinstr" value={a.instruction} onChange={(e) => editAgent(a.id, { instruction: e.target.value })} rows={3} placeholder="Describe what this agent should critique…" />
            </div>
          ))}
          {agents.length === 0 && <p className="note">No agents — add at least one to run a review.</p>}
        </div>
      </section>

      {/* Past emails */}
      <section className="card">
        <div className="fgh" style={{ marginTop: 0 }}>
          <h2 className="step" style={{ margin: 0 }}>2 · Past emails <span className="countpill">{usableCount} ready</span></h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!pastEmails.length && <button className="btn ghost" onClick={() => setPastEmails(SAMPLE_PAST_EMAILS)}>Load samples</button>}
            <label className="btn ghost filebtn">
              Upload files
              <input type="file" accept=".txt,.eml,.md,.mbox,.csv,text/plain,text/csv" multiple onChange={(e) => { onFiles(e.target.files); e.currentTarget.value = ""; }} />
            </label>
            <button className="btn ghost" onClick={() => setBulkOpen((v) => !v)} aria-pressed={bulkOpen}>Bulk paste</button>
            {pastEmails.length > 0 && <button className="btn ghost" onClick={() => setPastEmails([])}>Clear all</button>}
            <button className="btn ghost" onClick={addEmail}>+ One email</button>
          </div>
        </div>
        {!pastEmails.length && !bulkOpen && (
          <p className="note">
            Bring in a batch: select <b>many files at once</b>, drop a Gmail/Outlook <code>.mbox</code> or a{" "}
            <code>.csv</code> export (subject/body columns), or <b>Bulk paste</b> emails separated by a line of{" "}
            <code>---</code>. Or <b>Load samples</b> to see how it works.
          </p>
        )}
        {bulkOpen && (
          <div className="bulkbox">
            <label className="fld" htmlFor="bulk">Paste many emails — separate them with a line of <code>---</code> (or <code>Subject:</code> markers, or blank lines)</label>
            <textarea
              id="bulk"
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={10}
              placeholder={"Subject: First email\nHi Jordan, …\n\n---\n\nSubject: Second email\nHi Alex, …"}
            />
            <div className="runbar" style={{ marginTop: 10 }}>
              <button className="btn primary" onClick={addBulk} disabled={!bulkText.trim()}>Split &amp; add</button>
              <button className="btn ghost" onClick={() => { setBulkOpen(false); setBulkText(""); }}>Cancel</button>
            </div>
          </div>
        )}
        <div className={`emaillist ${pastEmails.length > 8 ? "compact" : ""}`}>
          {pastEmails.map((e) => {
            const words = (e.body.match(/\S+/g) || []).length;
            const isOpen = pastEmails.length <= 8 || expanded.has(e.id);
            return (
              <div className="pastemail" key={e.id}>
                <div className="pe-head">
                  <input className="pe-label" value={e.label} onChange={(ev) => editEmail(e.id, { label: ev.target.value })} />
                  <span className="pe-words">{words} words</span>
                  {pastEmails.length > 8 && (
                    <button className="linklike" onClick={() => toggleExpanded(e.id)}>{isOpen ? "Collapse" : "Edit"}</button>
                  )}
                  <button className="xbtn" title="Remove email" onClick={() => setPastEmails((es) => es.filter((x) => x.id !== e.id))}>×</button>
                </div>
                {isOpen ? (
                  <>
                    <input className="pe-subject" value={e.subject} onChange={(ev) => editEmail(e.id, { subject: ev.target.value })} placeholder="Subject line" />
                    <textarea className="pe-body" value={e.body} onChange={(ev) => editEmail(e.id, { body: ev.target.value })} rows={6} placeholder="Paste the email body here…" />
                  </>
                ) : (
                  <div className="pe-preview">
                    {e.subject ? <b>{e.subject}</b> : <span className="muted">(no subject)</span>}
                    {e.body ? ` — ${e.body.replace(/\s+/g, " ").slice(0, 110)}${e.body.length > 110 ? "…" : ""}` : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="runbar" style={{ marginTop: 14 }}>
          <button className="btn primary" onClick={run} disabled={running || !usableCount || !agents.length}>
            {running ? "Reviewing…" : `Review ${usableCount || ""} email${usableCount === 1 ? "" : "s"}`.trim()}
          </button>
          {modelUsed && <span className="note" style={{ alignSelf: "center" }}>Model: {modelUsed}</span>}
        </div>
        {notice && <p className="note" style={{ marginTop: 10 }}>{notice}</p>}
      </section>

      {/* Results */}
      {reviews.length > 0 && (
        <div ref={resultsRef}>
          {summary && (
            <section className="card summarycard">
              <div className="sum-top">
                <div className={`sum-score ${summary.avgScore >= 75 ? "hi" : summary.avgScore >= 55 ? "mid" : "lo"}`}>
                  {summary.avgScore}<span>/100</span>
                </div>
                <div className="sum-lead">
                  <h2 className="step" style={{ margin: 0 }}>Overall summary</h2>
                  <p>{summary.headline}</p>
                </div>
              </div>

              <div className="sum-grid">
                <div className="sum-block">
                  <div className="sum-h">By agent, across all {summary.emails} email{summary.emails > 1 ? "s" : ""}</div>
                  <div className="agentbars">
                    {summary.perAgent.map((a) => (
                      <div className="agentbar" key={a.agentId}>
                        <span className="ab-name">{a.agentName}</span>
                        <span className="ab-track"><span className={a.avg >= 75 ? "hi" : a.avg >= 55 ? "mid" : "lo"} style={{ width: `${a.avg}%` }} /></span>
                        <span className="ab-val">{a.avg}</span>
                      </div>
                    ))}
                  </div>
                  <p className="note" style={{ marginTop: 8 }}>
                    Best: <b>{summary.best.label}</b> ({summary.best.score}) · Weakest: <b>{summary.worst.label}</b> ({summary.worst.score})
                  </p>
                </div>

                <div className="sum-block">
                  <div className="sum-h">
                    Most common issues
                    <span className="sevtotals">
                      <span className="sev sev-high">{summary.severityCounts.high} high</span>
                      <span className="sev sev-medium">{summary.severityCounts.medium} med</span>
                      <span className="sev sev-low">{summary.severityCounts.low} low</span>
                    </span>
                  </div>
                  {summary.topIssues.length ? (
                    <ul className="issuelist">
                      {summary.topIssues.map((iss, i) => (
                        <li key={i}>
                          <span className="issue-count">{iss.count}×</span>
                          <span className={`sev sev-${iss.severity}`}>{iss.severity}</span>
                          {iss.text}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="note">No material issues flagged — these emails are in good shape.</p>
                  )}
                </div>
              </div>
            </section>
          )}
          {computed && (
            <section className="card baselinecard">
              <div className="fgh" style={{ marginTop: 0 }}>
                <h2 className="step" style={{ margin: 0 }}>Baseline</h2>
                {baseline && saved ? (
                  <span className="approved">✓ Saved — conditioning drafts</span>
                ) : (
                  <button className="btn primary" onClick={() => { setBaseline(computed); setSaved(true); }}>Use as baseline</button>
                )}
              </div>
              <p className="bl-voice"><b>Voice.</b> {computed.voice}</p>
              <div className="bl-cols">
                <div className="bl-col">
                  <div className="bl-h ok">Do</div>
                  <ul>{computed.dos.map((d, i) => <li key={i}>{d}</li>)}</ul>
                </div>
                <div className="bl-col">
                  <div className="bl-h bad">Don&apos;t</div>
                  <ul>{computed.donts.map((d, i) => <li key={i}>{d}</li>)}</ul>
                </div>
                <div className="bl-col">
                  <div className="bl-h">Structure &amp; subject</div>
                  <ul>{[...computed.structure, ...computed.subjectTips].map((d, i) => <li key={i}>{d}</li>)}</ul>
                </div>
              </div>
              <p className="note">
                Distilled from {computed.emailsReviewed} email{computed.emailsReviewed > 1 ? "s" : ""} (avg {computed.avgScore}/100).
                Once saved, &quot;Draft with AI&quot; on any lead follows this house style.
              </p>
            </section>
          )}

          {reviews.map((r) => (
            <section className="card reviewcard" key={r.emailId}>
              <div className="rev-head">
                <div>
                  <div className="rev-label">{r.label}</div>
                  <div className="rev-subj">{r.subject || <span className="muted">(no subject)</span>}</div>
                </div>
                <div className={`revscore ${r.overall >= 75 ? "hi" : r.overall >= 55 ? "mid" : "lo"}`}>{r.overall}<span>/100</span></div>
              </div>
              <div className="critlist">
                {r.critiques.map((c) => (
                  <div className="crit" key={c.agentId}>
                    <div className="crit-top">
                      <span className="crit-name">{c.agentName}</span>
                      <span className="crit-score">{c.score}</span>
                    </div>
                    <div className="crit-read">{c.read}</div>
                    {c.strengths.length > 0 && (
                      <ul className="crit-str">{c.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                    )}
                    {c.fixes.length > 0 && (
                      <ul className="crit-fix">
                        {c.fixes.map((f, i) => (
                          <li key={i}><span className={`sev sev-${f.severity}`}>{f.severity}</span> {f.text}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="caveat" style={{ maxWidth: 1080, margin: "0 auto 40px" }}>
        Reviews are a directional read from your reviewer agents, not a compliance check. The baseline
        captures patterns from the emails you provide — the more representative your samples, the better
        the house style it learns.
      </p>
    </>
  );
}
