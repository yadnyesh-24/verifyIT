/**
 * Progress bar. Mirrors shadcn API but skips the Radix progress parts and
 * uses ARIA `role="progressbar"` directly.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressProps {
  value: number; // 0-100
  className?: string;
  label?: string;
}

export function Progress({ value, className, label }: ProgressProps) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={safe}
      aria-label={label}
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
    >
      <div
        className="h-full bg-primary transition-all duration-300"
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}