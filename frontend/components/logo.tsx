import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/** The teal mark plus the wordmark. `markOnly` is used inside tight layouts. */
export function Logo({
  className,
  markOnly = false,
}: {
  className?: string;
  markOnly?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-card">
        <ShieldCheck className="h-5 w-5" aria-hidden="true" />
      </span>
      {markOnly ? null : (
        <span className="text-xl font-extrabold tracking-tight text-foreground">
          Verify<span className="text-primary">IT</span>
        </span>
      )}
    </span>
  );
}
