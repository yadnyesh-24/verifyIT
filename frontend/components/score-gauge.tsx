/**
 * The trust-score gauge.
 *
 * Two rules from the contract are enforced here rather than at the call site,
 * so no screen can get them wrong:
 *
 * 1. **`score: null` renders an em dash, never 0.** Nothing could be checked -
 *    that is a pending state, and a zero would read as a damning verdict.
 * 2. **Colour comes from `verdict`, never from the number.** The backend floors
 *    the verdict by the worst flag severity, so a high-severity finding can
 *    return `high_risk` at a score of 60. A threshold re-implemented in the
 *    client would disagree with the API and paint that gauge green.
 */
"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { Lang, Verdict } from "@/lib/types";

const VERDICT_STYLE: Record<Verdict, { stroke: string; text: string }> = {
  low_risk: { stroke: "stroke-success", text: "text-success" },
  medium_risk: { stroke: "stroke-warning", text: "text-warning" },
  high_risk: { stroke: "stroke-destructive", text: "text-destructive" },
  not_checked: { stroke: "stroke-neutral", text: "text-neutral" },
};

const VERDICT_LABEL: Record<Verdict, Parameters<typeof t>[1]> = {
  low_risk: "results.verdictLow",
  medium_risk: "results.verdictMedium",
  high_risk: "results.verdictHigh",
  not_checked: "results.scorePending",
};

const RADIUS = 86;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ScoreGauge({
  score,
  verdict,
  checksRan,
  lang,
  className,
}: {
  score: number | null;
  verdict: Verdict;
  checksRan: number;
  lang: Lang;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const style = VERDICT_STYLE[verdict] ?? VERDICT_STYLE.not_checked;
  const pending = score === null;
  const fraction = pending ? 0 : score / 100;

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      {/* 160px on mobile, 200px from `sm` up. */}
      <div className="relative h-40 w-40 sm:h-[200px] sm:w-[200px]">
        <svg
          viewBox="0 0 200 200"
          className="h-full w-full -rotate-90"
          role="img"
          aria-label={
            pending
              ? t(lang, "results.scorePending")
              : `${t(lang, "results.trustScore")} ${score}, ${t(lang, "results.basedOn", { ran: checksRan })}`
          }
        >
          <circle
            cx="100"
            cy="100"
            r={RADIUS}
            fill="none"
            strokeWidth="14"
            className="stroke-muted"
          />
          <motion.circle
            cx="100"
            cy="100"
            r={RADIUS}
            fill="none"
            strokeWidth="14"
            strokeLinecap="round"
            className={style.stroke}
            strokeDasharray={CIRCUMFERENCE}
            initial={{ strokeDashoffset: CIRCUMFERENCE }}
            animate={{ strokeDashoffset: CIRCUMFERENCE * (1 - fraction) }}
            transition={
              reduceMotion ? { duration: 0 } : { duration: 0.9, ease: "easeOut" }
            }
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              "text-5xl font-extrabold tabular-nums tracking-tight sm:text-6xl",
              style.text,
            )}
          >
            {pending ? "—" : score}
          </span>
          <span className="mt-1 text-xs font-medium text-muted-foreground">
            {pending
              ? t(lang, "results.scorePending")
              : t(lang, "results.trustScore")}
          </span>
        </div>
      </div>

      <p className={cn("text-center text-2xl font-extrabold tracking-tight", style.text)}>
        {t(lang, VERDICT_LABEL[verdict] ?? "results.scorePending")}
      </p>

      {!pending ? (
        <p className="text-center text-sm font-medium text-muted-foreground">
          {t(lang, "results.basedOn", { ran: checksRan })}
        </p>
      ) : null}
    </div>
  );
}
