"use client";

import { motion, useReducedMotion } from "framer-motion";

type Track = "gks_u" | "gks_g";

interface GraphNode {
  id: string;
  x: number;
  y: number;
  track: Track;
  /** Directly connects to the central "you" node. */
  matched: boolean;
  r: number;
}

// Fixed, hand-placed coordinates (not random) so server and client markup
// match exactly -- a scattered layout without the hydration risk of Math.random.
const NODES: GraphNode[] = [
  { id: "n1", x: 84, y: 96, track: "gks_g", matched: true, r: 7 },
  { id: "n2", x: 128, y: 234, track: "gks_u", matched: true, r: 6 },
  { id: "n3", x: 300, y: 88, track: "gks_u", matched: true, r: 7 },
  { id: "n4", x: 336, y: 210, track: "gks_g", matched: true, r: 6 },
  { id: "n5", x: 232, y: 320, track: "gks_g", matched: true, r: 7 },
  { id: "n6", x: 52, y: 200, track: "gks_u", matched: false, r: 5 },
  { id: "n7", x: 168, y: 60, track: "gks_g", matched: false, r: 5 },
  { id: "n8", x: 360, y: 130, track: "gks_u", matched: false, r: 4.5 },
  { id: "n9", x: 300, y: 300, track: "gks_u", matched: false, r: 5 },
  { id: "n10", x: 104, y: 320, track: "gks_g", matched: false, r: 4.5 },
  { id: "n11", x: 44, y: 300, track: "gks_g", matched: false, r: 4 },
  { id: "n12", x: 360, y: 300, track: "gks_g", matched: false, r: 4 },
];

const CENTER = { x: 200, y: 200 };
const TRACK_COLOR: Record<Track, string> = {
  gks_u: "var(--color-gks-u)",
  gks_g: "var(--color-gks-g)",
};

export function ConnectionGraph() {
  const reduceMotion = useReducedMotion();
  const matchedNodes = NODES.filter((n) => n.matched);
  const dur = reduceMotion ? 0 : undefined;

  return (
    <div className="relative">
      <div className="relative aspect-square w-full overflow-hidden rounded-[28px] bg-surface ring-1 ring-hairline shadow-card">
        <div className="grid-texture pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <svg viewBox="0 0 400 400" className="relative h-full w-full" role="img" aria-label="Graph showing you connected to other GKS applicants who share your track, major, or target universities">
          <g strokeLinecap="round">
            {matchedNodes.map((n, i) => (
              <motion.line
                key={`edge-${n.id}`}
                x1={CENTER.x}
                y1={CENTER.y}
                x2={n.x}
                y2={n.y}
                stroke={TRACK_COLOR[n.track]}
                strokeOpacity={0.35}
                strokeWidth={1.5}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: dur ?? 0.7, delay: reduceMotion ? 0 : 0.4 + i * 0.12, ease: "easeOut" }}
              />
            ))}
          </g>

          {NODES.map((n, i) => (
            <motion.circle
              key={n.id}
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill={TRACK_COLOR[n.track]}
              fillOpacity={n.matched ? 0.9 : 0.35}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: dur ?? 0.4, delay: reduceMotion ? 0 : 0.1 + i * 0.05, ease: "backOut" }}
              style={{ transformOrigin: `${n.x}px ${n.y}px` }}
            />
          ))}

          <motion.circle
            cx={CENTER.x}
            cy={CENTER.y}
            r={11}
            fill="var(--color-ink)"
            initial={{ scale: 0 }}
            animate={reduceMotion ? { scale: 1 } : { scale: [1, 1.12, 1] }}
            transition={
              reduceMotion
                ? { duration: 0.3 }
                : { duration: 2.6, repeat: Infinity, ease: "easeInOut", delay: 0.9 }
            }
            style={{ transformOrigin: `${CENTER.x}px ${CENTER.y}px` }}
          />
          <circle cx={CENTER.x} cy={CENTER.y} r={11} fill="none" stroke="white" strokeWidth={2} />
        </svg>

        <motion.div
          className="absolute left-[7%] top-[62%] max-w-[128px] rounded-lg bg-ink px-2.5 py-1.5 text-[11px] font-medium leading-tight text-white shadow-pop"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduceMotion ? 0 : 1.3, duration: 0.4 }}
        >
          Same major, applying GKS-U
        </motion.div>

        <motion.div
          className="absolute right-[5%] top-[16%] max-w-[132px] rounded-lg bg-ink px-2.5 py-1.5 text-[11px] font-medium leading-tight text-white shadow-pop"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduceMotion ? 0 : 1.5, duration: 0.4 }}
        >
          2 of 3 target universities match
        </motion.div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-4 text-[11px] font-medium text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: TRACK_COLOR.gks_u }} />
          GKS-U
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: TRACK_COLOR.gks_g }} />
          GKS-G
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-ink" />
          You
        </span>
      </div>
    </div>
  );
}
