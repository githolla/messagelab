"use client";

import { useEffect, useState } from "react";

// A self-running, deterministic proof of "individual agents reacting in character"
// for the landing page — no API. A room fills in, then reactions rotate through.
const SENT_COLOR: Record<string, string> = {
  love: "#2f7a3a", like: "#7fae3f", neutral: "#767c85", skeptical: "#db7f22", reject: "#b23b3b",
};
const SENT_LABEL: Record<string, string> = {
  love: "Loves it", like: "Likes it", neutral: "On the fence", skeptical: "Skeptical", reject: "Would pass",
};

const PEOPLE = [
  { name: "Bargain Hunter", seg: "Price-sensitive", sent: "like", quote: "If the discount's real, I'm in — but put the number up front." },
  { name: "Brand Loyalist", seg: "Repeat buyer", sent: "love", quote: "This feels like them. I'd click without thinking twice." },
  { name: "Skeptical Researcher", seg: "Proof-driven", sent: "skeptical", quote: "Nice claim. Where's the proof it actually delivers?" },
  { name: "First-time Visitor", seg: "New to it", sent: "neutral", quote: "I get the gist — but what happens after I sign up?" },
  { name: "Mobile Impulse Buyer", seg: "On the go", sent: "like", quote: "Fast and clear. One thumb, done — if checkout's this easy." },
];

// A fixed 30-mark room, colored to a believable spread.
const ROOM = "love,like,like,love,neutral,like,skeptical,like,love,neutral,like,skeptical,like,like,neutral,love,like,skeptical,neutral,like,love,like,reject,like,neutral,love,like,skeptical,like,love".split(",");

function mono(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase();
}

export default function RoomDemo() {
  const [idx, setIdx] = useState(0);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(m.matches);
    if (m.matches) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % PEOPLE.length), 2600);
    return () => clearInterval(t);
  }, []);

  const cur = PEOPLE[idx];

  return (
    <div className="roomdemo">
      <div className="rd-grid" aria-hidden="true">
        {ROOM.map((s, i) => (
          <span
            key={i}
            className={`rd-mark ${reduce ? "on" : "in"}`}
            style={{ background: SENT_COLOR[s], animationDelay: reduce ? undefined : `${i * 55}ms` }}
          />
        ))}
      </div>
      <div className="rd-side">
        <div className="rd-tally"><b>62%</b> positive · <span>forming a verdict…</span></div>
        <div className="rd-card" style={{ borderLeftColor: SENT_COLOR[cur.sent] }} key={idx}>
          <div className="rd-head">
            <span className="rd-av" style={{ background: SENT_COLOR[cur.sent] }}>{mono(cur.name)}</span>
            <div>
              <div className="rd-name">{cur.name}</div>
              <div className="rd-seg">{cur.seg}</div>
            </div>
            <span className="rd-pick" style={{ color: SENT_COLOR[cur.sent] }}>{SENT_LABEL[cur.sent]}</span>
          </div>
          <p className="rd-quote">&ldquo;{cur.quote}&rdquo;</p>
        </div>
        <div className="rd-dots">
          {PEOPLE.map((_, i) => <span key={i} className={i === idx ? "on" : ""} />)}
        </div>
      </div>
    </div>
  );
}
