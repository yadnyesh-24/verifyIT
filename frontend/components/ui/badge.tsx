/**
 * Status pill.
 *
 * The wording is the whole point of this component. `not_checked` is grey and
 * reads "Verification pending" - never "Verified", never a red cross. The
 * backend returns it when a registry is not connected or a snapshot held no
 * match, which is an absence of evidence; rendering that as either a pass or a
 * failure would be the single most misleading thing this product could do.
 */
import { CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { CheckStatus, Lang } from "@/lib/types";

const STYLES: Record<CheckStatus, string> = {
  pass: "bg-success-soft text-success border-success/25",
  warn: "bg-warning-soft text-warning border-warning/30",
  not_checked: "bg-neutral-soft text-neutral border-border",
};

const ICONS: Record<CheckStatus, typeof CheckCircle2> = {
  pass: CheckCircle2,
  warn: AlertTriangle,
  not_checked: Clock,
};

const LABEL_KEYS = {
  pass: "results.statusPass",
  warn: "results.statusWarn",
  not_checked: "results.statusPending",
} as const;

export function StatusBadge({
  status,
  lang = "en",
  className,
}: {
  status: CheckStatus;
  lang?: Lang;
  className?: string;
}) {
  // An unmapped status falls back to pending rather than crashing - the same
  // rule `lib/contract.ts` applies when parsing one off the wire.
  const safe: CheckStatus = status in STYLES ? status : "not_checked";
  const Icon = ICONS[safe];
  const label = t(lang, LABEL_KEYS[safe]);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
        STYLES[safe],
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}

/** A small coloured dot for flag severity, used beside flag text. */
export function SeverityDot({
  severity,
  className,
}: {
  severity: "high" | "medium" | "low";
  className?: string;
}) {
  const colour =
    severity === "high"
      ? "bg-destructive"
      : severity === "medium"
        ? "bg-warning"
        : "bg-neutral";
  return (
    <span
      aria-hidden="true"
      className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", colour, className)}
    />
  );
}
