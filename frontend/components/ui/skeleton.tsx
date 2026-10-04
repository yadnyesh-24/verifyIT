/**
 * Skeleton block. Uses the CSS `shimmer` keyframes from `globals.css`.
 */
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("shimmer rounded-md bg-muted", className)}
      aria-hidden="true"
    />
  );
}