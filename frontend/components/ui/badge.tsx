/**
 * Status pill that maps the wire-level status to a visible style.
 *
 *   pass       -> green  "Confirmed"
 *   warn       -> amber  "Needs attention"
 *   fail       -> red    (defensive - the backend doesn't currently emit it)
 *   not_checked -> slate "Verification pending"
 *   unknown    -> slate "Verification pending"
 *
 * `not_checked` / `unknown` are styled the same on purpose - the UI must
 * never imply that pending == failed.
 */
import { Check, AlertTriangle, CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { CheckStatus, Lang } from "@/lib/contract";

const STYLES: Record<CheckStatus, string> = {
  pass: "border-pass/30 bg-pass-soft text-pass",
  warn: "border-warn/30 bg-warn-soft text-warn",
  fail: "border-risk/30 bg-risk-soft text-risk",
  not_checked: "border-pending/30 bg-pending-soft text-pending",
  unknown: "border-pending/30 bg-pending-soft text-pending",
};

const LABEL_KEY: Record<CheckStatus, string> = {
  pass: "results.badges.confirmed",
  warn: "results.badges.needsAttention",
  fail: "results.badges.failLabel",
  not_checked: "results.badges.pending",
  unknown: "results.badges.pending",
};

function Icon({ status }: { status: CheckStatus }) {
  if (status === "pass") return <Check className="h-3 w-3" aria-hidden="true" />;
  if (status === "warn" || status === "fail")
    return <AlertTriangle className="h-3 w-3" aria-hidden="true" />;
  return <CircleHelp className="h-3 w-3" aria-hidden="true" />;
}

export function StatusBadge({
  status,
  lang,
  className,
}: {
  status: CheckStatus;
  lang: Lang;
  className?: string;
}) {
  const s = status === "unknown" ? "not_checked" : status;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
        STYLES[s],
        className,
      )}
      aria-label={`status: ${t(lang, LABEL_KEY[s])}`}
    >
      <Icon status={s} />
      {t(lang, LABEL_KEY[s])}
    </span>
  );
}