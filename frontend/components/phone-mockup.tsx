/**
 * The sample result shown beside the hero headline.
 *
 * Built in JSX rather than shipped as a screenshot so it stays sharp at any
 * density, restyles with the tokens, and renders in Hindi when the rest of the
 * page does. It is illustrative only - marked `aria-hidden` so a screen reader
 * does not read a fictional score of 82 as a real finding.
 */
"use client";

import { ShieldCheck, FileCheck2, ScrollText } from "lucide-react";
import { t } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

const ROWS = [
  { icon: ShieldCheck, key: "home.mockupCompany" },
  { icon: FileCheck2, key: "home.mockupLicence" },
  { icon: ScrollText, key: "home.mockupLabel" },
] as const;

export function PhoneMockup({ lang }: { lang: Lang }) {
  return (
    <div
      aria-hidden="true"
      className="w-full max-w-[280px] rotate-[-3deg] rounded-[2rem] border-[6px] border-foreground/90 bg-card p-4 shadow-mockup sm:max-w-[320px]"
    >
      <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-foreground/15" />

      <div className="flex flex-col items-center gap-2 rounded-2xl bg-success-soft/60 p-5">
        <div className="relative grid h-24 w-24 place-items-center">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              strokeWidth="9"
              className="stroke-success/15"
            />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              strokeWidth="9"
              strokeLinecap="round"
              className="stroke-success"
              strokeDasharray={2 * Math.PI * 42}
              /* 82 of 100 */
              strokeDashoffset={2 * Math.PI * 42 * 0.18}
            />
          </svg>
          <span className="absolute text-3xl font-extrabold tabular-nums text-success">
            82
          </span>
        </div>
        <p className="text-base font-bold text-success">
          {t(lang, "home.mockupVerdict")}
        </p>
      </div>

      <ul className="mt-3 space-y-2">
        {ROWS.map(({ icon: Icon, key }) => (
          <li
            key={key}
            className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <span className="text-xs font-medium leading-tight text-muted-foreground">
              {t(lang, key)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
