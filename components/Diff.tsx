import { wordDiff } from "@/lib/diff";

/** Inline word-level diff: additions marked, deletions struck through. */
export function DiffView({ before, after }: { before: string; after: string }) {
  const segs = wordDiff(before, after);
  return (
    <div className="diff">
      {segs.map((s, i) =>
        s.type === "same" ? (
          <span key={i}>{s.text}</span>
        ) : s.type === "add" ? (
          <ins key={i}>{s.text}</ins>
        ) : (
          <del key={i}>{s.text}</del>
        )
      )}
    </div>
  );
}
