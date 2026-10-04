/**
 * Tiny status pill in the header that says whether the data comes from the
 * real backend or the bundled fixtures. A green dot = live, a grey dot = mock.
 *
 * Also subscribes to `verifyit:fallback` so a runtime failure flips the pill
 * to "Demo data" the moment we switch transports.
 */
"use client";

import { useEffect, useState } from "react";
import { CircleDot } from "lucide-react";
import { useScan } from "@/lib/scan-store";
import { useDataMode, onFallback, type ModeInfo } from "@/lib/data-mode";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function BackendStatusPill() {
  const { lang } = useScan();
  const initial = useDataMode();
  const [mode, setMode] = useState<ModeInfo>(initial);
  const initialMode = initial.mode;
  const initialResolved = initial.resolved;

  // Sync when the parent re-renders with a different resolved mode.
  useEffect(() => {
    setMode(initial);
    // initial is intentionally excluded: it is recreated on every render,
    // and we only want to mirror the value when the resolved mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode, initialResolved]);

  // React to runtime fallback events.
  useEffect(() => {
    return onFallback(() => {
      setMode({ mode: "mock", resolved: true, reason: "fallback" });
    });
  }, []);

  const isLive = mode.mode === "live";
  const label = isLive ? t(lang, "status.live") : t(lang, "status.demo");

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        isLive
          ? "border-pass/30 bg-pass-soft text-pass"
          : "border-pending/30 bg-pending-soft text-pending",
      )}
    >
      <CircleDot
        className={cn("h-3 w-3", isLive ? "text-pass" : "text-pending")}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}