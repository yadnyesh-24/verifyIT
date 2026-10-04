/**
 * Status pill used by Results / Review screens. Maps the wire-level status to a
 * visual style; `not_checked` is intentionally neutral (pending) so it never
 * looks like a fail.
 */
import { cn } from "@/lib/utils";
import type { CheckStatus } from "@/lib/types";

const styles: Record<CheckStatus, string> = {
  pass: "bg-success/15 text-success border-success/30",
  warn: "bg-warning/15 text-warning border-warning/40",
  fail: "bg-destructive/15 text-destructive border-destructive/40",
  not_checked: "bg-muted text-muted-foreground border-border",
  unknown: "bg-muted text-muted-foreground border-border",
};

const labels: Record<CheckStatus, { en: string; hi: string }> = {
  pass: { en: "Pass", hi: "सही" },
  warn: { en: "Caution", hi: "सावधानी" },
  fail: { en: "Fail", hi: "ग़लत" },
  not_checked: { en: "Verification pending", hi: "जाँच लंबित" },
  unknown: { en: "Verification pending", hi: "जाँच लंबित" },
};

export function StatusBadge({
  status,
  className,
  lang = "en",
}: {
  status: CheckStatus;
  className?: string;
  lang?: "en" | "hi";
}) {
  const copy = labels[status] ?? labels.not_checked;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        styles[status],
        className,
      )}
      aria-label={`status: ${copy[lang]}`}
    >
      {copy[lang]}
    </span>
  );
}