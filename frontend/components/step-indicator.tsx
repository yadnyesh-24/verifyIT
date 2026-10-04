/**
 * Three-step progress indicator at the top of every page (Scan -> Review ->
 * Result). The current route is highlighted in brand teal; completed steps
 * use a tick; upcoming steps use a numbered disc.
 */
"use client";

import { Check } from "lucide-react";
import { usePathname } from "next/navigation";
import { t } from "@/lib/i18n";
import { useScan } from "@/lib/scan-store";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "scan", paths: ["/", "/scanning"] },
  { key: "review", paths: ["/review"] },
  { key: "result", paths: ["/results"] },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

function currentStepFromPath(pathname: string | null): StepKey {
  if (!pathname) return "scan";
  if (pathname.startsWith("/results")) return "result";
  if (pathname.startsWith("/review")) return "review";
  if (pathname.startsWith("/scanning")) return "scan";
  return "scan";
}

const LABEL_KEY: Record<StepKey, string> = {
  scan: "nav.stepScan",
  review: "nav.stepReview",
  result: "nav.stepResult",
};

export function StepIndicator({ className }: { className?: string }) {
  const pathname = usePathname();
  const { lang } = useScan();
  const current = currentStepFromPath(pathname);
  const currentIdx = STEPS.findIndex((s) => s.key === current);

  return (
    <ol
      aria-label="Progress"
      className={cn("flex items-center gap-2 sm:gap-4", className)}
    >
      {STEPS.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <li
            key={s.key}
            className="flex flex-1 items-center gap-2"
            aria-current={active ? "step" : undefined}
          >
            <span
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-semibold",
                done && "border-pass/40 bg-pass-soft text-pass",
                active && "border-brand bg-brand text-brand-foreground",
                !done && !active && "border-hairline text-subtle",
              )}
              aria-hidden="true"
            >
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span
              className={cn(
                "hidden text-sm font-medium sm:inline",
                active ? "text-ink" : "text-muted",
              )}
            >
              {t(lang, LABEL_KEY[s.key])}
            </span>
            {i < STEPS.length - 1 ? (
              <span
                aria-hidden="true"
                className={cn(
                  "mx-1 h-px flex-1",
                  done ? "bg-pass/40" : "bg-hairline",
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}