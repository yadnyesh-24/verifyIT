/**
 * Trust Score gauge.
 *
 * Score is in [0, 100]. We color the arc with three thresholds:
 *   - score >= 75 -> success (green) + "Looks genuine"
 *   - 45 <= score < 75 -> warning (amber) + "Check carefully"
 *   - score < 45     -> destructive (red) + "High risk"
 *
 * A `null` score renders a dashed "pending" ring so the UI is honest about not
 * having a verdict yet.
 */
"use client";

import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/types";

interface Props {
  score: number | null;
  lang: Lang;
  className?: string;
}

const SIZE = 220;
const STROKE = 14;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

function bucket(score: number): {
  color: string;
  labelKey: string;
} {
  if (score >= 75) return { color: "text-success", labelKey: "results.verdictGenuine" };
  if (score >= 45) return { color: "text-warning", labelKey: "results.verdictCaution" };
  return { color: "text-destructive", labelKey: "results.verdictRisk" };
}

export function ScoreGauge({ score, lang, className }: Props) {
  if (score === null) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2",
          className,
        )}
      >
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-44 w-auto text-muted-foreground"
          role="img"
          aria-label={t(lang, "results.verdictPending")}
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.25"
            strokeWidth={STROKE}
            strokeDasharray="6 8"
          />
        </svg>
        <p className="text-sm font-medium text-muted-foreground">
          {t(lang, "results.verdictPending")}
        </p>
      </div>
    );
  }

  const { color, labelKey } = bucket(score);
  const offset = CIRC * (1 - score / 100);

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2",
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className={cn("h-44 w-auto", color)}
        role="img"
        aria-label={`Trust score ${score} of 100 - ${t(lang, labelKey)}`}
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.15"
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
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-foreground"
          fontSize="48"
          fontWeight="700"
        >
          {score}
        </text>
      </svg>
      <p className="text-sm font-medium text-muted-foreground">
        {t(lang, "results.scoreLabel")}
      </p>
      <p className={cn("text-base font-semibold", color)}>
        {t(lang, labelKey)}
      </p>
    </div>
  );
}