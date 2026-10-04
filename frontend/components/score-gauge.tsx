/**
 * Trust Score gauge.
 *
 * The colour and the verdict wording come from the backend's `verdict`, never
 * from a threshold computed here. The backend derives the verdict from the score
 * bands *and* the worst flag severity, so re-deriving it in the client would
 * print a different verdict than the API returned. See `API_CONTRACT.md` ->
 * "The trust score".
 *
 * The number is always shown with its coverage ("Based on X of 3 checks"): the
 * score only covers the checks that could actually run, so a bare number would
 * read as a whole-label verdict. A `null` score renders a dashed "pending" ring -
 * never a zero.
 */
"use client";

import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Lang, Verdict } from "@/lib/types";

interface Props {
  score: number | null;
  /** How many of the three checks fed `score` (`checks_ran` from the API). */
  checksRan: number;
  /** The API's verdict. Do not recompute this from `score`. */
  verdict: Verdict;
  lang: Lang;
  className?: string;
}

const TOTAL_CHECKS = 3;

/** Verdict -> colour + i18n key. Keyed off the API value, not off the number. */
const VERDICT_STYLE: Record<
  Exclude<Verdict, "not_checked">,
  { color: string; labelKey: string }
> = {
  low_risk: { color: "text-success", labelKey: "results.verdictLow" },
  medium_risk: { color: "text-warning", labelKey: "results.verdictMedium" },
  high_risk: { color: "text-destructive", labelKey: "results.verdictHigh" },
};

const SIZE = 220;
const STROKE = 14;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

export function ScoreGauge({ score, checksRan, verdict, lang, className }: Props) {
  const style = verdict === "not_checked" ? null : VERDICT_STYLE[verdict];

  if (score === null || !style) {
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

  const { color, labelKey } = style;
  const offset = CIRC * (1 - score / 100);
  const coverage = t(lang, "results.basedOnChecks", { n: checksRan });

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
        aria-label={`Trust score ${score} of 100 - ${t(lang, labelKey)} - ${coverage}`}
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
      {/* Always pair the number with its coverage: the score only covers the
          checks that ran, so it is not a whole-label verdict unless all 3 ran. */}
      <p className="text-xs text-muted-foreground">{coverage}</p>
      <p className={cn("text-base font-semibold", color)}>
        {t(lang, labelKey)}
      </p>
      {checksRan < TOTAL_CHECKS ? (
        <p className="text-center text-xs text-muted-foreground">
          {t(lang, "results.incompleteChecks")}
        </p>
      ) : null}
    </div>
  );
}
