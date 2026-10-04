/**
 * Trust Score gauge.
 *
 * The arc animates from 0 to its value over ~800ms (CSS transition on the
 * dashoffset). `null` shows "—" + the score-pending label so the UI is
 * honest about not having a verdict yet.
 *
 * Colour thresholds (also used by the verdict text):
 *   >= 75 -> pass  (green)  "Looks genuine"
 *   45..74 -> warn  (amber)  "Check carefully"
 *   < 45  -> risk  (red)    "High risk"
 */
"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Lang, ScoreBasis } from "@/lib/contract";

const SIZE = 240;
const STROKE = 16;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

interface Props {
  score: number | null;
  verdict?: string | null;
  basis?: ScoreBasis;
  lang: Lang;
  className?: string;
}

interface VerdictInfo {
  labelKey: string;
  /** Tailwind classes for the colour (text + arc). */
  color: string;
  stroke: string;
}

function bucket(score: number): VerdictInfo {
  if (score >= 75)
    return { labelKey: "results.verdictLooksGenuine", color: "text-pass", stroke: "stroke-pass" };
  if (score >= 45)
    return { labelKey: "results.verdictCheckCarefully", color: "text-warn", stroke: "stroke-warn" };
  return { labelKey: "results.verdictHighRisk", color: "text-risk", stroke: "stroke-risk" };
}

export function ScoreGauge({ score, verdict, basis, lang, className }: Props) {
  // Animate the score from 0 -> score when it appears.
  const [displayed, setDisplayed] = useState(0);
  useEffect(() => {
    if (score === null) {
      setDisplayed(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const dur = 800;
    const from = 0;
    const to = score;
    const tick = (now: number) => {
      const t01 = Math.min(1, (now - start) / dur);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t01, 3);
      setDisplayed(Math.round(from + (to - from) * eased));
      if (t01 < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  if (score === null) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-3 text-center",
          className,
        )}
      >
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-52 w-auto text-pending"
          role="img"
          aria-label={t(lang, "results.scorePending")}
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.2"
            strokeWidth={STROKE}
            strokeDasharray="6 10"
          />
        </svg>
        <div>
          <p className="text-5xl font-bold text-muted">—</p>
          <p className="mt-2 text-sm font-medium text-muted">
            {t(lang, "results.scorePending")}
          </p>
        </div>
      </div>
    );
  }

  const info = bucket(score);
  // The verdict string from the backend wins when present (it's the same colour
  // scheme but provides the ground truth from the server).
  const verdictLabel = (() => {
    if (verdict === "looks_genuine") return t(lang, "results.verdictLooksGenuine");
    if (verdict === "check_carefully") return t(lang, "results.verdictCheckCarefully");
    if (verdict === "high_risk") return t(lang, "results.verdictHighRisk");
    if (verdict === "not_checked") return t(lang, "results.verdictPending");
    return t(lang, info.labelKey);
  })();

  const offset = CIRC * (1 - displayed / 100);

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 text-center",
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className={cn("h-52 w-auto", info.color)}
        role="img"
        aria-label={`Trust score ${score} of 100 - ${verdictLabel}`}
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.12"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{ transition: "stroke-dashoffset 80ms linear" }}
        />
        <text
          x="50%"
          y="48%"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-ink"
          fontSize="56"
          fontWeight="700"
        >
          {displayed}
        </text>
        <text
          x="50%"
          y="68%"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-subtle"
          fontSize="14"
        >
          / 100
        </text>
      </svg>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        {t(lang, "results.scoreLabel")}
      </p>
      <p className={cn("text-lg font-semibold", info.color)}>{verdictLabel}</p>
      {basis ? (
        <p className="text-xs text-muted">
          {t(lang, "results.basedOn", {
            done: basis.done,
            total: basis.total,
          })}
        </p>
      ) : null}
    </div>
  );
}